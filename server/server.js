// Servidor Fable — Fase 1 prova de vida: eco de posições entre clientes.
// Roadmap 1a: este processo vai rodar a simulação compartilhada (sim/) e virar autoritativo.
// Rodar: npm run server  (porta 8787)

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = 8787;
const SNAP_MS = 66; // ~15 Hz

/** @type {Map<number, { ws: import('ws').WebSocket, state: object | null }>} */
const players = new Map();
let nextId = 1;

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Fable server ok — heróis online: ${players.size}\n`);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const id = nextId++;
  players.set(id, { ws, state: null });
  ws.send(JSON.stringify({ t: 'welcome', id }));
  console.log(`[+] herói #${id} conectou (${req.socket.remoteAddress}) — online: ${players.size}`);

  ws.on('message', (data) => {
    try {
      const m = JSON.parse(data.toString());
      if (m.t === 'state' && m.s && typeof m.s.x === 'number') {
        const p = players.get(id);
        if (p) p.state = m.s;
      }
    } catch {
      /* mensagem inválida — ignora */
    }
  });

  ws.on('close', () => {
    players.delete(id);
    console.log(`[-] herói #${id} saiu — online: ${players.size}`);
  });
  ws.on('error', () => { /* evita crash em reset de conexão */ });
});

// snapshot broadcast — clientes removem quem não aparece
setInterval(() => {
  if (players.size === 0) return;
  const snap = [];
  for (const [id, p] of players) {
    if (p.state) snap.push({ id, ...p.state });
  }
  const msg = JSON.stringify({ t: 'snap', players: snap });
  for (const [, p] of players) {
    if (p.ws.readyState === 1) p.ws.send(msg);
  }
}, SNAP_MS);

httpServer.listen(PORT, () => {
  console.log(`Fable server ouvindo em http/ws://localhost:${PORT}`);
});
