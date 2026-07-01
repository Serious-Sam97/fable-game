// Definições de habilidades — dados e fórmulas compartilhados cliente ↔ servidor.
// O cliente usa para UI/pré-validação; o servidor (CombatSim) é quem decide o dano.

export interface AbilityDef {
  key: string;
  cost: number;      // vontade — debitada no cliente (autolimitante; TODO validar na Fase 2)
  cd: number;        // cooldown em segundos
  range: number;     // 0 = sem alvo / área ao redor do herói
  needTarget: boolean;
}

export const ABILITIES: Record<string, AbilityDef> = {
  golpe:      { key: 'golpe', cost: 0, cd: 0, range: 3.8, needTarget: true },
  bola:       { key: 'bola', cost: 20, cd: 3.5, range: 30, needTarget: true },
  relampago:  { key: 'relampago', cost: 25, cd: 6, range: 28, needTarget: true },
  empurrao:   { key: 'empurrao', cost: 20, cd: 8, range: 0, needTarget: false },
  tempolento: { key: 'tempolento', cost: 35, cd: 22, range: 0, needTarget: false },
  cura:       { key: 'cura', cost: 25, cd: 8, range: 0, needTarget: false },
};

export const GCD = 1.0;             // global cooldown no cliente
export const FIREBALL_SPEED = 26;   // velocidade do projétil (visual e agendamento do dano)
export const PUSH_RADIUS = 8;
export const PUSH_FORCE = 16;
export const CHAIN_RADIUS = 9;
export const CHAIN_MAX = 2;

/** fórmula única de dano — mult = multiplicador de combate (0..25), luck = Amuleto da Sorte */
export function abilityDamage(key: string, lvl: number, mult: number, luck: boolean): number {
  const m = (1 + Math.min(mult, 25) * 0.03) * (luck ? 1.08 : 1);
  switch (key) {
    case 'golpe': return Math.round((12 + lvl * 3 + Math.random() * 8) * m);
    case 'bola': return Math.round((20 + lvl * 4 + Math.random() * 10) * m);
    case 'relampago': return Math.round((16 + lvl * 4 + Math.random() * 8) * m);
    case 'empurrao': return Math.round((8 + lvl * 2) * m);
    default: return 0;
  }
}
