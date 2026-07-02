// Servidor Fable — autoritativo para inimigos, hora do mundo e combate (hot reload via tsx watch).
// O cliente pede um cast; range, cooldown e dano são validados/calculados aqui
// pelo mesmo CombatSim que roda no cliente em modo solo.
// Rodar: npm run server  (porta 8787)
import { createServer } from 'node:http';
import pg from 'pg';
import { WebSocketServer, type WebSocket } from 'ws';
import { EnemySim } from '../src/shared/sim/enemies';
import { CombatSim } from '../src/shared/sim/combat';
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

const players = new Map<number, { ws: WebSocket; state: PlayerState | null; charName: string | null }>();
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
  players.set(id, { ws, state: null, charName: null });
  ws.send(JSON.stringify({ t: 'welcome', id }));
  console.log(`[+] herói #${id} conectou (${req.socket.remoteAddress}) — online: ${players.size}`);

  ws.on('message', async (data) => {
    let m: ClientMsg;
    try { m = JSON.parse(data.toString()); } catch { return; }
    const p = players.get(id);
    if (!p) return;
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
        combat.cast(
          {
            id, x: s.x, z: s.z,
            lvl: clamp(s.lvl, 1, 60), luck: !!s.luck,
            // atributos declarados pelo cliente, mas presos a faixas sãs
            str: clamp(s.str, 0, 50), skl: clamp(s.skl, 0, 50), wil: clamp(s.wil, 0, 50),
            wpnKind: s.wpnKind === 'bow' || s.wpnKind === 'staff' ? s.wpnKind : 'melee',
            wpnDmg: clamp(s.wpnDmg, 0.5, 3.0),
            wpnRange: clamp(s.wpnRange, 2, 30),
            spellMult: clamp(s.spellMult, 1, 1.6),
            critBonus: clamp(s.critBonus, 0, 0.15),
            chainBonus: clamp(s.chainBonus, 0, 1),
          },
          String(m.key),
          typeof m.targetId === 'number' ? m.targetId : undefined,
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
      case 'surrender': sim.surrenderLeader(); break;
      case 'leaderResolve': sim.resolveLeader(!!m.spare, id); break;
      case 'spawnBalverine': sim.spawnBalverine(); break;
    }
  });

  ws.on('close', () => {
    const name = players.get(id)?.state?.name;
    players.delete(id);
    if (name) broadcast({ t: 'chat', pid: 0, name: 'Albion', text: `${name} deixou o mundo` });
    console.log(`[-] herói #${id} saiu — online: ${players.size}`);
  });
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
    if (p.state) views.push({ id: pid, x: p.state.x, z: p.state.z, dead: !!p.state.dead });
  }
  sim.update(dt, views, nightF);
  combat.update(dt);
  const evs = sim.drainEvents();
  for (const ev of evs) {
    if (ev.t === 'eatk') combat.notePlayerHit(ev.pid); // apanhou → multiplicador zera
  }
  if (evs.length) pendingEvents.push(...evs);
}, 1000 / SERVER_TICK_HZ);

// ---- snapshots ----
setInterval(() => {
  if (players.size === 0) { pendingEvents.length = 0; return; }
  const snapPlayers = [];
  for (const [pid, p] of players) {
    if (p.state) snapPlayers.push({ id: pid, ...p.state });
  }
  broadcast({
    t: 'snap', dayT,
    players: snapPlayers,
    enemies: sim.serialize(),
    events: pendingEvents.splice(0, pendingEvents.length),
  });
}, 1000 / SERVER_SNAP_HZ);

httpServer.listen(NET_PORT, () => {
  console.log(`Fable server autoritativo (combate validado) em http/ws://localhost:${NET_PORT}`);
  console.log(`inimigos na simulação: ${sim.enemies.size}`);
});
