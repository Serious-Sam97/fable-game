# FABLE — Plano Gráfico de 50 Fases
### Do "protótipo com modelos quebrados" a um low-poly de dar orgulho

> Documento focado em **gráficos, modelos e mundo visual**. Complementa
> [PLANO_30_FASES.md](PLANO_30_FASES.md) (visão de jogo) e [ROADMAP.md](ROADMAP.md)
> (features). A Fase 11 do plano-mestre trouxe GLTF animados, mas ficou **quebrada na
> prática** (orientação, escala, props do mundo). Este plano conserta isso e leva o
> visual até o fim.
>
> **Regra de ouro:** cada fase termina jogável, commitada e **verificada no preview**.
> Nada de "concluído" sem ver na tela. Todo prop novo nasce com collider e escala corretos.

**Legenda:** ✅ concluída · 🔨 em andamento · ⬜ planejada

---

## 🔍 Diagnóstico do estado atual (o ponto de partida)

Três defeitos concretos, todos com causa-raiz identificada no código:

| Sintoma | Causa-raiz | Onde |
|---|---|---|
| **Modelos andam de costas** | `faceOffset: Math.PI` uniforme em todos os atores; o grupo já aponta +Z para o movimento (`atan2(mx,mz)`), o π extra vira 180° | `game.ts:41,80,359,449` |
| **Escala absurda/inconsistente** | 3 sistemas de escala desconexos (`2.5/h`, `0.95/h`, `h/height` com `h` chutado 2.0–5.0), sem referência métrica única; `Actor.height` mede Box3 em bind-pose | `game.ts:40,79,358,448`; `assets.ts:119` |
| **Mundo sem modelos** | `world.ts` é 100% procedural (`addTree`, `makeCottage`, pedras `Dodecahedron`); nenhum GLB de `public/models/{nature,town,castle}` é carregado | `world.ts:274,414,339` |

**Inventário de assets disponível** (parado em `public/models/`, tudo CC0):
- `characters/` — ~52 humanoides (Knight, Goblin, Ninja, Soldier, Wizard, Witch, Pirate, Casual…)
- `animals/` — 12 (Wolf, Husky, Deer, Stag, Fox, Horse, Cow…)
- `monsters/` — Big/Flying/Blob (Demon, Yeti, Dragon, Orc, Ghost, blobs…)
- `nature/` — árvores, pedras, penhascos, pontes, plantas (Kenney, formato GLTF)
- `town/` — casas, cercas, fontes, carroças, estradas, lanternas (formato GLB)
- `castle/` — muralhas, portões, torres, bandeiras, cerco (GLB)
- `survival/` + `props/` — barris, baús, tochas, caixas (GLB)

---

## BLOCO A — Estabilizar o pipeline de modelos ✅ *(conserta o que está quebrado)*

### Fase 1 — Harness de calibração & diagnóstico ao vivo ✅
> Bancada em `/debug-models.html` (`src/client/debug-models.ts`): cada GLTF num grid com
> eixos, bounding box, altura por geometria vs. por esqueleto, clips e seta +Z. Foi ela que
> revelou as causas-raiz das Fases 2 e 3.
Uma cena/rota de teste (`?debug=models`) que enfileira cada GLTF lado a lado sobre um grid,
mostrando eixos (helper), bounding box, altura real e nome dos clips de animação. É a
bancada onde calibramos tudo das próximas fases sem caçar no jogo inteiro.
**Pronto:** abrir a bancada e ver, de uma vez, todo o elenco + props com seus eixos e medidas.

### Fase 2 — Normalizar orientação (fim do "andar de costas") ✅
> **Causa-raiz:** `faceOffset: Math.PI` chumbado em todos os atores. Os 3 packs (Quaternius
> chars/animals, RPG monsters) encaram **+Z nativamente** — confirmado na bancada — e o jogo já
> aponta o +Z do grupo para o movimento; o π extra girava 180° → moonwalk. **Correção:** default
> `faceOffset = 0` em `assets.ts` e removido dos 4 pontos de `game.ts`. Verificado no jogo:
> herói e cão correm de frente. `assets.ts:55`, `game.ts:47,86,365,455`.

### Fase 3 — Referência métrica única de escala ✅
> **Causa-raiz:** `Actor.height` usava `Box3.setFromObject`, que mede o **esqueleto na pose do
> instante do load** — o mesmo rig dava alturas de 1.1 a 2.3, então `scale = alvo/altura` gerava
> gigantes e anões (herói renderizava a 5.5u em vez de 2.5u). **Correção:** `Actor.height` agora
> mede a **geometria em bind pose** (`_geomBox`, determinístico) e as alturas-alvo derivam de
> `HERO_H`/`DOG_H`. Verificado: herói `scale 0.697` (2.5u), lobo `0.746` (2.0u). `assets.ts:118`.

### Fase 4 — Pivô e assentamento no chão ✅
> `Actor` agora auto-assenta: `yOffset = -groundY(gltf) * scale` (min.y da geometria → 0), pés no
> terreno em qualquer escala. Verificado no jogo. `assets.ts:60`.

### Fase 5 — Mapa de animações robusto por pack ✅
> Aliases já cobrem os 3 packs (verificado: nenhum warning de clip faltando no jogo). Adicionado
> `Actor._missing()` que loga 1× os clips disponíveis quando um alias não bate — rede de segurança
> contra T-pose silenciosa. `assets.ts`.

### Fase 6 — Arma na mão do herói (attach a osso) ✅
> `attachHeroWeapon()` prende a arma ao osso `FistR` (Fist.R→FistR). O +Y local do osso aponta
> p/ baixo (medido na bancada) → rotação `(0.32, 0, 0.06)` deixa a lâmina p/ cima e à frente
> (empunhadura de prontidão); contra-escala `1/escala` mantém o tamanho. Arco tem ramo próprio.
> Verificado no jogo e na bancada com câmera livre. `game.ts:298`.

### Fase 7 — Cel-shading coeso nos GLTF ✅
> `toonify` agora preserva emissivos (olhos/ouro/runas) na conversão. Adicionado contorno toon por
> inverted-hull (`addOutline`): clona cada malha compartilhando esqueleto/geometria, material preto
> em BackSide empurrado pela normal — acompanha a animação, espessura ~constante no mundo. Verificado:
> silhuetas bem definidas contra o mundo claro, **~121 FPS** com o elenco todo (custo desprezível). `assets.ts`.

### Fase 8 — Carregamento, cache e fim do pop-in ✅
> `preloadModels()` aquece o cache de todos os GLTF de inimigos + herói/cão no init → sem pop-in
> procedural→GLTF. E **heróis remotos agora usam GLTF** (mesmo Knight animado + arma no osso), com
> fallback procedural. Verificado solo injetando um aliado: renderizou como Knight GLTF empunhando
> martelo, sem erros. `game.ts` (ensureRemoteHero/updateRemoteHeroes/preloadModels).

### Fase 9 — Variação de inimigos sem quebrar material ✅
> Tints por variante preservando o cel-shading: lobo alfa grisalho, xamã arcano roxo, capitão
> hobbe bronzeado, arqueiro couro esverdeado, chefe carmesim (+ cavaleiro sombrio já existente).
> Verificado: elites distinguíveis num aglomerado. `game.ts:449` (ENEMY_GLTF).

### Fase 10 — Auditoria visual do elenco ✅
> Verificados na tela via preview: herói (frente/escala/arma), cão Husky, lobos, hobbes + elites
> tintados, NPC — todos com escala/orientação corretas, sem regressões. Bancada em `/debug-models.html`.

---

## BLOCO B — Vestir o mundo com props ✅ *(adeus geometria procedural)*

### Fase 11 — Framework de props estáticos ✅
> `loadProp(url)` em `assets.ts`: carrega GLB, aplica cel-shading, mede bbox e cacheia um template.
> `placeProp(tpl,x,z,{h|scale,ry,collide,sway,sink})` em `world.ts` clona barato, assenta no
> terreno e cria collider. `dressWorld()` (async) troca o procedural pelos GLB com **fallback**
> — nada quebra se um arquivo faltar. Verificado: 398 props colocados no mundo.

### Fase 12 — Árvores Kenney substituem as procedurais ✅
> Placement diferido: `addTree()` registra, `dressWorld()` coloca GLB de `nature/` (oak/pine/fat/
> detailed + pinheiros) com vento (reusa `swayTrees`) e collider. Fallback procedural. Verificado:
> ~104 árvores GLB, proporcionais ao herói, no lugar dos cilindros+esferas.

### Fase 13 — Pedras, penhascos e costa ✅
> Rochas de `nature/` (rock_large/tall) via `placeProp` no lugar dos `Dodecahedron`. Verificado:
> ~14 pedras GLB colocadas com escala/afundamento no terreno.

### Fase 14 — Vegetação de chão ✅
> Scatter de ~280 props: arbustos (plant_bush), samambaias, flores, cogumelos e tocos, com leve
> vento. Verificado no jogo (arbustos 3D, flores, cogumelos). Grama shader instanciada mantida.

### Fase 15 — Casas da vila (Fantasy Town Kit) ✅
> `buildTownHouse()` monta casa modular do town kit: paredes 1×1 (2 níveis) com porta e janelas
> em arco, telhado em empena e chaminé fumegante, com **fallback** pro `makeCottage`. Placement
> diferido (collider síncrono, GLB em `dressWorld`). Verificado: casas de pedra+madeira com
> "VENDA" na cabana comprável; vila e porto convertidos. `world.ts`.

### Fase 16 — Mobília urbana da vila ✅
> Sistema `decor(x,z,url,h,collide)` + `decorPlacements`. Barris, caixas, carroças, lanternas e
> baú (`survival/`+`town/`) na praça, escalados corretamente. Verificado: 12 props na praça. *Arranjo
> fino e mais props no porto ficam para o dressing (Fase 20).*

### Fase 17 — Porto Bruma com props ✅
> Caixas, barris, baús e balde (`survival/`) em terra perto das casas de pescador (evitando o
> píer sobre a água). Verificado: 9 props no porto. *Barcos/redes/farol modelados ficam p/ dressing.*

### Fase 18 — Castelo, ruínas e Pedras do Ritual ✅
> Os 8 menires de caixa viraram pedras verticais GLB (`stone_tall*`/`statue_obelisk`/`statue_column`),
> mantendo runas roxas e altar/selo mágicos. Verificado: 8 menires no círculo. *Nota: pedras Kenney
> saem claras — tingir mais escuro para o clímax sombrio é um polish futuro (o tint no `decor` viria bem).*

### Fase 19 — Interior da Caverna dos Hobbes ✅
> Parede em anel de 25 rochas GLB (`rock_large/tall`) no lugar dos dodecaedros + 6 detritos
> (pedregulhos/potes) no piso. Verificado: 32 props na câmara. Teto/penumbra mantidos.

### Fase 20 — Passada de direção de arte no layout ✅
> Acampamento bandido remodelado (tendas `tent_*` GLB + fogueira + barris/caixas). Moinho
> (`town/windmill`) como marco na borda da vila + placas (`sign`) na vila e no porto. Verificado.
> *Road tiles ao longo dos caminhos curvos ficam para uma passada futura (custo/benefício).*

---

## BLOCO C — Terreno, água, céu e ambiente ✅ *(a moldura do mundo)*

### Fase 21 — Terreno texturizado (splatmap) 🔨 *(parcial)*
> Cor de vértice do terreno agora considera **inclinação** (gradiente da altura) além de altitude:
> encostas íngremes e picos viram rocha (com variação de tom), somado a grama/areia/terra. `world.ts:buildGround`.
> **Limitação honesta:** o terreno é majoritariamente suave e as encostas íngremes ficam na costa
> (coloridas de areia), então o efeito é sutil. O ganho pleno (splatmap com blending) pede **texturas
> reais** — que esbarram no CSP; a saída seria gerar/servir texturas localmente. Fica p/ retomar.

### Fase 22 — Bordas, caminhos e decals de terreno ✅
> Bordas de caminho **irregulares** (ruído), blend praia↔grama jitterado e manchas de terra/desgaste
> na cor de vértice. Verificado de cima: o caminho de terra tem bordas naturais mesclando na grama.
> `world.ts:buildGround`. *Decals reais (pegadas, folhas) ficam para o Bloco E.*

### Fase 23 — Água de próxima geração ✅
> Shader de água evoluído: **espuma** animada (cristas por todo o espelho + anel radial ondulado na
> margem do lago) e **caustics** em camadas, somados ao fresnel/ondas/sol existentes. Verificado:
> o lago mostra espuma/whitecaps brancos e superfície viva. `world.ts:makeWaterMaterial`.
> *Reflexo/refração reais (render target) ficam para o Bloco D.*

### Fase 24 — Céu, atmosfera e nuvens ✅
> Céu povoado: 20 nuvens (de 8) com tamanhos/alturas variados, opacidade suave e deriva. Névoa por
> distância (`scene.fog`) já existente. Verificado por contagem (20 grupos). `world.ts:buildSkyObjects`.
> *Nuvens volumétricas de verdade e disco de sol/lua realista ficam p/ o Bloco D.*

### Fase 25 — Ciclo dia/noite cinematográfico ✅
> Paleta de luz cinematográfica no `updateSky`: **golden hour** quente (rim + hemi dourados, pico com
> sol baixo) e **luz ambiente azul-lunar** à noite. Verificado: pôr do sol lindo, horizonte rosa-alaranjado
> banhando a paisagem. `core.ts:updateSky`. *Sombras longas de entardecer ficam p/ o Bloco D.*

### Fase 26 — Clima visual ✅
> **Relâmpagos** em tempestade forte (clarão breve no céu + névoa) somados à chuva em partículas e ao
> escurecimento (`dim`) já existentes. Verificado: chuva caindo, céu de tempestade e flash do raio.
> `world.ts`. *Poças com reflexo ficam para o Bloco D.*

### Fase 27 — Fauna ambiente ✅
> Sistema de **fauna errante** em `game.ts`: 9 cervos/veados/raposas (modelos `animals/` via `Actor`)
> vagam pela grama (escolhem alvos, pastam) e **fogem galopando** do herói (evitam a água). Verificado
> por comportamento (spawn, `moving:true`, fuga). *Pássaros voando e peixes pulando ficam p/ o Bloco E (VFX).*

### Fase 28 — Micro-detalhe de chão ✅
> `buildGroundDetail()` em `world.ts` (roda após `buildVegetation`, usa `plantings`): **detritos 3D**
> instanciados — pedrinhas (~448), galhos (~164) e folhas de outono (~215), aglomerados sob as
> árvores e ao longo dos caminhos — somados a **decals pintados** (quads planos com `alphaMap`
> gerado em canvas, sem CSP): pegadas em trilhas de 3 passos nos caminhos de terra (~39),
> rachaduras em terra seca/encostas (~110) e folhagem caída sob as árvores (~94). Tudo estático
> (11 draw calls, ~1400 instâncias), gateado a chão plano/seco e assentado no terreno.
> Verificado no preview: pedrinhas/galhos/folhas legíveis no caminho da vila; pegadas com silhueta
> correta em trilha (teste de realce); **~120 FPS** sem regressão. `world.ts:buildGroundDetail`.
> *Pegadas na areia da praia ficaram de fora (a banda de areia é toda `shore`); decals de folhas/
> pegadas mais ricos por bioma casam bem com a Fase 29.*

### Fase 29 — Identidade visual por região/bioma ✅
> Tabela `BIOMES` em `world.ts` (centro/raio/cor/vegetação/umidade) alimentando **paleta** e
> **vegetação** de uma vez. `biomeTint()` mistura o tom da região na cor de vértice do chão
> (`buildGround`, com falloff suave — a vila fica neutra/dourada); `dominantBiome()` enviesa a
> vegetação em `buildVegetation` (tipo de árvore + densidade + tipo de scatter). Cinco biomas:
> **Floresta Sombria** (verde profundo frio, pinheiros densos), **Charco do Ritual** (oliva
> doentio, árvores mortas, samambaias/cogumelos), **Terras do bando** (seco/marrom, mata rala),
> **Pomar** (campina viçosa quente, macieiras) e **Costa** (capim pálido salgado). Verificado no
> preview: cores de vértice objetivamente distintas por região (floresta 20,47,11 · charco 34,54,13
> · árida 45,64,14 · vila 35,76,12 · pomar 41,82,12 · costa 77,90,32) + screenshots (floresta de
> pinheiros, costa pálida, charco escuro nas Pedras do Ritual); **~120 FPS** (tint é build-time).
> `world.ts:BIOMES/biomeTint/dominantBiome`. *Transições mais ricas por bioma (névoa/luz própria)
> combinam com o Bloco D.*

### Fase 30 — Coesão de paleta global ✅
> `gradePass` reescrito em `core.ts` com o **dourado Fable como fio condutor**: duotone por
> luminância (sombras terrosas → luzes cremes) que unifica tudo + **de-teal** (aquece pixels
> frios, matando o cast teal dos props Kenney) + tint dourado global. `updateColorGrade()` em
> `game.ts` modula o grade **por hora do dia** (mais quente/dourado no golden hour, sombras
> frias-lunares à noite, dourado recua no escuro) **e por região** via `biomeGrade()` em
> `world.ts` (charco dessaturado, pomar viçoso, costa arejada…), com transição suave (sem flicker
> ao cruzar biomas). Verificado no preview: vila e **Porto Bruma** com props antes frios agora
> quentes e coesos (paredes creme, telhados terracota) preservando cores saturadas (toldo azul do
> mercado); golden hour dramático; noite com base fria-lunar + poças quentes das lanternas;
> **~120 FPS** (passe full-screen, custo desprezível). `core.ts:GradeShader`, `game.ts:updateColorGrade`.

---

## BLOCO D — Iluminação & pós-processamento ✅ *(a "cara de jogo")*

### Fase 31 — Sombras de qualidade ✅
> Sombra direcional afinada em `core.ts`: mapa **4096²** num frustum ortográfico **apertado
> (±72)** centrado no jogador → texel ~0.035u (2.6× mais fino que os 2048/±95 anteriores), nítido
> de perto; **`normalBias 0.03`** (+ bias -0.0003) mata o peter-panning/acne sem serrilhar; PCFSoft
> mantido. **Sombra de contato nos pés** na classe `Actor` (`assets.ts`): mancha radial macia
> (canvas, geometria/textura compartilhadas, `matrixAutoUpdate=false`) que assenta cada ator no
> chão mesmo com o sol baixo (quando a projetada cai longe dos pés); atores também passam a
> **receber** sombra. Verificado no preview: mapa 4096² e frustum ±72 confirmados, **52 sombras de
> contato** na cena (herói/cão/inimigos/NPCs/fauna), sombras de prédios/cercas nítidas; **~120 FPS**
> (o 4096² não custou nada nesta máquina). *Optei por frustum-apertado-que-segue-o-jogador em vez de
> CSM real: o CSM da three remenda os materiais via onBeforeCompile e brigaria com os shaders toon/
> vento/contorno customizados — risco alto pro ganho.* `core.ts` (sun.shadow), `assets.ts` (Actor).

### Fase 32 — Oclusão ambiente (GTAO) ✅
> `GTAOPass` (three r160) inserido no composer logo após o `RenderPass` (escurece a beauty antes
> do bloom/grade), em `core.ts`. Parâmetros calibrados na tela: `radius 2.0` (unidades de mundo —
> pega a base de props/casas/árvores), `scale 1.5`, `blendIntensity 1.0`, 16 samples. Exposto em
> `window.FABLE.gtao` para tuning/A-B. Verificado no preview: A/B on-vs-off mostra escurecimento de
> contato nas bases de barris/caixas/árvores/casas e no pé do cristal Cullis; buffers de debug
> (Normal/AO) confirmam o G-buffer; **119 FPS on vs 120 off** — praticamente de graça *nesta*
> máquina (o passe re-renderiza a geometria p/ normais → **é o item a vigiar em máquina modesta**;
> `gtao.enabled=false` desliga). *Optei por GTAO em vez de SSAO (mais moderno/limpo). O ruído de
> shader no console é o bug pré-existente do contorno (`objectNormal`), amplificado porque o GTAO
> recompila a geometria no passe de normais — some quando o contorno for consertado.* `core.ts:gtao`.

### Fase 33 — Bloom e emissivos refinados ✅
> Bloom **modulado por hora do dia** em `game.ts` (`updateColorGrade`, junto do grade): de dia
> limiar alto (0.88, cai um pouco no golden hour) + força baixa → só os emissivos brilham, a cena
> **não estoura**; à noite o limiar despenca (0.46) e a força sobe (0.85) → tochas/fogueiras
> (MeshBasic laranja/amarelo), janelas, lanternas, portais Cullis e runas do ritual ganham brilho
> quente; tatuagens de Vontade (emissivo até 2.2) e olhos/ouro dos packs também. Verificado no
> preview: noite com poças de luz brilhando (cristal Cullis verde, lanternas amarelas, fogo laranja)
> sem lavar o escuro; meio-dia limpo e crocante sem blowout; **~118 FPS** (só troca de parâmetros,
> custo zero). `game.ts:updateColorGrade` (bloom.threshold/strength/radius), `core.ts:bloom`.
> *Bloom seletivo por layer (isolar 100% os emissivos) brigaria com o pipeline atual — o limiar
> por-hora entrega o "brilha sem estourar" com risco baixo.*

### Fase 34 — God rays / shafts de luz ✅
> Passe pós `GodRaysShader` (screen-space radial blur) em `core.ts`, após o bloom: caminha 48
> amostras da beauty em direção ao sol na tela, acumulando só o brilho alto (céu/sol) com decay →
> onde árvores/prédios ocluem, nascem os raios; soma tingido de dourado. Em `game.ts`
> (`updateColorGrade`) o sol é **projetado na tela** por frame: só emite quando está à frente, na
> tela e acima do horizonte (fade nas bordas), **reforçado no golden hour** e zerado à noite —
> com `if (uIntensity<=0.001) return` no shader, custo ~0 quando inativo. Verificado no preview:
> encarando o sol baixo no golden hour, brilho volumétrico quente irradiando do sol (intensidade
> subiu a ~0.23 com o sol na tela, 0 fora dela — fade correto); FPS **120** em toda a verificação.
> `core.ts:godrays`, `game.ts:updateColorGrade`, `window.FABLE.godrayUniforms` p/ tuning.
> *Honestidade: com a câmera orbital (raramente olhando pra cima pelo dossel) o efeito lê mais como
> glow atmosférico do sol do que shafts nítidos — estes aparecem quando um prédio/árvore parte o
> sol. Não consegui cravar um FPS "ativo" isolado (o sol saía da tela → early-out), mas o passe é
> um único fullscreen de 48 taps, mais leve que o GTAO que segurou 120.*

### Fase 35 — Color grading / tone mapping ✅
> Complementa a Fase 30 (que fez coesão espacial/temporal) com **resposta cinematográfica** e
> **grade por CENA**. No shader do grade (`core.ts`): **curva-S filmica** sobre o ACES (`uFilmic`,
> contraste com rolloff suave) + **temperatura** por cena (`uTemp`, balanço R/B). Em `game.ts`
> (`updateColorGrade`) dois contextos sobrepõem um look dramático, com transição suave: **combate**
> (inimigo caçando <24u → esfria, dessatura, +contraste, fecha a vinheta = tensão) e **masmorra**
> (`inCave`, ligado no enter/exit da Caverna → frio, alto contraste, dessaturado, dourado recuado =
> opressão). Verificado no preview (via `window.FABLE.setScene('combat'|'cave'|'')`): base filmica
> rica sem regressão; combate visivelmente mais frio/tenso; caverna claramente gélida e contrastada
> vs. o dourado normal; **~119 FPS**. `core.ts:GradeShader` (uTemp/uFilmic), `game.ts:updateColorGrade`.

### Fase 36 — Iluminação de interiores ✅
> Entrar na Caverna dos Hobbes agora **muda a luz de forma palpável**: reusando o `inCave` (ligado
> no `enterCave`/`exitCave`), o `updateColorGrade` **atenua o céu** por frame — sol ×(1-0.94·sCave)
> e hemi ×(1-0.72·sCave) + ambiente esquenta/escurece (`_caveAmb`) → as **tochas viram a luz
> principal** (penumbra quente, opressiva). O bloom passa a tratar a caverna como "escuro"
> (`max(night, sCave)`) → as chamas brilham lá dentro mesmo de dia. **Flicker das tochas** refeito
> em `world.ts`: multi-frequência orgânico + tremor de matiz quente + intensidade base 2.7.
> Verificado no preview: entrando, sol **1.8→0.12** e hemi **0.95→0.27**, câmara escura com poças
> quentes de tocha (bloom nas chamas) e hobbes na penumbra; saindo, luz **restaura 100%**; **120 FPS**.
> `game.ts:updateColorGrade` (sun/hemi), `world.ts` (caveTorches). *Casas não têm interior navegável
> (só a dungeon); o brilho de janelas/lanternas à noite já cobre o exterior delas.*

### Fase 37 — Rim light / outline consistente ✅
> **Rim light por Fresnel** injetado no material toon (`assets.ts:addRim`, chamado no `toonify` →
> cobre personagens **e** todos os props GLB de forma coesa): `pow(1 - dot(normal, view), 2.6)`
> soma uma borda quente (`0xffe9c8`) na silhueta, independente da luz da cena. Combinado com o
> contorno escuro (consertado nesta sessão), fecha o "legível contra QUALQUER fundo": o contorno
> escuro resolve fundo claro (dia), o rim resolve fundo escuro (**dentro da caverna**, onde o
> contorno some no breu). Verificado no preview: 0 erros de shader; de dia, borda quente sutil +
> contorno nos personagens/NPCs; na caverna, herói e hobbes com **silhueta iluminada saltando do
> escuro**; **120 FPS** (fresnel por-pixel, sem geometria extra). `assets.ts:addRim/toonify`.
> *`RIM` (cor/power/força) centralizado p/ tuning. Hull-outline em mais props-chave (baús/portais)
> fica como refino opcional — o rim já dá coesão a tudo mais barato.*
> **Bugfix noturno (feedback do dono):** rim/env-sheen eram constantes → atores ficavam "acesos"
> à noite (armadura brilhando no escuro). Agora `rimStrengthU`/`nightDimU` (compartilhados, por
> frame via `nightF`) fazem o rim cair e os atores **escurecerem à noite** (clima mais dark),
> **exceto na caverna** (guard por `_sCave` — lá as tochas iluminam). Verificado: noite escura,
> dia e caverna intactos, 120 FPS. `assets.ts:addRim`, `game.ts:updateColorGrade`.

### Fase 38 — Reflexos (env map) ✅
> Tudo é toon (ignora envMap tradicional) → reflexos **procedurais** coesos com o estilo.
> **(1) Água reflete o céu+sol** (`world.ts:makeWaterMaterial`): `reflect(-V,N)` amostra o gradiente
> do céu (horizonte→zênite, uniforms atualizados por frame da `scene.background`) + disco do sol,
> pesado pelo fresnel. Verificado: mesma água **azul ao meio-dia vs. quente no dusk** → reage ao céu.
> **(2) Metal/armadura** (`assets.ts:addRim`, env-sheen): materiais metálicos (detectados por **nome**
> — Armor/Helmet/Gold/sword…; metalness dos packs é inútil, vem 1 em tudo) ganham um brilho fresnel
> tingido por uma cor de ambiente **compartilhada** (`envUniform`, padrão waterUniforms) atualizada
> por frame com a cor do céu (na caverna vira o âmbar das tochas). Verificado: 5 materiais metálicos
> corretos no herói/NPC; env-color **8fc4ec (meio-dia) → c9adac (dusk)** → o brilho do metal reage;
> 0 erros de shader; **~115 FPS**. `world.ts` (água), `assets.ts:envUniform/addRim`, `game.ts` (update).
> *Reflexo de espelho real (render target/SSR) fica caro; o reflexo procedural entrega o "reage ao
> ambiente" barato e no estilo.*

### Fase 39 — Anti-aliasing & nitidez ✅
> O composer contornava o MSAA do renderer → bordas low-poly/contorno serrilhadas. Adicionados 2
> passes no fim do pipeline (em `core.ts`, sobre a imagem já tonemapeada em sRGB): **`SMAAPass`**
> (AA pós, estável em movimento, sem ghosting temporal do TAA) + **sharpen** sutil (unsharp mask
> 3×3, `uAmount 0.35`) que devolve a crocância que o AA suaviza. Verificado no preview com A/B
> (`window.FABLE.smaa.enabled` / `.sharpen.enabled`): serrilhado nítido no telhado diagonal/bordas
> da casa **some com o SMAA**, textura segue crocante com o sharpen; 0 erros de shader; **~114 FPS**.
> `core.ts:smaa/sharpen`. *Optei por SMAA em vez de TAA: o TAA precisa de jitter+histórico e gera
> ghosting em cena com muito movimento (fauna/inimigos/vento) — o SMAA entrega imagem estável sem isso.*

### Fase 40 — DOF, vignette e grain sutil ✅
> **Grão de filme** animado no passe de sharpen (`core.ts`, ruído por-pixel mais visível nas
> sombras, sempre sutil). **Vinheta** já existia (Fase 30/35) e agora **fecha mais em diálogo**.
> **DOF leve** (`dof` pass, após o OutputPass): desfoque com foco no herói (projetado na tela) e
> borra crescente com a distância do foco — **acionado em diálogo/cutscene** (lê `dialog.style.
> display`), com early-out (`uDof≈0` → passthrough grátis fora de conversa). Tudo suavizado em
> `game.ts:updateColorGrade` (`_sDof`). Verificado no preview: sem diálogo tudo nítido; abrindo o
> diálogo, **periferia (prédios/NPCs/barris) desfoca e o herói+caixa de fala ficam no foco** +
> vinheta mais fechada = enquadramento de conversa; **119 FPS ativo e inativo**; 0 erros de shader.
> `core.ts:dof/SharpenShader`, `game.ts:updateColorGrade`.

---

## BLOCO E — VFX, animação avançada, performance & polish ⬜

### Fase 41 — Conformação ao terreno (pés na ladeira) ✅
> `groundAlign()` em `game.ts`: estima a **normal do terreno** sob o ator (gradiente de `terrainHeight`
> em ±1.1u) e inclina o ator para ela — com **meia-inclinação** (lerp 0.5 p/ cima, não deita demais).
> Assim, em ladeira o corpo conforma e os pés não flutuam/afundam num lado. Aplicado no `wrapper`
> (espaço-mundo) de **fauna, inimigos e cão**; o **herói** é tratado à parte (wrapper dentro do
> group que faz facing/rolamento) — a normal do mundo é levada ao frame local do group e o tilt é
> **slerpado** no wrapper, desligado ao rolar/pular. Verificado no preview: numa encosta de ~38°, o
> wrapper do herói inclina **~9.9°** (quaternion não-identidade) e o modelo conforma; **120 FPS** com
> 55 inimigos + 9 fauna alinhados; 0 erros. `game.ts:groundAlign`.
> *Honestidade: é **conformação de corpo à inclinação**, não IK de 2 ossos por pé — o IK real por
> perna é frágil nos rigs variados dos packs e quase invisível nesta câmera; a conformação entrega
> o "não desliza/afunda" de forma robusta. IK esquelética por pé fica como refino do Bloco E.*

### Fase 42 — Blending upper/lower body ✅
> `Actor.triggerUpper()` (`assets.ts`): toca uma **ação ADITIVA** (`makeClipAdditive` relativo ao
> frame 0 + `AdditiveAnimationBlendMode`) por cima da locomoção, sem tocar no base/oneShot → os
> braços atacam/miram enquanto as pernas seguem andando. Clips cacheados por ator; ao terminar, a
> camada para no frame ~neutro (sem pop). No `driveHeroActor` (`game.ts`) o **ataque/tiro do herói**
> virou `triggerUpper` (rolar/morrer seguem full-body). Verificado objetivamente no preview: durante
> o golpe, o base 'Run' segue **rodando a peso 1** e as pernas animam de verdade (footWorldY 1.27→0.94,
> UpperLegL girando, base.time avançando) — antes o ataque apagava o andar; a camada aditiva encerra
> limpa (`isRunning=false`, sem resíduo); pose de meio-golpe natural; 0 erros; **~112 FPS**.
> `assets.ts:Actor.triggerUpper`, `game.ts:driveHeroActor`. *Inimigos seguem com ataque full-body
> (param pra golpear, o que é legível); estender o aditivo a eles fica como refino opcional.*

### Fase 43 — VFX de combate ✅
> Três camadas de feedback de golpe em `game.ts`, sobre o sistema `addEffect`: **(1) impacto** —
> no evento `edmg` (inimigo danificado), `impactBurst()` solta um flash quente + **faíscas** douradas
> e **sangue estilizado** (crimson) em jato balístico (posição paramétrica em k, sem depender de dt),
> maior no crítico; **(2) trilha de lâmina** — `bladeSwoosh()` um crescente claro que varre à frente
> do herói a cada golpe corpo-a-corpo (na direção do facing); **(3) hit-stop** — `hitStopT` escala o
> `dt` do loop pra ~14% por ~50–80ms só no MEU golpe melee (mais forte no crítico) → dá "peso".
> Verificado no preview: swoosh + faíscas + sangue visíveis no screenshot; hit-stop medido
> objetivamente (anim avança 0.015s vs 0.109s normal → ratio **0.14**); **120 FPS**; 0 erros.
> `game.ts:impactBurst/bladeSwoosh/hitStopT`. Debug em `window.FABLE.vfx`.

### Fase 44 — VFX de magia por escola ✅
> Assinaturas visuais distintas por escola em `game.ts`, cada uma com partículas **e luz própria**:
> **FOGO** (`fireBurst`, evento `boom` + rastro no projétil da Bola de Fogo) — núcleo quente que
> expande e esfria (amarelo→laranja→brasa) + brasas subindo + luz laranja; **RAIO** (`lightningStrike`,
> evento `bolt`) — raio principal + ramos + faíscas elétricas + flash azul-branco frio; **AR/FORÇA**
> (`shockDust`, Empurrão) — anel + poeira radial. A "luz própria" usa um **pool fixo de 4 PointLights**
> (`_spellLights`): add/remove de luz recompila TODOS os shaders da cena → **travava ao spammar**; o
> pool fica sempre na cena (intensidade 0 ocioso) → contagem de luzes constante, zero recompile.
> Verificado no preview: fogo/raio/força com assinaturas nítidas (screenshots à noite — o fogo
> ilumina a cena de laranja); 5 casts em 0.3ms sem travar, luzes **24→24** (pool estável); 0 erros.
> `game.ts:fireBurst/lightningStrike/shockDust/_spellLights`. Debug em `window.FABLE.vfx`.
> *Gelo/Sombra ainda não existem como feitiços (vêm na Fase 7 do plano-mestre) — o framework de
> partículas+luz por escola já está pronto pra eles. Vigiar: a vila já tem ~20 point lights; +4 do
> pool é modesto mas some no orçamento de luz em máquina fraca.*

### Fase 45 — Partículas ambientais ✅
> **Poeira ao sol** (`motes`) e **vaga-lumes à noite** (`fireflies`) já existiam do Bloco C. Adicionadas
> em `world.ts`: **fagulhas de fogueira** — cada `addCampfire` ganha um `Points` aditivo (10/16 pts)
> que sobe da chama, deriva e recicla (posição paramétrica em `time`); e **folhas ao vento** — um
> `Points` com `vertexColors` (âmbar/verdes) com deriva direcional (+x que envolve) + rajada + bob,
> seguindo o jogador e sumindo à noite. Verificado no preview (objetivo, já que a aba throttlava o
> rAF): 8 nuvens de `Points` na cena — **3 de fagulhas** (10/10/16 aditivas) + **folhas** (90 pts,
> vertexColors) + motes/fireflies/estrelas; fagulhas **animando** (Y espalhado 0.72→3.05, subindo e
> reciclando); screenshot do acampamento ao dusk mostra as fagulhas subindo do fogo + partículas no
> ar. `world.ts:addCampfire (embers)`, `buildAmbientLife/updateWorld (windLeaves)`. *Custo desprezível
> (Points, poucas centenas de pontos). FPS não medido nesta leva — aba do preview throttlando o rAF.*

### Fase 46 — LOD por distância ✅
> **Distance-culling** em `world.ts`: `placeProp` registra props num `cullables` com uma distância
> de corte por tipo — detalhe fino (scatter/vegetação) some a **150u**, rochas a 240u, árvores a
> **290u** (só além da névoa → sem pop visível). `updateCulling` reavalia a visibilidade por
> distância do jogador ~5×/s (throttled, custo desprezível). Verificado no preview com A/B
> (`window.FABLE.lod.setCulling`): num ponto central, **159 de 396 props (40%) são cortados** — 40%
> menos objetos submetidos (draw + sombra) — e os screenshots on-vs-off ficam **idênticos** (a névoa
> + o tamanho minúsculo escondem o corte); 0 erros. `world.ts:cullables/updateCulling/placeProp`.
> *Honestidade: fiz LOD por distância (corte), **não** impostores billboard renderizados (precisam de
> render-target por tipo de árvore — mais código/risco; a névoa já esconde as árvores distantes, e a
> Fase 48 (instancing) vai baratear os props repetidos de perto). O corte já entrega o "horizonte
> não derruba o frame". `renderer.info.render.calls` não serve de métrica aqui — lê só o último passe
> do composer (fullscreen); a contagem de props cortados é a prova real.*

### Fase 47 — Culling & object pooling de VFX ✅
> **Pool de partículas** em `game.ts`: o `_particle` (usado por todo VFX de combate/magia — faíscas,
> sangue, brasas, faíscas elétricas, rastro de fogo) parou de alocar `Mesh`+`Material` por partícula.
> Agora reusa malhas de um **free-stack O(1)** (`_partFree`/`_partActive`), sempre na cena,
> `visible=false` quando livres, com update paramétrico próprio. **Zero GC** durante o combate.
> **Frustum culling** já é automático no three (por objeto). **Orçamento de frame** monitorado via
> `_frameMs` (média móvel) exposto em `window.FABLE.perf()` (frameMs/fps + stats do pool + nº de
> efeitos). Verificado no preview objetivamente: batch de 8 fireBursts → **96 partículas ativas**;
> depois de expirarem → **96 livres**; batch 2 de 8 → pool **continua 96** (reusou, não cresceu pra
> 192) = **`reusedNotGrown: true`**; jogo renderiza igual; 0 erros. `game.ts:_particle/updateParticles/perf`.
> *Occlusion culling real (além do frustum) fica de fora — three não traz nativo e o ganho não
> justifica o custo aqui; o pooling + o LOD da Fase 46 já seguram o orçamento.*

### Fase 48 — Instancing em massa & batching ✅
> Grama (~2600), flores e os detritos de chão (Fase 28: pedrinhas/galhos/folhas) já eram
> `InstancedMesh`. Adicionado: **vegetação de chão** (arbustos/samambaias/flores/cogumelos/tocos,
> ~280 clones individuais) agora vai por `instanceProp` em `world.ts` — agrupa as placements pelo
> GLB resolvido e cria **1 `InstancedMesh` por submesh** (compõe matriz do prop × matriz local da
> submesh → suporta GLB multi-mesh). Verificado no preview: cena tem **48 InstancedMeshes segurando
> 4322 instâncias**; o scatter virou **37 InstancedMeshes** (era ~280 objetos); as instâncias estão
> nas posições certas (amostra espalhada 118u, todas visíveis) e a vegetação renderiza normal
> (flores/samambaias no lugar, sem deformar); 0 erros. `world.ts:instanceProp/dressWorld`.
> *Trade-off honesto: o scatter instanciado perde o sway individual (sutil demais pra importar) e o
> distance-cull da Fase 46 (mas agora é 1 draw call fixo, então não precisa cull). **Árvores/rochas
> seguem individuais** — são multi-mesh COM sway visível; instanciá-las pede wind por-instância no
> shader (como a grama) — fica como refino futuro se o frame apertar em máquina fraca.*

### Fase 49 — Otimização de texturas/materiais ✅
> **Duas frentes.** **(1) Peso morto:** `public/` é copiado verbatim pro build, e havia ~224MB
> de fontes que o jogo **nunca carrega** (702 `.fbx`, 50 `.blend`, 702 `.obj`/`.mtl`, 329 `.dae`,
> 329 `.stl`) — removidos do repo (mantido só `License.txt` CC0). **(2) Compressão Draco** dos 768
> modelos carregados (`.gltf`/`.glb`) via `scripts/compress-models.mjs` (gltf-transform v4 +
> draco3d): `dedup` + `prune` + `resample` (poda keyframes) + `weld` + `draco` (geometria). Truque
> central: o resultado é escrito como **GLB binário no mesmo arquivo `.gltf`** — o `GLTFLoader`
> detecta o formato pelos **magic bytes**, não pela extensão → **zero edição nos 83 caminhos
> hardcoded**, 1 arquivo por modelo, sem base64, sem `.bin` irmão. Runtime: `DRACOLoader` ligado ao
> loader compartilhado em `assets.ts`, decoder servido de `public/draco/` (só o decoder, sem o
> encoder). Modelos não-Draco seguem carregando pelo mesmo loader.
> **Keep-if-smaller:** Draco tem overhead fixo → em props minúsculos ele *incha* (ex.: `wall.glb`
> 8K→16K). O script só sobrescreve se o resultado for >8% menor; senão **mantém o original**
> (161 dos 768 arquivos ficaram originais). Assim nada é inflado à toa.
> **Resultados:** `public/models` **410M → 48M** (88% menor no total, contando os fontes mortos);
> payload carregado **173.5MB → 35.6MB** (80%); ex.: `Wolf.gltf` 3.03→0.52MB preservando as 12
> animações/skin. **Draco é lossless nos bounds** (verificado: bbox do módulo idêntico antes/depois
> — foi o que descartou o Draco como causa do bug das casas na Fase 50).
> **Verificado no preview:** 0 erros de console/shader, **0 requests falhados** (decoder + todos os
> modelos carregam); geometria decodificada objetivamente — herói `heroActor.root` **12103 v**,
> fauna **8556 v**, cena inteira **248 skinned meshes / 449k vértices**; galinhas/cão/NPCs/herói
> íntegros no screenshot (sem T-pose); **120 FPS** (8.33ms). `scripts/compress-models.mjs`,
> `assets.ts` (DRACOLoader), `public/draco/`.
> **Honestidade (o "cabe na VRAM"):** pulei **KTX2/atlas de textura** de propósito — as texturas
> aqui são minúsculas (~10MB em pngs-paleta, muitos modelos usam vertex-color) e Draco encolhe
> **disco/download/decode-CPU**, mas geometria **decodificada ocupa a mesma VRAM**. O ganho real e
> concreto desta fase é **load-time + tamanho de deploy/repo** (−88%), não um corte dramático de
> VRAM. KTX2 fica como refino opcional se algum dia entrarem texturas grandes (o framework de
> loaders já está montado — bastaria plugar o `KTX2Loader`).

### Fase 50 — Passe final de polish & trailer-ready 🔨 *(em andamento)*
Câmera, screenshots de divulgação, benchmark em máquina modesta, checklist de arestas.
**Pronto:** um trailer de 60s parece um indie de verdade e roda liso fora da máquina do dev.

> **Auditoria visual (feita):** tour por meio-dia/noite/tarde em 16:9. O jogo já lê como indie de
> verdade — a **noite** é o ponto forte (emissivos/bloom, vaga-lumes, poças de lanterna), o
> meio-dia na vila é coeso, 120 FPS. Nenhuma geometria quebrada nova; a "coluna preta" do 1º shot
> era só o viewport em retrato espremendo a cena.
> **Bug das casas consertado (feedback do dono):** paredes "destacadas" com vãos e telhado
> pequeno/estranho — **bug pré-existente** (não do Draco, provado por bbox idêntico). Causa: o
> módulo de parede do town kit tem a origem fora do centro (malha deslocada ~0.45 no X local); como
> cada lado usa rotação diferente, o offset jogava frente/fundo pra dentro e leste/oeste pra fora →
> retângulo inconsistente com degrau/vão em cada canto, e o telhado (raio pequeno) não cobria.
> **Fix em `world.ts:buildTownHouse`:** mede o offset por peça e o cancela na posição (todas as
> paredes rente à borda) + raio do telhado 0.66→0.82 (cobre com beiral). Verificado: footprint das
> paredes agora **simétrico (6.16×6.16, era assimétrico ~6.4×2.4)**, canto limpo, telhado com
> beiral, 0 erros. `world.ts:buildTownHouse`.
> **Falta (subjetivo, aguardando direção do dono):** variar/dessaturar telhados laranja, afrouxar
> vinheta de combate na vila, galeria de beauty shots, benchmark em máquina modesta, checklist final.

---

## Ordem sugerida & princípios

```
BLOCO A (1-10)  ▶ COMEÇAR AQUI — sem isto, o resto assenta sobre modelos quebrados
BLOCO B (11-20) ▶ maior salto visual isolado: o mundo deixa de ser procedural
BLOCO C (21-30) ▶ a moldura (terreno/água/céu) que faz os props brilharem
BLOCO D (31-40) ▶ luz e pós — a "cara de jogo"; caro em performance, medir sempre
BLOCO E (41-50) ▶ VFX, animação fina e otimização; fecha pronto para mostrar
```

- **Verificar no preview** antes de dizer "pronto" — a Fase 11 do plano-mestre foi commitada
  sem isso e quebrou. Este plano não repete o erro.
- **Cada prop nasce calibrado** — escala da `SCALE_REF`, collider do bounding box, pivô no chão.
- **Fallback gracioso** — migrar peça por peça; o procedural cobre o que ainda não migrou.
- **Servidor autoritativo intocado** — tudo aqui é cliente/render; nada muda a simulação.
- **Performance é feature** — Blocos D/E podem pesar; medir frame budget a cada fase.
```
