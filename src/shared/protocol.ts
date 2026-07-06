// Protocolo cliente ↔ servidor — Fase 1a: servidor autoritativo para inimigos.
// Próximo passo (roadmap 1b): snapshots binários com delta compression.
import type { EnemySnap, SimEvent } from './sim/enemies';

export const NET_PORT = 8787;
export const CLIENT_SEND_HZ = 12;   // envios de estado por segundo
export const SERVER_SNAP_HZ = 30;   // snapshots por segundo (Fase 31: 15→30 p/ movimento suave + interpolação de entidade)
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
  wpnKnock: number;    // multiplicador do empurrão da arma (Fase 16)
  spellMult: number;
  critBonus: number;   // talento Olho Mortal (clampado 0..0.15)
  chainBonus: number;  // talento Tormenta (clampado 0..1)
  perks: number;       // Fase 45: talentos que mudam o moveset (bitfield clampado 0..7 no servidor)
  // armadura equipada (só visual para os outros; defesa é aplicada localmente)
  aHead: string;
  aChest: string;
  aLegs: string;
  aBoots: string;
  wanted: boolean;   // procurado — guardas o perseguem
  // carga/mira remota (Fase 29) — esqueleto p/ o Bloco D consumir: ver o aliado tensionando/carregando.
  // A mira é o próprio `ry` (o herói encara a câmera). `casting` = ação em carga, `castCharge` = 0..1.
  casting?: '' | 'bow' | 'spell' | 'flourish';
  castCharge?: number;
}

export const CHAT_MAX = 200;

export const NAME_MAX = 16;
export const SAVE_MAX_BYTES = 8192;

export type ClientMsg =
  | { t: 'state'; s: PlayerState }
  | { t: 'login'; name: string; fresh: boolean }   // fresh = "Novo Jogo": descarta o personagem salvo
  | { t: 'save'; data: unknown }                   // blob de progresso persistido por nome no SQLite
  | { t: 'cast'; key: string; targetId?: number; dir?: number; flourish?: boolean; charge?: number; level?: number; wpn?: { k: string; d: number; r: number; kn: number } }  // dir = facing (Fase 11); flourish = golpe carregado (Fase 13); charge 0..1 = tensão do arco (Fase 21); level 1..3 = carga da magia (Fase 23); wpn = arma DESTE ataque p/ intercalar melee/arco (Fase 27); validado pelo CombatSim
  | { t: 'stun'; id: number }                      // parry — servidor valida proximidade
  // Fase 32: mensagens de TIMING — o servidor registra QUANDO cada herói esquivou/bloqueou/carregou
  // (a validação de i-frames/parry com folga ±150ms é a Fase 33). O servidor carimba na chegada.
  | { t: 'dodge'; dur: number }                    // esquivei — i-frames duram `dur`s
  | { t: 'block'; on: boolean }                    // bloqueio ligado/desligado (segura Q)
  | { t: 'charge'; kind: 'bow' | 'spell' | 'flourish'; on: boolean } // carga começou/terminou
  | { t: 'chat'; text: string }
  | { t: 'surrender' }
  | { t: 'leaderResolve'; spare: boolean }
  | { t: 'spawnBalverine' }
  | { t: 'spawnShadowKnight' }
  | { t: 'spawnMalachi' };

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
