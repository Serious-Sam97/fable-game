# FABLE — Roadmap Completo
### De protótipo a RPG online gigante em Albion

> **Estado atual (v0.2):** mundo único em Three.js, vila + 4 regiões, 3 missões, moralidade
> (halo/chifres), 6 habilidades, dia/noite, boss Balverine, save local, tudo single-player
> em 4 módulos ES sem build.
>
> **Visão:** um action-RPG online cooperativo estilo *Fable: The Lost Chapters* × *World of
> Warcraft* — mundo persistente, escolhas morais com consequências, co-op de 2–8 jogadores.

**Regra de ouro da ordem das fases:** multiplayer não é uma feature, é uma arquitetura.
Tudo que for construído antes da fundação de rede terá que ser reescrito. Por isso a Fase 1
é rede, e todo conteúdo das fases seguintes já nasce no modelo cliente-servidor.

---

## Fase 0 — Fundação Técnica ("de protótipo a projeto")
*Pré-requisito de tudo. Sem isso, o projeto desmorona com o próprio peso.*

- [x] **`git init`** — feito (GitHub ainda pendente)
- [x] **Vite + npm** — build, HMR, minificação, imports locais do Three.js (adeus unpkg)
- [x] **TypeScript** — base migrada (modo leniente; tipagem estrita gradual)
- [x] **Refatorar para simulação determinística separada da renderização:**
  - `src/shared/sim/` — IA/combate dos inimigos roda no cliente E no servidor ✅
  - `src/client/` — Three.js, UI, input, áudio ✅
  - `src/shared/` — math, terrain, protocol, defs ✅
- [ ] **Conteúdo data-driven** — inimigos ✅ (`shared/defs/enemies.ts`); falta itens,
      habilidades, missões e NPCs
- [ ] **Event bus** — sistemas conversam por eventos (`enemy:died`, `quest:progress`),
      não por chamadas diretas; crucial para rede e para plugar sistemas novos
- [ ] **Save versionado** — `{ version: N }` + migrações, para nunca quebrar saves antigos
- [ ] **Object pooling** para orbes/projéteis/textos flutuantes; profiler de frame budget
- [ ] **Testes de fumaça** — Playwright: inicia, anda, mata, salva (roda no CI)

**Pronto quando:** o jogo atual roda idêntico, mas em TS + Vite, com sim/render separados
e conteúdo em arquivos de definição.

---

## Fase 1 — Multiplayer Core (a fundação de rede) 🎮🎮
*A fase mais difícil e mais importante. Meta: 2–8 jogadores no mesmo mundo.*

### 1a. Servidor autoritativo
- [x] **Node.js + TypeScript + WebSocket** rodando a sim compartilhada a 30 ticks/s —
      inimigos e hora do mundo são do servidor; cliente cai para sim local quando offline
- [x] IA ✅ / hora do mundo ✅ / **combate validado no servidor** ✅ (CombatSim:
      range com tolerância de latência, cooldown, GCD, fórmula de dano e
      multiplicador rastreados server-side; casts inválidos são descartados)
- [ ] **Hospedagem caseira:** no ROG Strix G16 (CachyOS) via **Tailscale** — amigos entram
      pela tailnet sem abrir porta; depois `tailscale funnel` ou VPS para público
- [x] Persistência: **SQLite** (personagens por nome, WAL, blob de save ≤8KB);
      falta: contas com senha e estado do mundo (baús/quests globais)

### 1b. Protocolo e netcode
- [ ] Snapshots com **delta compression** + msgpack (nada de JSON gigante por tick)
- [ ] **Interest management** — cada cliente só recebe entidades num raio (grade espacial)
- [ ] **Client-side prediction + reconciliação** para o próprio herói (movimento responsivo)
- [ ] **Interpolação** de entidades remotas (render ~100 ms no passado)
- [ ] Reconexão sem perder estado; heartbeat/timeout

### 1c. Jogabilidade multiplayer mínima
- [x] Login simples por nome na tela de título (código de convite/senha pendente)
- [x] Ver outros heróis andando/lutando com nameplates (+ magias dos outros visíveis
      via eventos bolt/boom/shock)
- [ ] **Party system** — XP compartilhado ✅ e crédito de missão em grupo ✅
      (proximidade de 30 m); falta: convite formal e UI de grupo
- [x] **Chat** de área com mensagens de sistema (entrou/saiu do mundo)
- [x] Regras de loot: orbes de XP/ouro são de quem matou; XP parcial para aliados perto
- [x] Mundo persistente: dia/noite e respawns continuam com servidor vazio

**Pronto quando:** você e um amigo matam o Balverine juntos pela tailnet, com latência
imperceptível e o servidor sobrevivendo a refresh dos dois.

---

## Fase 2 — RPG Profundo (agora sim, conteúdo — já multiplayer)
*Transformar o combate raso em um RPG de verdade.*

### Equipamento & inventário
- [x] **Armas visíveis no personagem**: espada gasta/longa, machado, martelo, 2 arcos e
      cajado — modelo 3D próprio, dano/alcance próprios, visíveis nos outros jogadores
- [ ] Armaduras por slot (cabeça/peito/pernas/botas) **visíveis** e com peso
      (leve = esquiva, pesada = defesa) — estilo Fable
- [x] Raridades (Comum→Lendário com cores e multiplicadores); drops por inimigo,
      chefes nunca dropam comum; falta: afixos e itens únicos com lore
- [x] Inventário (tecla I) com equipar/vender e loja do Barnum vendendo armas;
      falta: grade com drag & drop e comparação lado a lado

### Progressão estilo Fable
- [x] **XP tripartido: Força / Habilidade / Vontade** — cada acerto treina a disciplina
      da fonte do dano (melee/arco/magia); Força dá +vida e +dano físico, Habilidade
      dá +crítico (💥×1.6) e +dano de arco, Vontade dá +vontade e +dano mágico
- [ ] Árvores de talento por linha (ex.: Vontade: Fogo→Inferno, Tempo Lento→Parar o Tempo)
- [x] A **aparência do herói muda**: Força alarga ombros/torso, Vontade acende
      tatuagens arcanas com bloom — sincronizado no multiplayer; falta: idade/cicatrizes

### Combate
- [ ] **Bloqueio, esquiva (rolamento) e parry** com timing; stamina
- [ ] Combos de melee (3 golpes encadeados), finalizadores em inimigos atordoados
- [ ] **Arco com mira livre** (segurar = tensionar, soltar = disparar)
- [ ] Efeitos de status: queimadura, congelamento, veneno, atordoamento, medo
- [ ] Inimigos novos: bandido arqueiro, xamã hobbe (cura os outros!), besouro-bomba,
      lobo alfa com matilha, espantalho vivo, troll de pedra (mini-boss de área)
- [ ] IA de grupo: flanquear, recuar para curar, chamar reforços, patrulhas com rotas

**Pronto quando:** dois builds diferentes (guerreiro tanque × mago de vidro) jogam a mesma
dungeon de formas completamente diferentes.

---

## Fase 3 — Mundo Vivo e Gigante
*De um mapa para uma Albion.*

### Expansão territorial
- [ ] **Terreno em chunks com streaming** — mundo 5–10× maior sem custo de memória
- [ ] Biomas: pântano nebuloso, montanhas nevadas, costa com praia/porto, campos dourados
- [ ] **2ª cidade grande** (porto comercial) + aldeias menores, cada uma com identidade
- [ ] **Dungeons com interiores**: cavernas de hobbes, cripta assombrada, forte bandido,
      minas abandonadas — com puzzles simples, alavancas, baús trancados (chaves de prata!)
- [ ] **Cullis Gates** — fast travel entre portais desbloqueados (lore de Fable)

### Vida
- [ ] **NPCs com rotina**: acordam, trabalham, almoçam, vão à taverna, dormem
      (lojas fecham à noite!)
- [ ] **Clima**: chuva, neblina, tempestade com raios — afeta visibilidade e spawns
- [ ] Fauna ambiente: cervos (caçáveis), pássaros, peixes pulando
- [ ] **Profissões de coleta**: pesca (minigame de timing), mineração, herbalismo, lenhador
- [ ] **Crafting**: forja (armas/armaduras), alquimia (poções), cozinha (buffs)
- [ ] **Economia viva**: preços variam por estoque e região; rotas de comércio entre cidades
      (comprar barato no porto, vender caro na montanha)
- [ ] **Casas compráveis** com decoração e baú pessoal; aluguel como renda passiva — Fable puro
- [ ] Crimes: roubar/atacar aldeão → guardas, multa, prisão ou fama sombria

**Pronto quando:** dá para passar uma sessão inteira sem combate — pescando, negociando,
decorando a casa — e ainda assim progredir.

---

## Fase 4 — Narrativa, Missões & Consequência
*A alma de Fable: escolhas que deixam cicatriz no mundo.*

- [ ] **Quest engine data-driven**: objetivos compostos (matar/coletar/escoltar/proteger/
      investigar), etapas, ramificações, flags de mundo — missões viram arquivos, não código
- [ ] **Sistema de diálogo com árvores** e checks (moralidade, renome, ouro, item na mochila)
- [ ] **Arco principal** em 3 atos com vilão recorrente (um Herói corrompido estilo
      Jack of Blades) — 10–15 missões com cutscenes de câmera scriptada
- [ ] **Consequências visíveis**: salvar ou extorquir a vila muda o mundo — vila próspera
      (feira nova, NPCs felizes) vs. oprimida (casas fechadas, mendigos); estado por jogador*
      (*decisões de mundo em MP: votação do grupo ou estado por instância de missão)
- [ ] **Side quests procedurais** no quadro de avisos: caçadas, entregas, escoltas, resgates
      — conteúdo infinito barato
- [ ] Reputação por região (herói em Pedravento, criminoso no porto), disfarces
- [ ] **Emotes sociais de Fable**: risada, pose heroica, dança, peido — NPCs reagem
      (e outros jogadores também 😄)
- [ ] Julgamentos morais maiores: sacrifício no templo do mal, doações no templo da luz

**Pronto quando:** duas campanhas jogadas com moral opostas produzem vilas, diálogos e
finais visivelmente diferentes.

---

## Fase 5 — Salto Audiovisual
*Sair dos cubos com carinho para um "low-poly bonito" de verdade.*

- [ ] **Modelos GLTF com esqueleto** — packs CC0 (Quaternius, Kenney) + retoques no Blender;
      animações via Mixamo (andar, correr, rolar, 3 ataques, morrer, pescar, sentar…)
- [ ] **Animation state machine** com blending (idle↔walk↔run, upper/lower body separados)
- [ ] Shaders: água com reflexo/fresnel, **vento na grama e árvores** (vertex shader),
      neblina volumétrica fake nos vales, god rays no amanhecer
- [ ] Pós-processamento: SSAO leve, color grading por bioma/hora, vinheta dinâmica
- [ ] **Áudio real**: samples ambientes (pássaros, vento, taverna), passos por superfície,
      **música adaptativa em camadas** (explorar → tensão → combate → vitória)
- [ ] **UI overhaul estilo pergaminho/Fable**: mapa-múndi desenhado à mão, journal de
      missões ilustrado, tooltips ricos
- [ ] **Suporte a gamepad** + remapeamento de teclas
- [ ] Acessibilidade: escala de UI, modo daltônico, i18n (pt-BR/en)

**Pronto quando:** um clipe de 30s do jogo parece um indie charmoso de verdade, não um protótipo.

---

## Fase 6 — Multiplayer Avançado & Endgame
*O que mantém as pessoas jogando juntas.*

- [ ] **Guildas**: criação, banco compartilhado, hall comprável, ranks
- [ ] **Trade entre jogadores** com janela segura (confirmação dupla)
- [ ] **Arena PvP opt-in** (duelos e 2v2) com ranking por temporada — nunca PvP forçado
- [ ] **Eventos de mundo**: invasão de bandidos na vila (todos defendem), lua de sangue
      (balverines em todo lugar), mercador misterioso itinerante
- [ ] **World bosses** semanais que exigem 4+ jogadores
- [ ] Dungeons instanciadas com dificuldades (normal/heroico) e loot escalado
- [ ] Casas de guilda decoráveis; casamento entre jogadores (Fable!)
- [ ] Moderação: mute/kick/ban, filtro de chat, report

---

## Fase 7 — Lançamento & Meta
- [ ] Contas com senha de verdade (argon2) ou OAuth; proteção básica anti-flood
- [ ] **Deploy público**: cliente na Vercel/itch.io + servidor num VPS (Fly.io/Hetzner)
      — ou o ROG Strix como servidor oficial via `tailscale funnel`
- [ ] Conquistas + estatísticas (galinhas chutadas globalmente 🐔)
- [ ] New Game+, modo ironman, dificuldades
- [ ] **Modding leve**: data packs de missões/itens da comunidade (já que tudo é data-driven)
- [ ] Trailer, página no itch.io, Discord da comunidade

---

## Ordem de execução sugerida

| # | Fase | Esforço estimado | Desbloqueia |
|---|------|------------------|-------------|
| 1 | Fase 0 — Fundação | 2–4 sessões | tudo |
| 2 | Fase 1 — Multiplayer core | 6–10 sessões | jogar com amigos |
| 3 | Fase 2 — RPG profundo | 6–8 sessões | builds e loot |
| 4 | Fase 3 — Mundo vivo | 8–12 sessões | exploração |
| 5 | Fase 4 — Narrativa | 6–8 sessões | campanha |
| 6 | Fase 5 — Audiovisual | 6–10 sessões | "cara de jogo" |
| 7 | Fase 6 — MP avançado | 6–8 sessões | endgame |
| 8 | Fase 7 — Lançamento | 3–5 sessões | público |

*Sessão = uma sessão de trabalho nossa. Fases 2+ podem intercalar (ex.: um item da Fase 5
como respiro no meio da Fase 3).*

## Quick wins para a próxima sessão
1. `git init` + primeiro commit (proteger o que já existe)
2. Migrar para Vite + TypeScript (Fase 0 começa)
3. Extrair defs de inimigos/missões para arquivos de dados
4. Esqueleto do servidor Node + eco de posições entre 2 abas (prova de vida do MP)
