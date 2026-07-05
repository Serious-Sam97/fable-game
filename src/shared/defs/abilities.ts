// Definições de habilidades — dados e fórmulas compartilhados cliente ↔ servidor.
// O cliente usa para UI/pré-validação; o servidor (CombatSim) é quem decide o dano.

export interface AbilityDef {
  key: string;
  cost: number;      // vontade — debitada no cliente (autolimitante; TODO validar na Fase 2)
  cd: number;        // cooldown em segundos
  range: number;     // 0 = sem alvo / área ao redor do herói; golpe usa o alcance da ARMA
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
export const ARROW_SPEED = 42;
export const PUSH_RADIUS = 8;
export const PUSH_FORCE = 16;
export const CHAIN_RADIUS = 9;
export const CHAIN_MAX = 2;

/** atributos de combate do herói — Fable: você vira o que você usa */
export interface CombatStats {
  lvl: number;        // nível geral
  str: number;        // Força (melee)
  skl: number;        // Habilidade (arco / crítico)
  wil: number;        // Vontade (magia)
  luck: boolean;      // Amuleto da Sorte
  wpnKind: 'melee' | 'bow' | 'staff';
  wpnDmg: number;     // mult da arma × raridade × talentos
  wpnRange: number;   // alcance do ataque básico
  wpnKnock: number;   // multiplicador do empurrão da arma (Fase 16)
  spellMult: number;  // cajados e talentos amplificam magia
  critBonus: number;  // talento Olho Mortal (0..0.15)
  chainBonus: number; // talento Tormenta (+1 cadeia no relâmpago)
}

export const critChance = (skl: number, bonus = 0) => Math.min(0.45, 0.05 + skl * 0.015 + bonus);
export const discSource = (key: string, wpnKind: string): 'melee' | 'ranged' | 'magic' =>
  key === 'golpe' ? (wpnKind === 'bow' ? 'ranged' : 'melee') : 'magic';

/** fórmula única de dano — mult = multiplicador de combate (0..25) */
export function abilityDamage(key: string, c: CombatStats, mult: number): { dmg: number; crit: boolean } {
  const m = (1 + Math.min(mult, 25) * 0.03) * (c.luck ? 1.08 : 1);
  let base = 0;
  switch (key) {
    case 'golpe':
      base = c.wpnKind === 'bow'
        ? (10 + c.lvl * 2 + c.skl * 2.5 + Math.random() * 6) * c.wpnDmg
        : (12 + c.lvl * 2 + c.str * 2.5 + Math.random() * 8) * c.wpnDmg;
      break;
    case 'bola': base = (18 + c.lvl * 2 + c.wil * 2.5 + Math.random() * 10) * c.spellMult; break;
    case 'relampago': base = (14 + c.lvl * 2 + c.wil * 2.5 + Math.random() * 8) * c.spellMult; break;
    case 'empurrao': base = (8 + c.lvl + c.wil * 1.5) * c.spellMult; break;
    default: return { dmg: 0, crit: false };
  }
  const crit = Math.random() < critChance(c.skl, c.critBonus ?? 0);
  return { dmg: Math.round(base * m * (crit ? 1.6 : 1)), crit };
}
