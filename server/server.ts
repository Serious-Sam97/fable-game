// Servidor Fable — autoritativo para inimigos, hora do mundo e combate (hot reload via tsx watch).
// O cliente pede um cast; range, cooldown e dano são validados/calculados aqui
// pelo mesmo CombatSim que roda no cliente em modo solo.
// Rodar: npm run server  (porta 8787)
import { createServer } from 'node:http';
import pg from 'pg';
import { WebSocketServer, type WebSocket } from 'ws';
import { EnemySim } from '../src/shared/sim/enemies';
import { CombatSim } from '../src/shared/sim/combat';
import { PERK_ALL } from '../src/shared/defs/abilities';
import { smoothstep } from '../src/shared/math';
import { NET_PORT, SERVER_SNAP_HZ, SERVER_TICK_HZ, DAY_LEN, CHAT_MAX, NAME_MAX, SAVE_MAX_BYTES } from '../src/shared/protocol';
import type { PlayerState, ClientMsg } from '../src/shared/protocol';

// ---- persistência: Postgres (personagens por nome; TODO Fase 2: contas com senha) ----
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://fable:fable@localhost:5434/fable',
});
pool.on('error', (e) => console.warn('pg pool:', e.message));
let dbReady = false;
(async function initDb() {
  for (let i = 0; i < 45; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS characters (
        name TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      dbReady = true;
      console.log('Postgres conectado — persistência de personagens ativa');
      return;
    } catch {
      if (i === 0) console.log('aguardando Postgres…');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.warn('Postgres indisponível — servidor rodando SEM persistência');
})();

function cleanName(raw: unknown): string {
  return String(raw ?? '').replace(/[<>&"']/g, '').trim().slice(0, NAME_MAX) || 'Sem-Nome';
}

const sim = new EnemySim();
const combat = new CombatSim(sim);
let dayT = 0.09; // manhã em Albion
const pendingEvents: ReturnType<EnemySim['drainEvents']> = [];

// Fase 32: timing registrado por herói — o servidor sabe QUANDO cada um esquivou/bloqueou/carregou
// (validação de i-frames/parry com folga é a Fase 33). Tempos em segundos (relógio do servidor).
interface PlayerTiming {
  iframeUntil: number; blocking: boolean; blockStart: number;
  charging: '' | 'bow' | 'spell' | 'flourish'; chargeStart: number;
  lastDodge: number; // p/ rate-limit anti dodge-infinito (Fase 37)
  lastChargeKind: string; lastChargeDur: number; lastChargeAt: number; // hold real da última carga — anti carga-instantânea (Fase 37)
}
const players = new Map<number, { ws: WebSocket; state: PlayerState | null; charName: string | null; timing: PlayerTiming; lastSeen: number }>();
const DISCONNECT_TIMEOUT = 15; // segundos sem mensagem → conexão morta, remove o fantasma (Fase 38)

// Fase 38: remoção LIMPA de um herói — tira do mundo, zera o estado per-pid do CombatSim (mult/combo/
// cooldowns/projéteis, sem leak nem estado velho), fecha o socket e avisa. Reusada por close/timeout/dedup.
function dropPlayer(pid: number, reason: string) {
  const p = players.get(pid);
  if (!p) return;
  const name = p.state?.name ?? p.charName;
  players.delete(pid);
  combat.removePlayer(pid);
  try { p.ws.close(); } catch { /* já fechando */ }
  if (name) broadcast({ t: 'chat', pid: 0, name: 'Albion', text: `${name} ${reason}` });
  console.log(`[-] herói #${pid} removido (${reason}) — online: ${players.size}`);
}
const srvNow = () => performance.now() / 1000; // relógio do servidor em segundos
const PARRY_TOL = 0.15;    // folga de latência ±150ms (co-op tolerante, não rollback) — Fase 33
const PARRY_WINDOW = 0.3;  // janela de parry a partir do início do bloqueio — Fase 33
const LAG_COMP = 0.15;     // rebobina inimigos ~150ms (interp 100ms + ~meia-latência) p/ hit justo — Fase 35
// Fase 37: anti-cheat — janelas de carga (batem com o cliente) + folga de latência
const BOW_FULL_DRAW = 0.7, SPELL_L2 = 0.35, SPELL_L3 = 0.8, FLOURISH_TIME = 0.5;
const MIN_DODGE_GAP = 0.33;   // esquivas mais rápidas que isto = forjadas (dodge infinito)
const CHARGE_TOL = 0.18;      // folga no hold declarado (latência/jitter)
const newTiming = (): PlayerTiming => ({ iframeUntil: 0, blocking: false, blockStart: 0, charging: '', chargeStart: 0, lastDodge: -9, lastChargeKind: '', lastChargeDur: 0, lastChargeAt: -9 });
let nextId = 1;

function broadcast(obj: unknown) {
  const msg = JSON.stringify(obj);
  for (const [, p] of players) {
    if (p.ws.readyState === 1) p.ws.send(msg);
  }
}

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Fable server ok — heróis online: ${players.size}, inimigos vivos: ${[...sim.enemies.values()].filter((e) => e.state !== 'dead').length}\n`);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const id = nextId++;
  players.set(id, { ws, state: null, charName: null, timing: newTiming(), lastSeen: srvNow() });
  ws.send(JSON.stringify({ t: 'welcome', id }));
  console.log(`[+] herói #${id} conectou (${req.socket.remoteAddress}) — online: ${players.size}`);

  ws.on('message', async (data) => {
    let m: ClientMsg;
    try { m = JSON.parse(data.toString()); } catch { return; }
    const p = players.get(id);
    if (!p) return;
    p.lastSeen = srvNow(); // Fase 38: heartbeat — qualquer mensagem mantém a conexão viva
    switch (m.t) {
      case 'state':
        if (m.s && typeof m.s.x === 'number') {
          const first = p.state === null;
          p.state = m.s;
          if (first) broadcast({ t: 'chat', pid: 0, name: 'Albion', text: `${m.s.name} entrou no mundo` });
        }
        break;
      case 'login': {
        const name = cleanName(m.name);
        // Fase 38: reconexão — se o MESMO nome já está conectado (fantasma da sessão anterior), remove-o
        // antes, pra não duplicar o herói nem herdar estado velho.
        for (const [oid, op] of players) {
          if (oid !== id && op.charName === name) { dropPlayer(oid, 'reconectou de outro lugar'); }
        }
        p.charName = name;
        let data: unknown = null;
        if (dbReady) {
          try {
            if (m.fresh) {
              await pool.query('DELETE FROM characters WHERE name = $1', [name]);
            } else {
              const r = await pool.query('SELECT data FROM characters WHERE name = $1', [name]);
              data = r.rows[0]?.data ?? null;
            }
          } catch (e) { console.warn('db login falhou:', (e as Error).message); }
        }
        ws.send(JSON.stringify({ t: 'loginOk', data }));
        console.log(`[${id}] login "${name}" — ${data ? 'personagem carregado' : 'novo personagem'}${m.fresh ? ' (reset)' : ''}`);
        break;
      }
      case 'save': {
        if (!p.charName || typeof m.data !== 'object' || m.data === null || !dbReady) break;
        const json = JSON.stringify(m.data);
        if (json.length > SAVE_MAX_BYTES) break;
        pool.query(
          `INSERT INTO characters (name, data, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (name) DO UPDATE SET data = excluded.data, updated_at = now()`,
          [p.charName, json],
        ).catch((e) => console.warn('db save falhou:', e.message));
        break;
      }
      case 'cast': {
        const s = p.state;
        if (!s || s.dead) break;
        const clamp = (v: unknown, a: number, b: number) => Math.min(b, Math.max(a, Number(v) || 0));
        // Fase 37: valida carga/nível/flourish/dir contra o HOLD REAL cronometrado (anti carga-instantânea).
        // WebSocket é ordenado → o 'charge off' chega ANTES do cast, então lastChargeDur é fresco e confiável.
        const t = p.timing, tn = srvNow();
        const recent = (k: string) => t.lastChargeKind === k && tn - t.lastChargeAt < 0.6;
        const dirOk = typeof m.dir === 'number' && isFinite(m.dir) ? m.dir : undefined; // sanitiza a direção
        let acCharge = clamp(m.charge, 0, 1);
        if (acCharge > 0.05) acCharge = Math.min(acCharge, (recent('bow') ? Math.min(1, t.lastChargeDur / BOW_FULL_DRAW) : 0) + CHARGE_TOL);
        let acLevel = clamp(m.level, 1, 3);
        if (acLevel > 1) { const h = recent('spell') ? t.lastChargeDur : 0; acLevel = Math.min(acLevel, h >= SPELL_L3 - CHARGE_TOL ? 3 : h >= SPELL_L2 - CHARGE_TOL ? 2 : 1); }
        let acFlourish = m.flourish === true;
        if (acFlourish && !(recent('flourish') && t.lastChargeDur >= FLOURISH_TIME - CHARGE_TOL)) acFlourish = false;
        // Fase 27: arma DESTE ataque (intercalar melee/arco) — se veio no cast, sobrepõe a equipada; senão usa a equipada
        const wo = m.wpn && typeof m.wpn === 'object' ? m.wpn : null;
        const wKind = wo ? wo.k : s.wpnKind;
        const wDmg = wo ? wo.d : s.wpnDmg;
        const wRange = wo ? wo.r : s.wpnRange;
        const wKnock = wo ? wo.kn : s.wpnKnock;
        combat.cast(
          {
            id, x: s.x, z: s.z,
            lvl: clamp(s.lvl, 1, 60), luck: !!s.luck,
            // atributos declarados pelo cliente, mas presos a faixas sãs
            str: clamp(s.str, 0, 50), skl: clamp(s.skl, 0, 50), wil: clamp(s.wil, 0, 50),
            wpnKind: wKind === 'bow' || wKind === 'staff' ? wKind : 'melee',
            wpnDmg: clamp(wDmg, 0.5, 3.0),
            wpnRange: clamp(wRange, 2, 30),
            wpnKnock: clamp(wKnock, 0, 3), // Fase 16

            spellMult: clamp(s.spellMult, 1, 1.6),
            critBonus: clamp(s.critBonus, 0, 0.15),
            chainBonus: clamp(s.chainBonus, 0, 1),
            perks: (typeof s.perks === 'number' ? s.perks : 0) & PERK_ALL, // Fase 45: bits de moveset, mascarados a 0..7
          },
          String(m.key),
          typeof m.targetId === 'number' ? m.targetId : undefined,
          dirOk, // facing sanitizado (Fase 11/37)
          acFlourish, // flourish validado contra o hold (Fase 13/37)
          acCharge, // tensão do arco validada contra o hold (Fase 21/37)
          acLevel, // nível da magia validado contra o hold (Fase 23/37)
          LAG_COMP, // Fase 35: rebobina os inimigos ~150ms (o atacante os viu no passado) — hit justo
        );
        break;
      }
      case 'chat': {
        const text = String(m.text ?? '').trim().slice(0, CHAT_MAX);
        if (!text) break;
        broadcast({ t: 'chat', pid: id, name: p.state?.name ?? `Herói ${id}`, text });
        break;
      }
      case 'stun': {
        // parry: só vale se o herói está colado no inimigo
        const s = p.state;
        const e = sim.enemies.get(Number(m.id));
        if (s && e && Math.hypot(e.x - s.x, e.z - s.z) < 4.5) sim.stun(e.id, 1.5);
        break;
      }
      // Fase 32/37: registra o timing E rejeita entradas forjadas (dodge infinito, carga instantânea)
      case 'dodge': {
        const now = srvNow();
        if (now - p.timing.lastDodge < MIN_DODGE_GAP) break; // Fase 37: esquiva rápida demais = forjada → descarta
        p.timing.lastDodge = now;
        const dur = Math.min(1, Math.max(0, Number(m.dur) || 0.45));
        p.timing.iframeUntil = now + dur; // herói invulnerável até aqui
        break;
      }
      case 'block': {
        p.timing.blocking = !!m.on;
        if (m.on) p.timing.blockStart = srvNow(); // início do bloqueio → janela de parry (Fase 33)
        break;
      }
      case 'charge': {
        const kind = m.kind === 'bow' || m.kind === 'spell' || m.kind === 'flourish' ? m.kind : '';
        if (m.on) { p.timing.charging = kind; p.timing.chargeStart = srvNow(); }
        else { // soltou → registra o HOLD REAL (o servidor cronometrou) p/ validar o cast (Fase 37)
          if (kind && p.timing.charging === kind) { p.timing.lastChargeKind = kind; p.timing.lastChargeDur = srvNow() - p.timing.chargeStart; p.timing.lastChargeAt = srvNow(); }
          p.timing.charging = '';
        }
        break;
      }
      case 'surrender': sim.surrenderLeader(); break;
      case 'leaderResolve': sim.resolveLeader(!!m.spare, id); break;
      case 'spawnBalverine': sim.spawnBalverine(); break;
      case 'spawnShadowKnight': sim.spawnShadowKnight(); break;
      case 'spawnMalachi': sim.spawnMalachi(); break;
    }
  });

  ws.on('close', () => dropPlayer(id, 'deixou o mundo')); // Fase 38: remoção limpa (zera estado do CombatSim)
  ws.on('error', () => { /* evita crash em reset de conexão */ });
});

// ---- simulação ----
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  dayT = (dayT + dt / DAY_LEN) % 1;
  const nightF = smoothstep(0.02, 0.28, -Math.sin(dayT * Math.PI * 2));
  const views = [];
  for (const [pid, p] of players) {
    if (p.state) views.push({ id: pid, x: p.state.x, z: p.state.z, dead: !!p.state.dead, wanted: !!p.state.wanted });
  }
  sim.update(dt, views, nightF);
  combat.update(dt);
  const evs = sim.drainEvents();
  // Fase 33: valida i-frames (dodge) e parry/block do ALVO com folga ±150ms — nega/reflete/reduz o dano.
  // Usa o PlayerTiming registrado na Fase 32. "Folga, não rollback" (co-op PvE tolerante).
  const tNow = srvNow();
  for (const ev of evs) {
    if ((ev.t === 'eatk' || ev.t === 'eland') && ev.dmg > 0) {
      const p = players.get(ev.pid);
      if (p) {
        if (tNow <= p.timing.iframeUntil + PARRY_TOL) {
          ev.dmg = 0; ev.blk = 'dodge';                       // esquivou (i-frames) → nega
        } else if (p.timing.blocking) {
          if (tNow - p.timing.blockStart <= PARRY_WINDOW + PARRY_TOL) {
            ev.dmg = 0; ev.blk = 'parry'; sim.stun(ev.id, 1.5); // aparou → reflete: atordoa o atacante
          } else {
            ev.dmg = Math.round(ev.dmg * 0.4); ev.blk = 'block'; // bloqueou → reduz 60%
          }
        }
      }
    }
    if ((ev.t === 'eatk' || ev.t === 'eland') && ev.dmg > 0) combat.notePlayerHit(ev.pid); // só zera o multiplicador se o golpe LANDOU
  }
  if (evs.length) pendingEvents.push(...evs);
}, 1000 / SERVER_TICK_HZ);

// ---- snapshots (Fase 39: interest management — cada herói recebe só os inimigos no seu raio) ----
const INTEREST_R2 = 140 * 140; // 140u cobre o alcance do minimapa (~134u) e do render; além disso, corta banda
setInterval(() => {
  if (players.size === 0) { pendingEvents.length = 0; return; }
  const snapPlayers = [];
  for (const [pid, p] of players) {
    if (p.state) snapPlayers.push({ id: pid, ...p.state });
  }
  const allEnemies = sim.serialize();
  const events = pendingEvents.splice(0, pendingEvents.length);
  // per-player: só serializa (na verdade, filtra) os inimigos perto DAQUELE herói → banda cai muito
  for (const [, p] of players) {
    if (!p.state || p.ws.readyState !== 1) continue;
    const px = p.state.x, pz = p.state.z;
    const near = allEnemies.filter((e) => (e.x - px) * (e.x - px) + (e.z - pz) * (e.z - pz) < INTEREST_R2);
    p.ws.send(JSON.stringify({ t: 'snap', dayT, players: snapPlayers, enemies: near, events }));
  }
}, 1000 / SERVER_SNAP_HZ);

// ---- Fase 38: heartbeat/timeout — remove fantasmas de conexões mortas (disconnect abrupto sem 'close')
setInterval(() => {
  const now = srvNow();
  for (const [pid, p] of players) {
    if (now - p.lastSeen > DISCONNECT_TIMEOUT) dropPlayer(pid, 'perdeu a conexão');
  }
}, 5000);

httpServer.listen(NET_PORT, () => {
  console.log(`Fable server autoritativo (combate validado) em http/ws://localhost:${NET_PORT}`);
  console.log(`inimigos na simulação: ${sim.enemies.size}`);
});
