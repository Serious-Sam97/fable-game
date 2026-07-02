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
  // disciplinas (Fable: você vira o que você usa) — clampadas no servidor
  str: number;
  skl: number;
  wil: number;
  // arma equipada — key para o visual dos outros clientes, números para o CombatSim
  wpn: string;
  wpnKind: 'melee' | 'bow' | 'staff';
  wpnDmg: number;
  wpnRange: number;
  spellMult: number;
}

export const CHAT_MAX = 200;

export const NAME_MAX = 16;
export const SAVE_MAX_BYTES = 8192;

export type ClientMsg =
  | { t: 'state'; s: PlayerState }
  | { t: 'login'; name: string; fresh: boolean }   // fresh = "Novo Jogo": descarta o personagem salvo
  | { t: 'save'; data: unknown }                   // blob de progresso persistido por nome no SQLite
  | { t: 'cast'; key: string; targetId?: number }  // validado pelo CombatSim no servidor
  | { t: 'chat'; text: string }
  | { t: 'surrender' }
  | { t: 'leaderResolve'; spare: boolean }
  | { t: 'spawnBalverine' };

export type ServerMsg =
  | { t: 'welcome'; id: number }
  | { t: 'loginOk'; data: unknown | null }         // personagem salvo (ou null se novo)
  | { t: 'chat'; pid: number; name: string; text: string }
  | {
      t: 'snap';
      dayT: number;
      players: Array<PlayerState & { id: number }>;
      enemies: EnemySnap[];
      events: SimEvent[];
    };
