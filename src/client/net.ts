// Cliente de rede — conecta ao servidor Fable e sincroniza heróis + inimigos.
// Se o servidor não estiver rodando, o jogo segue solo em silêncio (sim local).
import { NET_PORT, CLIENT_SEND_HZ } from '../shared/protocol';
import type { PlayerState, ClientMsg } from '../shared/protocol';
import type { EnemySnap, SimEvent } from '../shared/sim/enemies';

export interface RemotePlayer extends PlayerState {
  id: number;
}

// Fase 31: interpolação de entidade — renderiza ~100ms no passado, entre os dois snapshots que cercam
// o renderTime. Buffer curto de posições por entidade, carimbado com performance.now() (ms, monotônico).
export const INTERP_DELAY_MS = 100;   // atraso de render (buffer de interpolação)
const HIST_MS = 500;                  // janela de histórico mantida por entidade
interface Sample { t: number; x: number; z: number; ry: number }

interface NetState {
  id: number;
  connected: boolean;
  /** último snapshot de heróis remotos (sem o próprio) — dados não-posicionais (hp/estado/carga) */
  remotes: Map<number, RemotePlayer>;
  /** último snapshot de inimigos vindo do servidor */
  enemies: EnemySnap[];
  /** histórico de posições p/ interpolação (Fase 31): 'e'+id inimigos, 'p'+id heróis */
  hist: Map<string, Sample[]>;
  /** banda dos snapshots (KB/s), média móvel — p/ decidir se 30Hz cabe (Fase 31) */
  snapKbps: number;
  /** eventos de simulação acumulados desde o último drain */
  events: SimEvent[];
  /** mensagens de chat acumuladas desde o último drain */
  chat: Array<{ pid: number; name: string; text: string }>;
  /** hora do mundo do servidor (dayT) — null até o primeiro snap */
  serverDayT: number | null;
  /** posição autoritativa do PRÓPRIO herói vinda do servidor (Fase 34) — p/ reconciliação */
  selfAuth: { x: number; z: number } | null;
}

export const net: NetState = {
  id: 0, connected: false, remotes: new Map(),
  enemies: [], hist: new Map(), snapKbps: 0, events: [], chat: [], serverDayT: null, selfAuth: null,
};

// amostra a posição interpolada da entidade no renderTime (ms). Retorna null se não há histórico.
function angLerp(a: number, b: number, f: number) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * f; }
export function sampleEntity(key: string, renderT: number): Sample | null {
  const h = net.hist.get(key);
  if (!h || h.length === 0) return null;
  if (h.length === 1 || renderT <= h[0].t) return h[0];
  const last = h[h.length - 1];
  if (renderT >= last.t) return last; // buffer esfomeado → segura no mais novo (sem extrapolar)
  for (let i = h.length - 1; i > 0; i--) {
    const a = h[i - 1], b = h[i];
    if (renderT >= a.t && renderT <= b.t) {
      const f = b.t > a.t ? (renderT - a.t) / (b.t - a.t) : 0;
      return { t: renderT, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, ry: angLerp(a.ry, b.ry, f) };
    }
  }
  return last;
}
function pushHist(key: string, now: number, x: number, z: number, ry: number) {
  let h = net.hist.get(key);
  if (!h) { h = []; net.hist.set(key, h); }
  h.push({ t: now, x, z, ry });
  const cut = now - HIST_MS;
  while (h.length > 2 && h[0].t < cut) h.shift(); // mantém pelo menos 2 p/ interpolar
}

let ws: WebSocket | null = null;
let sendTimer: ReturnType<typeof setInterval> | null = null;
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : 0); // relógio monotônico (ms)
let accBytes = 0, lastBw = 0; // acumuladores de banda (Fase 31)

export function sendMsg(m: ClientMsg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

export function drainEvents(): SimEvent[] {
  const ev = net.events;
  net.events = [];
  return ev;
}

export function drainChat() {
  const c = net.chat;
  net.chat = [];
  return c;
}

export interface NetCallbacks {
  /** credenciais enviadas a cada (re)conexão — fresh descarta o personagem no servidor */
  login: () => { name: string; fresh: boolean };
  /** dados do personagem vindos do servidor (null = personagem novo) */
  onLogin?: (data: unknown | null) => void;
  onConnect?: (id: number) => void;
}

export function connectNet(getState: () => PlayerState, cbs: NetCallbacks) {
  const open = () => {
    try {
      // Em produção (HTTPS via Cloudflare) o socket sobe num subdomínio dedicado
      // com wss. Precisa ser de nível único (fable-ws.serious-sam.dev) porque o
      // certificado Universal SSL da Cloudflare não cobre *.fable.serious-sam.dev.
      const url = location.protocol === 'https:'
        ? `wss://fable-ws.serious-sam.dev`
        : `ws://${location.hostname}:${NET_PORT}`;
      ws = new WebSocket(url);
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
        cbs.onConnect?.(m.id);
        sendMsg({ t: 'login', ...cbs.login() });
      } else if (m.t === 'loginOk') {
        cbs.onLogin?.(m.data ?? null);
      } else if (m.t === 'chat') {
        net.chat.push({ pid: m.pid, name: m.name, text: m.text });
      } else if (m.t === 'snap') {
        net.serverDayT = m.dayT;
        net.enemies = m.enemies;
        if (m.events.length) net.events.push(...m.events);
        // Fase 31: carimba as posições no buffer de interpolação (renderiza ~100ms no passado)
        const now = perfNow();
        const live = new Set<string>();
        for (const e of m.enemies) { const k = 'e' + e.id; pushHist(k, now, e.x, e.z, e.ry); live.add(k); }
        const seen = new Set<number>();
        for (const p of m.players) {
          if (p.id === net.id) { net.selfAuth = { x: p.x, z: p.z }; continue; } // Fase 34: posição autoritativa própria
          seen.add(p.id);
          net.remotes.set(p.id, p);
          const k = 'p' + p.id; pushHist(k, now, p.x, p.z, p.ry); live.add(k);
        }
        for (const id of [...net.remotes.keys()]) {
          if (!seen.has(id)) net.remotes.delete(id);
        }
        for (const k of [...net.hist.keys()]) if (!live.has(k)) net.hist.delete(k); // limpa histórico de quem sumiu
        // banda: bytes do snap → média móvel de KB/s (Fase 31: medir se 30Hz cabe)
        accBytes += ev.data.length; const dtb = now - lastBw;
        if (dtb >= 1000) { net.snapKbps = net.snapKbps * 0.5 + (accBytes / 1024) * (1000 / dtb) * 0.5; accBytes = 0; lastBw = now; }
      }
    };
    ws.onclose = () => {
      const was = net.connected;
      net.connected = false;
      net.remotes.clear();
      net.enemies = [];
      net.hist.clear();
      net.snapKbps = 0;
      net.events = [];
      net.chat = [];
      net.serverDayT = null;
      net.selfAuth = null;
      if (sendTimer) { clearInterval(sendTimer); sendTimer = null; }
      // tenta reconectar de tempos em tempos (servidor pode subir depois)
      setTimeout(open, was ? 2000 : 8000);
    };
    ws.onerror = () => { /* onclose cuida do retry */ };
  };
  open();
}
