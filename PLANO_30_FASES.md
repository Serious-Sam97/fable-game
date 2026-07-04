# FABLE — Plano-Mestre de 30 Fases
### De protótipo a action-RPG online gigante

> Documento de visão de longo prazo. O tracker de progresso curto e vivo continua em
> [ROADMAP.md](ROADMAP.md); este aqui é o mapa da jornada inteira, agrupado em 5 eras.
>
> **Regra de ouro:** cada fase deve terminar jogável e commitada. Nunca deixar o jogo
> quebrado entre fases. Multiplayer é arquitetura, não feature — tudo novo nasce pensado
> para o servidor autoritativo.

**Legenda:** ✅ concluída · 🔨 em andamento · ⬜ planejada · ⚠️ bloqueada/limitada no ambiente atual

---

## ERA I — Fundações *(o esqueleto do jogo)*

### Fase 1 — Fundação técnica ✅
Vite + TypeScript, git, separação `sim` (compartilhada) / `client` / `server`, conteúdo
data-driven. **Pronto:** o jogo roda em TS com HMR e simulação separada da renderização.

### Fase 2 — Multiplayer core ✅
Servidor Node autoritativo (WebSocket 30Hz), snapshots 15Hz, client-prediction, chat de
área, persistência (Postgres via Docker), login por nome. **Pronto:** dois heróis matam um
chefe juntos pela rede, com estado salvo por personagem.

### Fase 3 — RPG profundo ✅
Disciplinas Força/Habilidade/Vontade (o corpo muda), 7 armas + 8 armaduras visíveis com
raridades e drops, arco, críticos, combos de 3 golpes, rolamento/bloqueio/parry, 12 talentos,
queimadura. **Pronto:** builds distintos jogam o mesmo conteúdo de formas diferentes.

### Fase 4 — Mundo vivo ✅
Costa + oceano, 2ª cidade (Porto Bruma), Portais Cullis, dia/noite, chuva determinística,
NPCs com rotina, pesca, crafting (forja/alquimia), casa comprável, dungeon (Caverna dos
Hobbes). **Pronto:** dá para passar uma sessão inteira sem combate e ainda progredir.

### Fase 5 — Narrativa & consequência ✅
Arco principal em 3 atos (Lorde Malachi), escolha moral no clímax com estátua/consequência
visível, sistema de crimes & guardas (aggro seletivo no co-op), cão fiel companheiro.
**Pronto:** duas campanhas com moral oposta produzem finais e mundos diferentes.

### Fase 6 — Salto audiovisual procedural ✅🔨
Vento na grama/árvores (shader), céu com gradiente, água com fresnel, música adaptativa de
combate, áudio ambiente e passos. **Pronto quando:** um clipe de 30s parece um indie
charmoso. *Resta:* god rays, SSAO/color grading.

---

## ERA II — O Herói *(tornar o personagem e o combate inesquecíveis)*

### Fase 7 — Modelos & animação esquelética ⬜⚠️
Migrar dos modelos procedurais para malhas com esqueleto (GLTF), animação por state-machine
com blending (idle↔walk↔run, ataques, rolar, morrer, pescar, sentar), IK de pés no terreno.
*Nota: exige pipeline de assets (Blender/Mixamo/packs CC0) — hoje limitado pelo CSP que
bloqueia download externo; provavelmente feito localmente e servido pelo próprio jogo.*
**Pronto:** o herói corre e ataca com animações reais, não caixas girando.

### Fase 8 — Combate de alto nível ⬜
Movesets por tipo de arma (espada rápida, martelo pesado com hyper-armor, lança com alcance),
esquiva perfeita com câmera lenta, contra-ataques, execuções em inimigos atordoados, alvos
travados com orbit. Efeitos de status completos (veneno, congelar, sangramento, medo, choque).
**Pronto:** o combate corpo a corpo tem peso, timing e leitura de inimigo.

### Fase 9 — Escolas de magia & Vontade ⬜
Vontade vira um sistema real: escolas (Fogo, Gelo, Raio, Tempo, Sombra, Vida), *spell-weaving*
(carregar/combinar feitiços), invocações (lâmina espectral, lobo de gelo), magia de utilidade
(levitar, farol, telecinese). Árvore de talentos mágica profunda. **Pronto:** um mago puro é
tão viável e distinto quanto um guerreiro.

### Fase 10 — Aparência & identidade do herói ⬜
Customização: rosto, cabelo, tom de pele, cicatrizes, tatuagens que crescem com Vontade,
peso/musculatura com Força e dieta, envelhecimento, roupas casuais vs armadura, tinturas.
Espelho/barbeiro/alfaiate na cidade. **Pronto:** dois jogadores nível 20 parecem pessoas
diferentes, e o corpo conta a história das escolhas.

### Fase 11 — Expressões sociais & renome vivo ⬜
Emotes de Fable (rir, posar, dançar, provocar, peidar) que NPCs e jogadores reagem; sistema
de sedução/amizade; fama que muda como o mundo te trata (multidões, autógrafos, medo).
Casamento (com NPC e entre jogadores), presentes, filhos. **Pronto:** ser amado ou temido
muda concretamente a experiência social.

### Fase 12 — Pets & companheiros ⬜
O cão evolui (comandos, farejar mais coisas, defender, truques) e sincroniza no co-op;
outros companheiros recrutáveis (falcão explorador, mercenário contratável). Sistema de
vínculo/lealdade. **Pronto:** seu cão é icônico e outros jogadores o veem lutar ao seu lado.

---

## ERA III — O Mundo *(fazer Albion enorme e viva)*

### Fase 13 — Streaming de mundo & biomas ⬜
Terreno em chunks com carga sob demanda (mundo 5–10× maior sem estourar memória). Biomas
novos: pântano nebuloso, montanhas nevadas, deserto/dunas, campos dourados, tundra.
Transições de vegetação e clima por bioma. **Pronto:** viajar de uma ponta à outra leva
minutos e atravessa paisagens distintas.

### Fase 14 — A Capital & distritos ⬜
Uma cidade grande de verdade (Bowerstone-like): distrito nobre, mercado, docas, favela,
castelo, arena, catedral. Centenas de NPCs com agendas. Guardas, ladrões, mendigos, nobres.
Fast-travel entre distritos. **Pronto:** a capital sozinha tem mais conteúdo que a vila inteira
de hoje.

### Fase 15 — Masmorras, criptas & interiores ⬜
Muitas dungeons com temas (cripta assombrada, forte bandido, minas, torre do mago, ruínas
antigas), puzzles (alavancas, chaves de prata, plataformas), armadilhas, baús trancados,
lore em livros. Geração semi-procedural de layout. **Pronto:** há sempre uma masmorra nova
digna de uma tarde.

### Fase 16 — Chefes de mundo & eventos dinâmicos ⬜
Chefes épicos com fases e mecânicas (o Kraken no porto, o Dragão de Pedra, o Ceifador).
Eventos de mundo: invasão de bandidos na vila, Lua de Sangue (balverines em todo lugar),
mercador misterioso, cometa. Anúncios globais, recompensas escaladas. **Pronto:** o mundo
tem "momentos" que reúnem jogadores espontaneamente.

### Fase 17 — Clima, estações & ecossistema ⬜
Ciclo de estações (afeta cultivo, spawns, aparência do mundo — neve no inverno), clima
completo (tempestade com raios que matam, neblina que esconde, seca). Fauna com cadeia
alimentar simples (cervos que lobos caçam). **Pronto:** o mesmo lugar em invernos e verões
diferentes é uma experiência diferente.

### Fase 18 — Naval & exploração marítima ⬜
Comprar/pilotar um barco, ilhas para descobrir, pesca de alto-mar, tesouros submersos,
piratas, tempestades navais, comércio entre portos. Mapa do tesouro que o cão desenterra
leva a ilhas. **Pronto:** o oceano deixa de ser cenário e vira fronteira de exploração.

---

## ERA IV — A Sociedade *(o multiplayer que faz voltar todo dia)*

### Fase 19 — Economia viva & comércio ⬜
Preços dinâmicos por oferta/demanda e região (comprar barato no porto, vender caro na
montanha), inflação controlada, banco com juros, leilão entre jogadores, contrabando.
Sumidouros de ouro (impostos, aluguéis, reparos). **Pronto:** o ouro tem valor real e o
mercado reage ao que os jogadores fazem.

### Fase 20 — Propriedades, negócios & império ⬜
Comprar casas, lojas, tavernas, fazendas em qualquer cidade; contratar funcionários; renda
passiva; decorar interiores; tornar-se dono de quarteirões inteiros. Ser prefeito/senhor de
uma vila. **Pronto:** um jogador pode ter como objetivo "dominar economicamente uma cidade".

### Fase 21 — Guildas de jogadores ⬜
Criar guildas, banco e hall compartilhado (comprável e decorável), ranks e permissões,
missões de guilda, brasão. Chat e eventos internos. **Pronto:** grupos estáveis de jogadores
têm um "lar" e objetivos coletivos.

### Fase 22 — Facções & política ⬜
Facções do mundo (Guilda dos Heróis, Culto das Sombras, Mercadores, Coroa) com reputação
que abre/fecha conteúdo; escolher lados; consequências políticas; guerra territorial
controlada por facções onde jogadores influenciam quem domina cada região. **Pronto:** as
escolhas de facção remodelam o acesso ao mundo.

### Fase 23 — PvP estruturado ⬜
Sempre opt-in. Duelos, arena ranqueada (1v1/2v2/3v3) com temporadas, campos de batalha por
objetivo, torneios com apostas, zonas PvP de alto risco/alta recompensa. Anti-cheat reforçado
(tudo já validado no servidor). **Pronto:** quem quer competir tem um sistema justo e sazonal;
quem não quer, nunca é forçado.

### Fase 24 — Profissões & crafting avançado ⬜
Árvores de profissão profundas: ferraria, alquimia, encantamento, cozinha (buffs), joalheria,
carpintaria (para construção), agricultura, domador. Receitas raras, materiais lendários,
qualidade de item craftado, assinatura do artesão. **Pronto:** um artesão dedicado é uma
"classe" econômica viável sem nunca lutar.

---

## ERA V — A Lenda *(endgame, escala e lançamento)*

### Fase 25 — Raids & conteúdo cooperativo de elite ⬜
Masmorras instanciadas para 4–8 jogadores com dificuldades (normal/heroico/mítico), mecânicas
que exigem coordenação, loot cobiçado, chefes-raid semanais. Matchmaking/localizador de grupo.
**Pronto:** grupos avançados têm um pico de desafio para conquistar juntos.

### Fase 26 — Progressão de endgame ⬜
Após o nível máximo: sistema paragon/ascensão (poder infinito incremental), sets de itens com
bônus, itens lendários com missões próprias, reforja/upgrade de equipamento, "New Game+"
e modo ironman. **Pronto:** há motivo para jogar depois de "terminar" o jogo.

### Fase 27 — História dinâmica & mundo reativo ⬜
Quest engine data-driven completo (missões em arquivos, não código), diálogos com árvores e
checks, missões procedurais infinitas no quadro de avisos, mundo que lembra e reage às ações
coletivas dos jogadores (uma vila salva prospera para todos; uma queimada fica em ruínas).
**Pronto:** o servidor conta uma história emergente que ninguém escreveu sozinho.

### Fase 28 — Escala & infraestrutura de servidor ⬜
Do servidor único para arquitetura que aguenta centenas de jogadores: sharding por região,
interest management otimizado, protocolo binário com delta compression, reconexão robusta,
migração de zonas, deploy em VPS/nuvem (ou o ROG Strix via Tailscale Funnel como servidor
oficial da comunidade). **Pronto:** 100+ jogadores online sem o servidor engasgar.

### Fase 29 — Polimento, acessibilidade & modding ⬜
Suporte a gamepad + remapeamento, escala de UI, modo daltônico, i18n (pt-BR/en/es), tutorial
e onboarding, otimização de performance (LOD, culling, pooling), telemetria. Modding leve:
data packs de missões/itens da comunidade (viável porque tudo é data-driven). **Pronto:** o
jogo é acessível, roda liso e a comunidade pode estendê-lo.

### Fase 30 — Lançamento & operação viva ⬜
Página no itch.io, trailer, Discord da comunidade, contas com senha/OAuth, conquistas e
estatísticas globais, temporadas de conteúdo, eventos sazonais (Halloween, Natal de Albion),
economia monitorada, ciclo de patches. **Pronto:** o Fable está no ar, jogável por qualquer
um, e recebe conteúdo novo de forma contínua.

---

## Mapa de dependências (ordem sugerida)

```
ERA I  (1-6)  ██████ concluída — base sólida
ERA II (7-12) ▶ começar por 8 (combate) e 9 (magia); 7 (modelos) quando houver pipeline
ERA III(13-18)▶ 13 (streaming) destrava o resto; 14 (capital) é o grande marco de mundo
ERA IV (19-24)▶ 19 (economia) e 21 (guildas) primeiro; sustentam o social
ERA V  (25-30)▶ 28 (escala) antes de abrir ao público; 30 encerra e mantém vivo
```

## Princípios que não mudam
- **Multiplayer autoritativo** — todo cálculo de jogo no servidor; o cliente só pede e mostra.
- **Data-driven** — inimigos, itens, missões, diálogos em arquivos, para escalar conteúdo e permitir mods.
- **Escolha & consequência** — a alma de Fable: moralidade, renome e decisões devem sempre deixar marca visível.
- **Sempre jogável** — cada fase termina commitada e funcionando; nada de branches quebradas por semanas.
- **Co-op primeiro** — features novas nascem pensando "como dois amigos vivem isto juntos?".

## Realismo sobre o ambiente atual
- **Assets externos (Fase 7, texturas, sons gravados)** estão limitados pelo CSP que bloqueia
  download externo — a saída é gerar/baixar localmente e servir pelo próprio projeto. Até lá,
  o caminho procedural (shaders, WebAudio, geometria) tem levado longe.
- **Escala massiva (Fase 28)** é um projeto de infra por si só; o modelo atual (1 servidor
  Node + Postgres) aguenta bem dezenas de jogadores — o suficiente para as Eras II–IV.
