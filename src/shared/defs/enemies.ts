// Definições de inimigos — dados puros, compartilhados entre cliente e servidor.
// Os modelos 3D (makers) ficam no cliente; o servidor usará só estes números (Fase 1).

export interface EnemyDef {
  name: string;
  lvl: number;
  hp: number;
  dmg: [number, number];
  xp: number;
  gold: [number, number];
  renown: number;
  speed: number;
  aggro: number;
  atkR: number;
  atkCd: number;
  icon: string;
  plateH: number;
  respawn: number;
  ranged?: boolean;  // ataca de longe e mantém distância (kite)
  minR?: number;     // distância mínima que o atirador tenta manter
  healer?: boolean;  // cura aliados feridos em vez de lutar
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  besouro: {
    name: 'Besouro Colossal', lvl: 1, hp: 26, dmg: [2, 4], xp: 20, gold: [1, 3],
    renown: 0, speed: 3.6, aggro: 9, atkR: 1.5, atkCd: 1.4, icon: '🪲', plateH: 1.0, respawn: 12,
  },
  lobo: {
    name: 'Lobo Sombrio', lvl: 3, hp: 90, dmg: [6, 10], xp: 50, gold: [0, 2],
    renown: 1, speed: 5.4, aggro: 13, atkR: 2.2, atkCd: 1.5, icon: '🐺', plateH: 1.7, respawn: 20,
  },
  bandido: {
    name: 'Bandido', lvl: 4, hp: 130, dmg: [9, 14], xp: 70, gold: [8, 16],
    renown: 1, speed: 4.6, aggro: 14, atkR: 2.3, atkCd: 1.7, icon: '🗡️', plateH: 2.7, respawn: 24,
  },
  arqueiro: {
    name: 'Bandido Arqueiro', lvl: 5, hp: 95, dmg: [8, 13], xp: 80, gold: [8, 16],
    renown: 1, speed: 4.4, aggro: 17, atkR: 16, atkCd: 2.2, icon: '🏹', plateH: 2.7, respawn: 26,
    ranged: true, minR: 7,
  },
  xama: {
    name: 'Xamã Hobbe', lvl: 4, hp: 70, dmg: [4, 7], xp: 75, gold: [6, 12],
    renown: 1, speed: 4.0, aggro: 12, atkR: 1.9, atkCd: 1.8, icon: '🪄', plateH: 2.1, respawn: 28,
    healer: true,
  },
  chefe: {
    name: 'Rufião, Chefe Bandido', lvl: 6, hp: 240, dmg: [12, 18], xp: 150, gold: [30, 40],
    renown: 3, speed: 4.8, aggro: 14, atkR: 2.4, atkCd: 1.5, icon: '💀', plateH: 2.8, respawn: 0,
  },
  hobbe: {
    name: 'Hobbe', lvl: 3, hp: 85, dmg: [7, 11], xp: 55, gold: [4, 9],
    renown: 1, speed: 4.2, aggro: 12, atkR: 1.9, atkCd: 1.5, icon: '👺', plateH: 2.0, respawn: 22,
  },
  balverine: {
    name: 'Balverine Ancião', lvl: 9, hp: 620, dmg: [16, 24], xp: 420, gold: [90, 120],
    renown: 12, speed: 6.4, aggro: 26, atkR: 2.8, atkCd: 1.6, icon: '👹', plateH: 4.4, respawn: 0,
  },
};

// inimigos que "olham" pelo eixo +X (quadrúpedes/besouros); humanoides olham por +Z
export const FACE_X_TYPES = ['lobo', 'besouro'];
