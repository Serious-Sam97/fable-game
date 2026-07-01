// Cliente de rede — conecta ao servidor Fable e sincroniza heróis.
// Se o servidor não estiver rodando, o jogo segue solo em silêncio.
import { NET_PORT, CLIENT_SEND_HZ } from '../shared/protocol';
import type { PlayerState } from '../shared/protocol';

export interface RemotePlayer extends PlayerState {
  id: number;
}

interface NetState {
  id: number;
  connected: boolean;
  /** último snapshot de heróis remotos (sem o próprio) */
  remotes: Map<number, RemotePlayer>;
}

export const net: NetState = { id: 0, connected: false, remotes: new Map() };

let ws: WebSocket | null = null;
let sendTimer: ReturnType<typeof setInterval> | null = null;
let onConnect: ((id: number) => void) | null = null;

export function connectNet(getState: () => PlayerState, onConnectCb?: (id: number) => void) {
  onConnect = onConnectCb ?? null;
  const open = () => {
    try {
      ws = new WebSocket(`ws://${location.hostname}:${NET_PORT}`);
    } catch {
      return; // sem servidor — modo solo
    }
    ws.onopen = () => {
      net.connected = true;
      if (sendTimer) clearInterval(sendTimer);
      sendTimer = setInterval(() => {
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ t: 'state', s: getState() }));
        }
      }, 1000 / CLIENT_SEND_HZ);
    };
    ws.onmessage = (ev) => {
      let m: any;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        net.id = m.id;
        onConnect?.(m.id);
      } else if (m.t === 'snap') {
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
      if (sendTimer) { clearInterval(sendTimer); sendTimer = null; }
      // tenta reconectar de tempos em tempos (servidor pode subir depois)
      setTimeout(open, was ? 2000 : 8000);
    };
    ws.onerror = () => { /* onclose cuida do retry */ };
  };
  open();
}
