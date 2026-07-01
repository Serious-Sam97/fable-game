// Servidor Fable — Fase 1a: autoritativo para inimigos e hora do mundo.
// Roda a MESMA simulação do cliente solo (src/shared/sim) — todos veem os mesmos inimigos.
// Rodar: npm run server  (porta 8787)
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { EnemySim } from '../src/shared/sim/enemies';
import { smoothstep } from '../src/shared/math';
import { NET_PORT, SERVER_SNAP_HZ, SERVER_TICK_HZ, DAY_LEN } from '../src/shared/protocol';
import type { PlayerState, ClientMsg } from '../src/shared/protocol';

const sim = new EnemySim();
let dayT = 0.09; // manhã em Albion
const pendingEvents: ReturnType<EnemySim['drainEvents']> = [];

const players = new Map<number, { ws: WebSocket; state: PlayerState | null }>();
let nextId = 1;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Fable server ok — heróis online: ${players.size}, inimigos vivos: ${[...sim.enemies.values()].filter((e) => e.state !== 'dead').length}\n`);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const id = nextId++;
  players.set(id, { ws, state: null });
  ws.send(JSON.stringify({ t: 'welcome', id }));
  console.log(`[+] herói #${id} conectou (${req.socket.remoteAddress}) — online: ${players.size}`);

  ws.on('message', (data) => {
    let m: ClientMsg;
    try { m = JSON.parse(data.toString()); } catch { return; }
    switch (m.t) {
      case 'state':
        if (m.s && typeof m.s.x === 'number') {
          const p = players.get(id);
          if (p) p.state = m.s;
        }
        break;
      // TODO Fase 1b: validar alcance/cooldown/dano no servidor em vez de confiar no cliente
      case 'hit': sim.applyDamage(m.id, m.dmg, id); break;
      case 'knock': sim.knock(m.id, m.kx, m.kz); break;
      case 'slow': sim.castSlow(); break;
      case 'surrender': sim.surrenderLeader(); break;
      case 'leaderResolve': sim.resolveLeader(m.spare, id); break;
      case 'spawnBalverine': sim.spawnBalverine(); break;
    }
  });

  ws.on('close', () => {
    players.delete(id);
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
  const evs = sim.drainEvents();
  if (evs.length) pendingEvents.push(...evs);
}, 1000 / SERVER_TICK_HZ);

// ---- snapshots ----
setInterval(() => {
  if (players.size === 0) { pendingEvents.length = 0; return; }
  const snapPlayers = [];
  for (const [pid, p] of players) {
    if (p.state) snapPlayers.push({ id: pid, ...p.state });
  }
  const msg = JSON.stringify({
    t: 'snap', dayT,
    players: snapPlayers,
    enemies: sim.serialize(),
    events: pendingEvents.splice(0, pendingEvents.length),
  });
  for (const [, p] of players) {
    if (p.ws.readyState === 1) p.ws.send(msg);
  }
}, 1000 / SERVER_SNAP_HZ);

httpServer.listen(NET_PORT, () => {
  console.log(`Fable server autoritativo ouvindo em http/ws://localhost:${NET_PORT}`);
  console.log(`inimigos na simulação: ${sim.enemies.size}`);
});
