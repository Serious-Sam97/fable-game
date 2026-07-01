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
  luck: boolean;   // Amuleto da Sorte (+8% dano na fórmula do servidor)
}

export const CHAT_MAX = 200;

export type ClientMsg =
  | { t: 'state'; s: PlayerState }
  | { t: 'cast'; key: string; targetId?: number }  // validado pelo CombatSim no servidor
  | { t: 'chat'; text: string }
  | { t: 'surrender' }
  | { t: 'leaderResolve'; spare: boolean }
  | { t: 'spawnBalverine' };

export type ServerMsg =
  | { t: 'welcome'; id: number }
  | { t: 'chat'; pid: number; name: string; text: string }
  | {
      t: 'snap';
      dayT: number;
      players: Array<PlayerState & { id: number }>;
      enemies: EnemySnap[];
      events: SimEvent[];
    };
