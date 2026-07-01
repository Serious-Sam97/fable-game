// Servidor Fable — Fase 1b: autoritativo para inimigos, hora do mundo e COMBATE.
// O cliente pede um cast; range, cooldown e dano são validados/calculados aqui
// pelo mesmo CombatSim que roda no cliente em modo solo.
// Rodar: npm run server  (porta 8787)
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { WebSocketServer, type WebSocket } from 'ws';
import { EnemySim } from '../src/shared/sim/enemies';
import { CombatSim } from '../src/shared/sim/combat';
import { smoothstep } from '../src/shared/math';
import { NET_PORT, SERVER_SNAP_HZ, SERVER_TICK_HZ, DAY_LEN, CHAT_MAX, NAME_MAX, SAVE_MAX_BYTES } from '../src/shared/protocol';
import type { PlayerState, ClientMsg } from '../src/shared/protocol';

// ---- persistência (personagens por nome; TODO Fase 2: contas com senha) ----
const db = new Database(fileURLToPath(new URL('./fable.db', import.meta.url)));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS characters (
  name TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);
const getChar = db.prepare('SELECT data FROM characters WHERE name = ?');
const putChar = db.prepare(`INSERT INTO characters (name, data, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
const delChar = db.prepare('DELETE FROM characters WHERE name = ?');

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

  ws.on('message', (data) => {
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
        if (m.fresh) delChar.run(name);
        const row = getChar.get(name) as { data: string } | undefined;
        let data: unknown = null;
        if (row) { try { data = JSON.parse(row.data); } catch { data = null; } }
        ws.send(JSON.stringify({ t: 'loginOk', data }));
        console.log(`[${id}] login "${name}" — ${data ? 'personagem carregado' : 'novo personagem'}${m.fresh ? ' (reset)' : ''}`);
        break;
      }
      case 'save': {
        if (!p.charName || typeof m.data !== 'object' || m.data === null) break;
        const json = JSON.stringify(m.data);
        if (json.length > SAVE_MAX_BYTES) break;
        putChar.run(p.charName, json, Date.now());
        break;
      }
      case 'cast': {
        const s = p.state;
        if (!s || s.dead) break;
        combat.cast(
          { id, x: s.x, z: s.z, lvl: s.lvl, luck: !!s.luck },
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
