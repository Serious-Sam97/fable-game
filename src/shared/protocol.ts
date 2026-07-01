// Protocolo cliente ↔ servidor — Fase 1a: servidor autoritativo para inimigos.
// Próximo passo (roadmap 1b): snapshots binários com delta compression.
import type { EnemySnap, SimEvent } from './sim/enemies';

export const NET_PORT = 8787;
export const CLIENT_SEND_HZ = 12;   // envios de estado por segundo
export const SERVER_SNAP_HZ = 15;   // snapshots por segundo
export const SERVER_TICK_HZ = 30;   // passos de simulação por segundo
export const DAY_LEN = 300;         // segundos por dia (mesmo valor do cliente)

/** estado que cada cliente publica sobre seu herói */
export interface PlayerState {
  x: number;
  z: number;
  ry: number;      // rotação Y do herói
  name: string;
  lvl: number;
  moving: boolean; // para animar pernas dos heróis remotos
  dead: boolean;
  halo: boolean;
  horns: boolean;
}

export type ClientMsg =
  | { t: 'state'; s: PlayerState }
  | { t: 'hit'; id: number; dmg: number }          // TODO Fase 1b: validar dano no servidor
  | { t: 'knock'; id: number; kx: number; kz: number }
  | { t: 'slow' }
  | { t: 'surrender' }
  | { t: 'leaderResolve'; spare: boolean }
  | { t: 'spawnBalverine' };

export type ServerMsg =
  | { t: 'welcome'; id: number }
  | {
      t: 'snap';
      dayT: number;
      players: Array<PlayerState & { id: number }>;
      enemies: EnemySnap[];
      events: SimEvent[];
    };
