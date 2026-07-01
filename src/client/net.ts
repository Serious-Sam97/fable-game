// Cliente de rede — conecta ao servidor Fable e sincroniza heróis + inimigos.
// Se o servidor não estiver rodando, o jogo segue solo em silêncio (sim local).
import { NET_PORT, CLIENT_SEND_HZ } from '../shared/protocol';
import type { PlayerState, ClientMsg } from '../shared/protocol';
import type { EnemySnap, SimEvent } from '../shared/sim/enemies';

export interface RemotePlayer extends PlayerState {
  id: number;
}

interface NetState {
  id: number;
  connected: boolean;
  /** último snapshot de heróis remotos (sem o próprio) */
  remotes: Map<number, RemotePlayer>;
  /** último snapshot de inimigos vindo do servidor */
  enemies: EnemySnap[];
  /** eventos de simulação acumulados desde o último drain */
  events: SimEvent[];
  /** hora do mundo do servidor (dayT) — null até o primeiro snap */
  serverDayT: number | null;
}

export const net: NetState = {
  id: 0, connected: false, remotes: new Map(),
  enemies: [], events: [], serverDayT: null,
};

let ws: WebSocket | null = null;
let sendTimer: ReturnType<typeof setInterval> | null = null;

export function sendMsg(m: ClientMsg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

export function drainEvents(): SimEvent[] {
  const ev = net.events;
  net.events = [];
  return ev;
}

export function connectNet(getState: () => PlayerState, onConnectCb?: (id: number) => void) {
  const open = () => {
    try {
      ws = new WebSocket(`ws://${location.hostname}:${NET_PORT}`);
    } catch {
      return; // sem servidor — modo solo
    }
    ws.onopen = () => {
      net.connected = true;
      if (sendTimer) clearInterval(sendTimer);
      sendTimer = setInterval(() => sendMsg({ t: 'state', s: getState() }), 1000 / CLIENT_SEND_HZ);
    };
    ws.onmessage = (ev) => {
      let m: any;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        net.id = m.id;
        onConnectCb?.(m.id);
      } else if (m.t === 'snap') {
        net.serverDayT = m.dayT;
        net.enemies = m.enemies;
        if (m.events.length) net.events.push(...m.events);
        const seen = new Set<number>();
        for (const p of m.players) {
          if (p.id === net.id) continue;
          seen.add(p.id);
          net.remotes.set(p.id, p);
        }
        for (const id of [...net.remotes.keys()]) {
          if (!seen.has(id)) net.remotes.delete(id);
        }
      }
    };
    ws.onclose = () => {
      const was = net.connected;
      net.connected = false;
      net.remotes.clear();
      net.enemies = [];
      net.events = [];
      net.serverDayT = null;
      if (sendTimer) { clearInterval(sendTimer); sendTimer = null; }
      // tenta reconectar de tempos em tempos (servidor pode subir depois)
      setTimeout(open, was ? 2000 : 8000);
    };
    ws.onerror = () => { /* onclose cuida do retry */ };
  };
  open();
}
