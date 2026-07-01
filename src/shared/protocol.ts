// Protocolo cliente ↔ servidor — Fase 1 (prova de vida: eco de posições).
// Próximo passo (roadmap 1b): snapshots binários com delta compression.

export const NET_PORT = 8787;
export const CLIENT_SEND_HZ = 12;   // envios de estado por segundo
export const SERVER_SNAP_HZ = 15;   // snapshots por segundo

/** estado que cada cliente publica sobre seu herói */
export interface PlayerState {
  x: number;
  z: number;
  ry: number;      // rotação Y do herói
  name: string;
  lvl: number;
  moving: boolean; // para animar pernas dos heróis remotos
  halo: boolean;
  horns: boolean;
}

export type ClientMsg =
  | { t: 'state'; s: PlayerState };

export type ServerMsg =
  | { t: 'welcome'; id: number }
  | { t: 'snap'; players: Array<PlayerState & { id: number }> };
