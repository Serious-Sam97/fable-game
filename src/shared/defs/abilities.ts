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
  bola:       { key: 'bola', cost: 16, cd: 2.5, range: 30, needTarget: true }, // Fase 49: cd 3.5→2.5 + custo 20→16 (magia era o fundo em tudo — sobe single E grupo)
  relampago:  { key: 'relampago', cost: 25, cd: 6, range: 28, needTarget: true },
  empurrao:   { key: 'empurrao', cost: 20, cd: 8, range: 0, needTarget: false },
  gelo:       { key: 'gelo', cost: 22, cd: 4, range: 26, needTarget: true },     // Estilhaço de Gelo (Fase 25) — projétil que congela
  escudo:     { key: 'escudo', cost: 30, cd: 12, range: 0, needTarget: false },  // Escudo Arcano (Fase 25) — buff local de absorção
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
  perks: number;      // Fase 45: bitfield de talentos que mudam o MOVESET (clampado 0..7 no servidor)
}

// Fase 45: perks de talento capstone (tier 4) que mudam o MOVESET, não só números.
// Bitfield trafegado no PlayerState e clampado no servidor (0..PERK_ALL). O sim lê os bits.
export const PERK_QUAKE = 1;   // 💪 Terremoto: o finalizador do combo vira onda de choque radial
export const PERK_PIERCE = 2;  // 🎯 Flecha Perfurante: flechas atravessam inimigos alinhados
export const PERK_TWIN = 4;    // ✨ Conjuração Gêmea: Bola de Fogo dispara em leque de 3
export const PERK_ALL = PERK_QUAKE | PERK_PIERCE | PERK_TWIN;

export const critChance = (skl: number, bonus = 0) => Math.min(0.45, 0.05 + skl * 0.015 + bonus);
export const discSource = (key: string, wpnKind: string): 'melee' | 'ranged' | 'magic' =>
  key === 'golpe' ? (wpnKind === 'bow' ? 'ranged' : 'melee') : 'magic';

/** fórmula única de dano — mult = multiplicador de combate (0..25) */
export function abilityDamage(key: string, c: CombatStats, mult: number): { dmg: number; crit: boolean } {
  const m = (1 + Math.min(mult, 25) * 0.03) * (c.luck ? 1.08 : 1);
  let base = 0;
  switch (key) {
    case 'golpe':
      // Fase 49 (balanceamento data-driven): arco = REI do single-target (sniper seguro, à distância);
      // melee = brigão arriscado (nerf ~15% + swing mais lento na Fase 49, ver MELEE_GAP/MELEE_CD) — não domina.
      base = c.wpnKind === 'bow'
        ? (12 + c.lvl * 2 + c.skl * 2.7 + Math.random() * 6) * c.wpnDmg
        : (10 + c.lvl * 2 + c.str * 2.0 + Math.random() * 6) * c.wpnDmg;
      break;
    // Fase 49: Bola de Fogo mais forte e mais rápida (cd 3.5→3.0) — magia deixa de ser inútil no single-target
    // (segue "taxada" pelo AoE: contra grupo multiplica, então o single fica abaixo de arco/melee de propósito).
    case 'bola': base = (22 + c.lvl * 2 + c.wil * 2.8 + Math.random() * 10) * c.spellMult; break;
    case 'relampago': base = (14 + c.lvl * 2 + c.wil * 2.5 + Math.random() * 8) * c.spellMult; break;
    case 'gelo': base = (12 + c.lvl * 2 + c.wil * 2.2 + Math.random() * 6) * c.spellMult; break; // Estilhaço de Gelo (Fase 25) — dano menor, mas congela
    case 'empurrao': base = (8 + c.lvl + c.wil * 1.5) * c.spellMult; break;
    default: return { dmg: 0, crit: false };
  }
  const crit = Math.random() < critChance(c.skl, c.critBonus ?? 0);
  return { dmg: Math.round(base * m * (crit ? 1.6 : 1)), crit };
}
