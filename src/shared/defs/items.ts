// Armas e raridades — dados compartilhados. O herói vira o que ele usa:
// melee treina Força, arco treina Habilidade, magia treina Vontade.

export type WeaponKind = 'melee' | 'bow' | 'staff';

export interface WeaponDef {
  key: string;
  name: string;
  kind: WeaponKind;
  mult: number;        // multiplicador de dano base
  range: number;       // alcance do ataque básico
  icon: string;
  tier: number;        // 0 inicial … 3 topo
  spellBoost?: number; // cajados amplificam magia
  price?: number;      // se vendido pelo Barnum
}

export const WEAPONS: Record<string, WeaponDef> = {
  espada_gasta: { key: 'espada_gasta', name: 'Espada Gasta', kind: 'melee', mult: 1.0, range: 3.8, icon: '🗡️', tier: 0 },
  machado:      { key: 'machado', name: 'Machado de Lenhador', kind: 'melee', mult: 1.15, range: 3.6, icon: '🪓', tier: 1, price: 90 },
  espada_longa: { key: 'espada_longa', name: 'Espada Longa', kind: 'melee', mult: 1.25, range: 4.3, icon: '⚔️', tier: 2 },
  martelo:      { key: 'martelo', name: 'Martelo de Guerra', kind: 'melee', mult: 1.4, range: 3.4, icon: '🔨', tier: 3 },
  arco_cacador: { key: 'arco_cacador', name: 'Arco do Caçador', kind: 'bow', mult: 1.0, range: 26, icon: '🏹', tier: 1, price: 120 },
  arco_longo:   { key: 'arco_longo', name: 'Arco Longo', kind: 'bow', mult: 1.25, range: 30, icon: '🏹', tier: 3 },
  cajado_arcano:{ key: 'cajado_arcano', name: 'Cajado Arcano', kind: 'staff', mult: 0.85, range: 3.2, icon: '🪄', tier: 2, spellBoost: 1.18, price: 200 },
};

export interface Rarity {
  key: string;
  name: string;
  color: string;
  mult: number;   // multiplica o dano da arma
  weight: number; // peso base do sorteio
  sell: number;   // preço de venda base
}

export const RARITIES: Rarity[] = [
  { key: 'comum',    name: 'Comum',     color: '#c8c8c8', mult: 1.0,  weight: 58, sell: 15 },
  { key: 'incomum',  name: 'Incomum',   color: '#5ade5a', mult: 1.12, weight: 26, sell: 40 },
  { key: 'raro',     name: 'Raro',      color: '#5a9dee', mult: 1.25, weight: 11, sell: 90 },
  { key: 'epico',    name: 'Épico',     color: '#b06ae8', mult: 1.4,  weight: 4,  sell: 200 },
  { key: 'lendario', name: 'Lendário',  color: '#ff9a2a', mult: 1.6,  weight: 1,  sell: 500 },
];
export const rarityOf = (key: string) => RARITIES.find((r) => r.key === key) ?? RARITIES[0];

// ---------------- armaduras ----------------
export type ArmorSlot = 'head' | 'chest' | 'legs' | 'boots';

export interface ArmorDef {
  key: string;
  name: string;
  slot: ArmorSlot;
  def: number;    // pontos de defesa — redução = def/(def+25)
  weight: number; // 0 leve … 2 pesada — pesa na stamina do rolamento
  icon: string;
  tier: number;
  price?: number;
}

export const ARMORS: Record<string, ArmorDef> = {
  couro_capuz:   { key: 'couro_capuz', name: 'Capuz de Couro', slot: 'head', def: 2, weight: 0, icon: '🧢', tier: 1 },
  couro_colete:  { key: 'couro_colete', name: 'Colete de Couro', slot: 'chest', def: 4, weight: 0, icon: '🦺', tier: 1, price: 80 },
  couro_calcas:  { key: 'couro_calcas', name: 'Calças de Couro', slot: 'legs', def: 3, weight: 0, icon: '👖', tier: 1 },
  couro_botas:   { key: 'couro_botas', name: 'Botas de Couro', slot: 'boots', def: 2, weight: 0, icon: '🥾', tier: 1 },
  ferro_elmo:    { key: 'ferro_elmo', name: 'Elmo de Ferro', slot: 'head', def: 5, weight: 2, icon: '🪖', tier: 2 },
  ferro_peitoral:{ key: 'ferro_peitoral', name: 'Peitoral de Ferro', slot: 'chest', def: 9, weight: 2, icon: '🛡️', tier: 2, price: 250 },
  ferro_grevas:  { key: 'ferro_grevas', name: 'Grevas de Ferro', slot: 'legs', def: 6, weight: 2, icon: '⛓️', tier: 2 },
  ferro_botas:   { key: 'ferro_botas', name: 'Botas de Ferro', slot: 'boots', def: 4, weight: 2, icon: '🥾', tier: 2 },
};

/** item de inventário: arma (wpn) OU armadura (arm), sempre com raridade */
export interface ItemInstance { wpn?: string; arm?: string; rar: string; }

// chance de drop de arma por tipo de inimigo (rolado por quem matou)
const DROP_CHANCE: Record<string, number> = {
  besouro: 0.07, lobo: 0.14, bandido: 0.2, hobbe: 0.18, chefe: 1, balverine: 1,
  besouro_bomba: 0.05, arqueiro: 0.22, xama: 0.2, lobo_alfa: 0.6, troll: 1, caranguejo: 0.08,
};

function rollRarity(enemyLvl: number): string {
  // inimigos fortes puxam raridade pra cima (chefe/balverine nunca dropam comum)
  const minIdx = enemyLvl >= 6 ? 1 : 0;
  let total = 0;
  for (let i = minIdx; i < RARITIES.length; i++) total += RARITIES[i].weight + enemyLvl;
  let roll = Math.random() * total;
  for (let i = minIdx; i < RARITIES.length; i++) {
    roll -= RARITIES[i].weight + enemyLvl;
    if (roll <= 0) return RARITIES[i].key;
  }
  return 'comum';
}

export function rollDrop(enemyType: string, enemyLvl: number): ItemInstance | null {
  if (Math.random() > (DROP_CHANCE[enemyType] ?? 0)) return null;
  const maxTier = Math.max(1, Math.ceil(enemyLvl / 3));
  const rar = rollRarity(enemyLvl);
  if (Math.random() < 0.45) {
    const pool = Object.values(ARMORS).filter((a) => a.tier <= maxTier + 1);
    if (pool.length) return { arm: pool[Math.floor(Math.random() * pool.length)].key, rar };
  }
  const pool = Object.values(WEAPONS).filter((w) => w.tier > 0 && w.tier <= maxTier);
  if (!pool.length) return null;
  return { wpn: pool[Math.floor(Math.random() * pool.length)].key, rar };
}

export function itemDef(item: ItemInstance) {
  return item.wpn ? WEAPONS[item.wpn] : item.arm ? ARMORS[item.arm] : undefined;
}

export function sellPrice(item: ItemInstance): number {
  const d = itemDef(item);
  return Math.round(rarityOf(item.rar).sell * (1 + (d?.tier ?? 0) * 0.5));
}
