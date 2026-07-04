# FABLE — Plano-Mestre de 30 Fases
### De protótipo a action-RPG online gigante

> Documento de visão de longo prazo. O tracker de progresso curto e vivo continua em
> [ROADMAP.md](ROADMAP.md); este aqui é o mapa da jornada inteira, agrupado em 5 eras.
>
> **Estado:** concluímos a **Era I (Fases 1–5)**. Estamos entrando na **Era II**.
>
> **Regra de ouro:** cada fase deve terminar jogável e commitada. Nunca deixar o jogo
> quebrado entre fases. Multiplayer é arquitetura, não feature — tudo novo nasce pensado
> para o servidor autoritativo.

**Legenda:** ✅ concluída · 🔨 em andamento · ⬜ planejada · ⚠️ bloqueada/limitada no ambiente atual

---

## ERA I — Fundações ✅ *(o esqueleto do jogo — CONCLUÍDA)*

### Fase 1 — Fundação técnica & Multiplayer core ✅
Vite + TypeScript + git, separação `sim` (compartilhada) / `client` / `server`, conteúdo
data-driven. Servidor Node autoritativo (WebSocket 30Hz + snapshots 15Hz), client-prediction,
chat de área, persistência em Postgres (Docker), login por nome.
**Pronto:** dois heróis matam um chefe juntos pela rede, com estado salvo por personagem.

### Fase 2 — RPG profundo ✅
Disciplinas Força/Habilidade/Vontade (o corpo muda), 7 armas + 8 armaduras visíveis com
raridades e drops, arco, críticos, combos de 3 golpes, rolamento/bloqueio/parry, 12 talentos,
queimadura. **Pronto:** builds distintos jogam o mesmo conteúdo de formas diferentes.

### Fase 3 — Mundo vivo ✅
Costa + oceano, 2ª cidade (Porto Bruma), Portais Cullis, dia/noite, chuva determinística,
NPCs com rotina, pesca, crafting (forja/alquimia), casa comprável, dungeon (Caverna dos
Hobbes). **Pronto:** dá para passar uma sessão inteira sem combate e ainda progredir.

### Fase 4 — Narrativa, crimes & companheiro ✅
Arco principal em 3 atos (Lorde Malachi), escolha moral no clímax com estátua/consequência
visível, sistema de crimes & guardas (aggro seletivo no co-op), cão fiel companheiro.
**Pronto:** duas campanhas com moral oposta produzem finais e mundos diferentes.

### Fase 5 — Salto audiovisual ✅
Vento na grama/árvores (shader), céu com gradiente, água com fresnel, música adaptativa de
combate, áudio ambiente e passos por superfície. **Pronto:** um clipe de 30s parece um indie
charmoso. *Refinos futuros:* god rays, SSAO/color grading.

---

## ERA II — O Herói *(tornar o personagem e o combate inesquecíveis)*

### Fase 6 — Combate de alto nível ⬜
Movesets por tipo de arma (espada rápida, martelo pesado com hyper-armor, lança com alcance),
esquiva perfeita com câmera lenta, contra-ataques, execuções em inimigos atordoados, alvo
travado com orbit. Efeitos de status completos (veneno, congelar, sangramento, medo, choque).
**Pronto:** o combate corpo a corpo tem peso, timing e leitura de inimigo.

### Fase 7 — Escolas de magia & Vontade ⬜
Vontade vira um sistema real: escolas (Fogo, Gelo, Raio, Tempo, Sombra, Vida), *spell-weaving*
(carregar/combinar feitiços), invocações (lâmina espectral, lobo de gelo), magia de utilidade
(levitar, telecinese). Árvore mágica profunda. **Pronto:** um mago puro é tão viável e distinto
quanto um guerreiro.

### Fase 8 — Aparência & identidade do herói ⬜
Customização: rosto, cabelo, tom de pele, cicatrizes, tatuagens que crescem com Vontade,
peso/musculatura com Força, envelhecimento, roupas casuais vs armadura, tinturas.
Espelho/barbeiro/alfaiate na cidade. **Pronto:** dois jogadores nível 20 parecem pessoas
diferentes, e o corpo conta a história das escolhas.

### Fase 9 — Expressões sociais & renome vivo ⬜
Emotes de Fable (rir, posar, dançar, provocar, peidar) que NPCs e jogadores reagem; amizade/
sedução; fama que muda como o mundo te trata (multidões, medo). Casamento (com NPC e entre
jogadores), presentes, filhos. **Pronto:** ser amado ou temido muda concretamente a
experiência social.

### Fase 10 — Pets & companheiros ⬜
O cão evolui (comandos, farejar mais coisas, defender, truques) e sincroniza no co-op; outros
companheiros recrutáveis (falcão explorador, mercenário contratável). Vínculo/lealdade.
**Pronto:** seu cão é icônico e outros jogadores o veem lutar ao seu lado.

### Fase 11 — Modelos & animação esquelética ✅
Migrado para malhas com esqueleto (GLTF, packs CC0 Quaternius/Kenney em public/models):
todo o elenco (herói=Knight, cão=Husky, inimigos=Wolf/Goblin/Ninja/Soldier/Demon/Yeti,
NPCs=Wizard/Witch/Casual/Pirate…) usa modelos animados com state-machine e crossfade
(idle↔walk↔run, ataque, rolar, morrer), cel-shaded para bater com o look. Loader em
assets.ts (loadGLTF + classe Actor com SkeletonUtils.clone + AnimationMixer), fallback
gracioso pro procedural. **Pronto:** o herói corre e ataca com animações reais. *Resta:*
IK de pés, props do mundo (árvores/casas Kenney), calibrar arma na mão.

---

## ERA III — O Mundo *(fazer Albion enorme e viva)*

### Fase 12 — Streaming de mundo & biomas ⬜
Terreno em chunks com carga sob demanda (mundo 5–10× maior sem estourar memória). Biomas:
pântano nebuloso, montanhas nevadas, deserto, campos dourados, tundra. Transições de vegetação
e clima por bioma. **Pronto:** viajar de ponta a ponta leva minutos e atravessa paisagens
distintas.

### Fase 13 — A Capital & distritos ⬜
Uma cidade grande de verdade (Bowerstone-like): distrito nobre, mercado, docas, favela,
castelo, arena, catedral. Centenas de NPCs com agendas. Guardas, ladrões, mendigos, nobres.
**Pronto:** a capital sozinha tem mais conteúdo que a vila inteira de hoje.

### Fase 14 — Masmorras, criptas & interiores ⬜
Muitas dungeons temáticas (cripta assombrada, forte bandido, minas, torre do mago, ruínas),
puzzles (alavancas, chaves de prata, plataformas), armadilhas, baús trancados, lore em livros,
layout semi-procedural. **Pronto:** há sempre uma masmorra nova digna de uma tarde.

### Fase 15 — Chefes de mundo & eventos dinâmicos ⬜
Chefes épicos com fases e mecânicas (Kraken no porto, Dragão de Pedra, o Ceifador). Eventos de
mundo: invasão de bandidos, Lua de Sangue, mercador misterioso, cometa. Anúncios globais,
recompensas escaladas. **Pronto:** o mundo tem "momentos" que reúnem jogadores espontaneamente.

### Fase 16 — Clima, estações & ecossistema ⬜
Ciclo de estações (afeta cultivo, spawns, aparência — neve no inverno), clima completo
(tempestade com raios, neblina, seca). Fauna com cadeia alimentar simples (cervos que lobos
caçam). **Pronto:** o mesmo lugar em invernos e verões diferentes é uma experiência diferente.

### Fase 17 — Naval & exploração marítima ⬜
Comprar/pilotar um barco, ilhas para descobrir, pesca de alto-mar, tesouros submersos, piratas,
tempestades navais, comércio entre portos. Mapa do tesouro que o cão desenterra leva a ilhas.
**Pronto:** o oceano deixa de ser cenário e vira fronteira de exploração.

---

## ERA IV — A Sociedade *(o multiplayer que faz voltar todo dia)*

### Fase 18 — Economia viva & comércio ⬜
Preços dinâmicos por oferta/demanda e região, banco com juros, leilão entre jogadores,
contrabando, sumidouros de ouro (impostos, aluguéis, reparos). **Pronto:** o ouro tem valor
real e o mercado reage ao que os jogadores fazem.

### Fase 19 — Propriedades, negócios & império ⬜
Comprar casas, lojas, tavernas, fazendas em qualquer cidade; contratar funcionários; renda
passiva; decorar interiores; tornar-se senhor de uma vila. **Pronto:** um jogador pode ter como
objetivo "dominar economicamente uma cidade".

### Fase 20 — Guildas de jogadores ⬜
Criar guildas, banco e hall compartilhado (comprável e decorável), ranks e permissões, missões
de guilda, brasão, chat e eventos internos. **Pronto:** grupos estáveis têm um "lar" e objetivos
coletivos.

### Fase 21 — Facções & política ⬜
Facções (Guilda dos Heróis, Culto das Sombras, Mercadores, Coroa) com reputação que abre/fecha
conteúdo; escolher lados; guerra territorial onde jogadores influenciam quem domina cada região.
**Pronto:** as escolhas de facção remodelam o acesso ao mundo.

### Fase 22 — PvP estruturado ⬜
Sempre opt-in. Duelos, arena ranqueada (1v1/2v2/3v3) com temporadas, campos de batalha por
objetivo, torneios com apostas, zonas de alto risco/recompensa. **Pronto:** quem quer competir
tem um sistema justo e sazonal; quem não quer, nunca é forçado.

### Fase 23 — Profissões & crafting avançado ⬜
Árvores de profissão profundas: ferraria, alquimia, encantamento, cozinha (buffs), joalheria,
carpintaria, agricultura, domador. Receitas raras, materiais lendários, qualidade e assinatura
do artesão. **Pronto:** um artesão dedicado é uma "classe" econômica viável sem nunca lutar.

---

## ERA V — A Lenda *(endgame, escala e lançamento)*

### Fase 24 — Raids & conteúdo cooperativo de elite ⬜
Masmorras instanciadas para 4–8 jogadores com dificuldades (normal/heroico/mítico), mecânicas
que exigem coordenação, loot cobiçado, chefes-raid semanais, localizador de grupo. **Pronto:**
grupos avançados têm um pico de desafio para conquistar juntos.

### Fase 25 — Progressão de endgame ⬜
Após o nível máximo: sistema paragon/ascensão (poder incremental), sets de itens com bônus,
itens lendários com missões próprias, reforja/upgrade, New Game+ e modo ironman. **Pronto:** há
motivo para jogar depois de "terminar" o jogo.

### Fase 26 — História dinâmica & mundo reativo ⬜
Quest engine data-driven completo (missões em arquivos, não código), diálogos com árvores e
checks, missões procedurais infinitas, mundo que lembra e reage às ações coletivas dos
jogadores. **Pronto:** o servidor conta uma história emergente que ninguém escreveu sozinho.

### Fase 27 — Escala & infraestrutura de servidor ⬜
Do servidor único para arquitetura que aguenta centenas de jogadores: sharding por região,
interest management otimizado, protocolo binário com delta compression, migração de zonas,
deploy em nuvem (ou o ROG Strix via Tailscale Funnel como servidor da comunidade). **Pronto:**
100+ jogadores online sem o servidor engasgar.

### Fase 28 — Polimento & performance ⬜
Otimização (LOD, culling, object pooling, orçamento de frame), god rays / SSAO / color grading,
correção de bugs em massa, balanceamento de combate e economia, telemetria. **Pronto:** roda
liso em máquina modesta e a experiência é sem arestas.

### Fase 29 — Acessibilidade, i18n & modding ⬜
Suporte a gamepad + remapeamento, escala de UI, modo daltônico, i18n (pt-BR/en/es), tutorial e
onboarding. Modding leve: data packs de missões/itens da comunidade (viável porque tudo é
data-driven). **Pronto:** o jogo é acessível a todos e a comunidade pode estendê-lo.

### Fase 30 — Lançamento & operação viva ⬜
Página no itch.io, trailer, Discord, contas com senha/OAuth, conquistas e estatísticas globais,
temporadas de conteúdo, eventos sazonais (Halloween, Natal de Albion), economia monitorada,
ciclo de patches. **Pronto:** o Fable está no ar, jogável por qualquer um, e recebe conteúdo
novo de forma contínua.

---

## Mapa de dependências (ordem sugerida)

```
ERA I  (1-5)  █████ CONCLUÍDA — base sólida e jogável
ERA II (6-11) ▶ começar por 6 (combate) e 7 (magia); 11 (modelos GLTF) quando houver pipeline
ERA III(12-17)▶ 12 (streaming) destrava o resto; 13 (capital) é o grande marco de mundo
ERA IV (18-23)▶ 18 (economia) e 20 (guildas) primeiro; sustentam o social
ERA V  (24-30)▶ 27 (escala) antes de abrir ao público; 30 encerra e mantém vivo
```

## Princípios que não mudam
- **Multiplayer autoritativo** — todo cálculo de jogo no servidor; o cliente só pede e mostra.
- **Data-driven** — inimigos, itens, missões, diálogos em arquivos, para escalar conteúdo e permitir mods.
- **Escolha & consequência** — a alma de Fable: moralidade, renome e decisões devem sempre deixar marca visível.
- **Sempre jogável** — cada fase termina commitada e funcionando; nada de branches quebradas por semanas.
- **Co-op primeiro** — features novas nascem pensando "como dois amigos vivem isto juntos?".

## Realismo sobre o ambiente atual
- **Assets externos (Fase 11, texturas, sons gravados)** estão limitados pelo CSP que bloqueia
  download externo — a saída é gerar/baixar localmente e servir pelo próprio projeto. Até lá,
  o caminho procedural (shaders, WebAudio, geometria) tem levado longe.
- **Escala massiva (Fase 27)** é um projeto de infra por si só; o modelo atual (1 servidor
  Node + Postgres) aguenta bem dezenas de jogadores — o suficiente para as Eras II–IV.
