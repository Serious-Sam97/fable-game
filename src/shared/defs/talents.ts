// Árvores de talento — 1 ponto por nível da disciplina, gasto na própria árvore.
// Cada talento exige o anterior da árvore (tier em ordem).

export type TalentTree = 'str' | 'skl' | 'wil';

export interface TalentDef {
  key: string;
  name: string;
  desc: string;
  tree: TalentTree;
  tier: number; // 0..3 — precisa do tier anterior aprendido
  icon: string;
}

export const TALENTS: Record<string, TalentDef> = {
  // 💪 Força
  vigor:        { key: 'vigor', name: 'Vigor', desc: '+30 de vida máxima', tree: 'str', tier: 0, icon: '❤️' },
  golpe_brutal: { key: 'golpe_brutal', name: 'Golpe Brutal', desc: '+15% de dano corpo a corpo', tree: 'str', tier: 1, icon: '💢' },
  pele_de_ferro:{ key: 'pele_de_ferro', name: 'Pele de Ferro', desc: '+3 de defesa', tree: 'str', tier: 2, icon: '🪨' },
  colosso:      { key: 'colosso', name: 'Colosso', desc: '+60 de vida máxima', tree: 'str', tier: 3, icon: '🗿' },
  terremoto:    { key: 'terremoto', name: 'Terremoto', desc: 'O finalizador do combo abre uma ONDA DE CHOQUE — empurra e atordoa todos ao seu redor', tree: 'str', tier: 4, icon: '🌋' },
  // 🎯 Habilidade
  folego:       { key: 'folego', name: 'Fôlego de Caçador', desc: '+25 de fôlego máximo', tree: 'skl', tier: 0, icon: '🫁' },
  tiro_certeiro:{ key: 'tiro_certeiro', name: 'Tiro Certeiro', desc: '+15% de dano com arcos', tree: 'skl', tier: 1, icon: '🎯' },
  reflexos:     { key: 'reflexos', name: 'Reflexos', desc: 'rolamento custa 25% menos', tree: 'skl', tier: 2, icon: '🌀' },
  olho_mortal:  { key: 'olho_mortal', name: 'Olho Mortal', desc: '+8% de chance de crítico', tree: 'skl', tier: 3, icon: '👁️' },
  flecha_perfurante:{ key: 'flecha_perfurante', name: 'Flecha Perfurante', desc: 'Suas flechas ATRAVESSAM inimigos — alinhe-os e transpasse vários de uma vez', tree: 'skl', tier: 4, icon: '🏹' },
  // ✨ Vontade
  poco_arcano:  { key: 'poco_arcano', name: 'Poço Arcano', desc: '+20 de vontade máxima', tree: 'wil', tier: 0, icon: '🔮' },
  chama_viva:   { key: 'chama_viva', name: 'Chama Viva', desc: '+15% de dano mágico', tree: 'wil', tier: 1, icon: '🔥' },
  tormenta:     { key: 'tormenta', name: 'Tormenta', desc: 'Relâmpago encadeia +1 alvo', tree: 'wil', tier: 2, icon: '⛈️' },
  serenidade:   { key: 'serenidade', name: 'Serenidade', desc: '+50% de regeneração de vontade', tree: 'wil', tier: 3, icon: '🧘' },
  conjuracao_gemea:{ key: 'conjuracao_gemea', name: 'Conjuração Gêmea', desc: 'A Bola de Fogo se divide em TRÊS projéteis num leque — cada um explode em área', tree: 'wil', tier: 4, icon: '🔱' },
};

export const TREE_LABEL: Record<TalentTree, string> = { str: '💪 Força', skl: '🎯 Habilidade', wil: '✨ Vontade' };

export function talentsByTree(tree: TalentTree): TalentDef[] {
  return Object.values(TALENTS).filter((t) => t.tree === tree).sort((a, b) => a.tier - b.tier);
}
