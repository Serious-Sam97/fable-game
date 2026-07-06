# FABLE — Plano de Combate de 50 Fases
### Do "tab-target + hotbar" a um combate de ação estilo *Fable: The Lost Chapters*

> Documento focado em **combate, controles e câmera**. Complementa
> [PLANO_30_FASES.md](PLANO_30_FASES.md) (visão), [ROADMAP.md](ROADMAP.md) (features) e
> [PLANO_GRAFICO_50_FASES.md](PLANO_GRAFICO_50_FASES.md) (visual). O dono decidiu **trocar** o
> combate atual (WASD + câmera-drag orbital + Tab-alvo + hotbar 1-8) por um **combate de ação
> clique-pra-agir estilo Fable 1**: mouse controla a câmera, **LMB** melee, **RMB** à distância,
> **magia** carregável, com block/parry, dodge e multiplicador de combate.
>
> **Regra de ouro:** cada fase termina jogável, commitada e **verificada** (no preview, com o
> jogo rodando — nada de "pronto" sem provar). O **sim autoritativo compartilhado** (`src/shared/sim/`)
> continua sendo a fonte da verdade — nada de hack só-cliente que o servidor não valide.

**Legenda:** ✅ concluída · 🔨 em andamento · ⬜ planejada

---

## 🔍 Diagnóstico do estado atual (o ponto de partida)

O combate **já é um action-RPG servidor-autoritativo funcional** — este plano é uma **transformação**
do modelo de controle e da sensação, não uma reconstrução. O que já existe (mapeado no código):

| Sistema | Onde | Estado |
|---|---|---|
| **Sim compartilhado determinístico** (roda no cliente E no servidor) | `src/shared/sim/` (`combat.ts`, `enemies.ts`) | ✅ a base difícil da prediction |
| **Servidor autoritativo** 30Hz tick / 15Hz snapshot / 12Hz client-send | `server/server.ts:166-199` | ✅ |
| **Combate validado no servidor** (GCD 0.85s, cooldown, range ×1.3 folga, dano, crít) | `sim/combat.ts:50-69` | ✅ |
| **Combo de 3 golpes** (1× / 1.1× / 1.3× + knockback) | `sim/combat.ts:71-88` | ✅ |
| **Magia**: Bola de Fogo (burn), Relâmpago (chain), Empurrão (AoE), Tempo Lento, Cura | `game.ts:1218-1254`, `defs/abilities.ts` | ✅ |
| **Disciplinas** Força/Skill/Vontade (XP = 0.6× dano da fonte) | `game.ts:178-191, 737-738` | ✅ |
| **Block/parry** (segura Q; parry na janela de 0.3s → atordoa 1.5s) | `game.ts:1117-1129` | ✅ |
| **Dodge/roll** com i-frames (0.45s) e custo por peso | `game.ts:1140-1152` | ✅ |
| **Multiplicador de combate** (sobe por acerto, zera ao apanhar) | `game.ts:732-733`, `sim/combat.ts:32-39` | ✅ |
| **Talentos** (12, 3 árvores), armas visíveis, armaduras, raridades | `game.ts`, ROADMAP | ✅ |

**Os 3 gaps que separam isto do combate Fable 1** (as causas-raiz deste plano):

| Gap | Como é hoje | Como Fable 1 precisa | Onde |
|---|---|---|---|
| **1. Modelo de controle** | WASD move; **mouse = drag orbital**; **Tab** escolhe alvo; **teclas 1-8** disparam habilidades; LMB=drag/select, RMB=nada | **Mouselook** (mouse = câmera livre); **LMB** = melee; **RMB** = arco; **magia** carregável num botão; herói orienta pela câmera; sem hotbar/Tab | `game.ts:2339-2403, 3258-3276` |
| **2. Hit detection** | ataque exige `targetId` + distância linear (`hypot < range`) | **arco frontal / raycast direcional** — bate em quem está na frente, sem travar alvo | `sim/combat.ts:50-69` |
| **3. Responsividade online** | sem prediction/reconciliation; snapshot 15Hz; timing de dodge/block **não** existe no servidor | prediction leve do herói, **30Hz**, mensagens de dodge/block/carga com timestamp, janelas folgadas (±150ms) | `server.ts`, `protocol.ts`, `net.ts` |

---

## ⚠️ Decisão-chave arquitetural (precisa do teu aval)

Combate de ação em tempo real num jogo **co-op servidor-autoritativo** tem um tradeoff central de
netcode. Minha recomendação, embutida na ordem das fases:

- **Construir o feel primeiro no SIM LOCAL (solo, latência zero)** — Blocos A/B/C. O jogo já roda
  `combatLocal`/`localSim` quando offline; ali dá pra iterar a sensação Fable instantaneamente,
  sem netcode mascarando bugs. **Tudo vai no sim compartilhado** (autoritativo), não em hack só-cliente.
- **Depois, o Bloco D traz pra online responsivo** — prediction leve + reconciliação + validação de
  timing com **janelas folgadas (±150ms)**, não rollback competitivo. Fable é single-player de alma;
  co-op PvE tolera folga; **PvP é opt-in e distante** (ROADMAP Fase 22). Se um dia quiser PvP justo,
  aí sim entra rollback pesado — fora do escopo destas 50 fases.

**Alternativa** (se preferires): fazer netcode **primeiro** (a "regra de ouro" do ROADMAP diz MP é
arquitetura). Não fiz assim porque o sim compartilhado **já existe** — as mudanças de combate dos
Blocos A/B/C entram no sim autoritativo e já nascem MP-compatíveis; só a *responsividade* (prediction,
30Hz, timing) fica pro Bloco D. Me diz se quer inverter a ordem.

**Esquema de controle proposto** (ajustável — confirma o que preferes):

| Input | Hoje | Proposto (Fable 1) |
|---|---|---|
| Mouse mover | drag = orbita câmera | **câmera livre (mouselook)**, herói vira junto |
| **LMB** | drag/clique-seleciona | **ataque melee** (arma equipada) |
| **RMB** | nada | **ataque à distância** (arco) — segura = tensiona |
| **Magia** | teclas 2-6 | **segurar tecla/botão dedicado = carrega nível**, solta = lança; feitiço ativo via roda/quickslot |
| **Shift** | rolar | **dodge** (mantém) |
| **Espaço** | pular | pular (mantém) — ou vira dodge? |
| **Q / botão** | bloquear (segura) | **bloquear/parry** (mantém, reavaliar binding) |
| **Tab / 1-8** | alvo / hotbar | **aposentados** (lock-on opcional pra flourish) |

---

## BLOCO A — Câmera & Controle: o novo esquema ✅ *(a virada de mouselook)*
*Fundação de tudo. Construído e verificado no sim LOCAL (solo).*
> **CONCLUÍDO (Fases 1-10 ✅):** mouselook + movimento relativo à câmera + LMB melee frontal +
> soft-lock automático + RMB arco com retícula + magia (E + roda de feitiços) + dodge/block afinados +
> HUD de ação e câmera suavizada + esquema antigo (Tab/hotbar) aposentado. **O controle Fable está no
> lugar.** Debug hooks em `window.FABLE.combat` (attack/ranged/castSpell/dodge/frontal/radial) +
> getters (camYaw/mouseLocked/target/lockedTarget/activeSpell). **Bugfix do engate (dono testando):** o
> mouselook não travava — `canLock()` checava o `style.display` **inline** dos painéis (`""`), mas eles
> são escondidos por **CSS** (`display:none` computado) → `requestPointerLock` nunca era chamado. Corrigido
> (checa display **computado**) + engate movido pro **mousedown** (qualquer clique trava, não só clique-sem-
> arrastar). **Confirmado funcionando pelo dono.** `game.ts:canLock/mousedown`. Debug hooks novos em `window.FABLE`: `combat.attack()`, `combat.frontal()`,
> `camYaw`, `mouseLocked` (ações de combate são gated por pointer-lock → testadas por aí).
> *Limitação de verificação:* o **engate real do pointer-lock** exige um clique humano (o browser
> não trava por evento sintético) — o dono confirma o feel do mouselook no jogo real.

### Fase 1 — Câmera mouselook (over-the-shoulder) ✅
> Pointer-lock mouselook (mouse = câmera livre, sem segurar botão) + fallback de drag quando
> destravado (nunca fica sem controle) + destrava ao abrir chat/painéis/diálogo + leve offset
> over-the-shoulder. Verificado: 0 erros, drag rotaciona a câmera (plumbing de `camYaw` ok), o
> branch travado usa a mesma matemática. `game.ts:2384-2430,3258-3276`.
Trocar a câmera orbital-por-drag (`camYaw/camPitch/camDist`, `game.ts:2340,3258-3276`) por
**mouselook livre**: o mouse move a câmera direto (com pointer-lock opcional), 3ª pessoa por cima do
ombro. Manter colisão com terreno e screen-shake.
**Pronto:** mexer o mouse gira a câmera sem segurar botão; a câmera segue o herói suave, sem clipar no chão.

### Fase 2 — Locomoção relativa à câmera + herói orienta pela câmera ✅
> O movimento já era relativo à câmera; a mudança foi o **facing**: herói encara a câmera (não o
> movimento) → W frente, A/D strafe, S ré, todos mirando pra frente. Verificado objetivamente: W
> move em camFwd, D move em camera-right, e `heroRotY` fica = câmera nos dois (não vira pro strafe,
> como o código antigo faria). Anims de strafe/ré dedicadas: Bloco B. `game.ts:3102-3124`.
WASD passa a mover **relativo à direção da câmera** (frente = pra onde olho); `heroModel.group.rotation.y`
segue o yaw da câmera (ou a direção de movimento, com strafe). Reaproveita `groundAlign` da Fase 41 gráfica.
**Pronto:** ando na direção que olho; o herói encara a câmera/movimento naturalmente.

### Fase 3 — LMB = ataque melee de ação ✅
> LMB (sob lock) → `meleeAttack()`: `frontalTarget()` escolhe o inimigo mais alinhado à mira (cone
> ~150°, dentro do alcance) e dispara o golpe via o pipeline existente (`tryAbility`→`castAbility`,
> GCD/cooldown/combo no servidor); sem alvo → golpe no ar. Verificado: `frontal()` retorna o inimigo
> à frente, e o ataque emite `{"t":"cast","key":"golpe","targetId":40}` pro servidor (pipeline
> validado intocado). `game.ts:meleeAttack/frontalTarget`, mousedown handler.
LMB dispara o "golpe" (hoje slot 1, `game.ts:1199-1217`) **sem precisar de Tab-alvo**: usa a direção
da câmera. Libera o LMB do drag-de-câmera (que sai na Fase 1). Mantém `swingT`/anim/`bladeSwoosh`.
**Pronto:** clicar LMB dá um golpe pra frente; segurar/repetir encadeia o combo existente.

### Fase 4 — Mira assistida frontal (soft-target sem Tab) ✅
> Soft-lock contínuo no tick: `target = frontalTarget(alcance+5)` a cada frame → o anel/frame de
> alvo segue automaticamente quem está na mira, sem Tab; limpa ao olhar pra longe. `meleeAttack`
> prefere o alvo do soft-lock (se no alcance) e dá um **lunge leve** pro alvo (fecha o vão até a
> borda, cap 0.9u, sem atravessar). Verificado: `frontal()` mira quem está à frente e ignora quem
> está atrás (vira 180° → null); lunge dispara apontando pro alvo (`lungeT=0.13`, mag 0.9u); o
> frame "Guarda de Pedravento" apareceu auto-adquirido no screenshot. `game.ts:meleeAttack, tick soft-lock`.
Substituir Tab-target por **auto-alvo frontal**: na hora do golpe, escolhe o inimigo dentro de um
**arco frontal** (ângulo + alcance) mais alinhado à câmera. Herói faz um leve *lunge*/rotação pro alvo.
**Pronto:** bater mira sozinho no inimigo à frente sem eu travar alvo; nada de Tab.

### Fase 5 — RMB = ataque à distância (arco) ✅
> RMB (sob lock) → `rangedAttack()`: com arco equipado, atira no alvo do soft-lock/frontal (dir. da
> mira) pelo pipeline existente (golpe-com-arco = flecha). **Retícula** (crosshair DOM no centro)
> aparece no mouselook e fica **vermelha ao travar** num inimigo, branca solta. Verificado: com
> `arco_cacador` equipado e inimigo à frente, o RMB emite `{"t":"cast","key":"golpe","targetId":40}`
> pro servidor; retícula existe e cor reflete o alvo (`rgba(255,90,90)` travada). Tensionar/carga:
> Fase 21. Multi-arma (melee+arco juntos): Bloco C. `game.ts:rangedAttack, retícula`.
RMB dispara o arco quando equipado (hoje detectado em `game.ts:1202`). Retícula na tela; direção da
câmera define o tiro. (Tensionar/carga fica pro Bloco C — aqui é o binding + retícula.)
**Pronto:** com arco equipado, RMB atira na direção da mira com uma retícula visível.

### Fase 6 — Magia: binding de carga + seleção de feitiço ✅
> Magia saiu da hotbar 1-8 (decisão do dono: **tecla dedicada + roda**). **Tecla E** lança o feitiço
> ativo (via `tryAbility(activeSpell)` → usa o alvo do soft-lock / direção da mira). **Segurar R**
> abre uma **roda radial** de 5 feitiços (🔥⚡💨⏳💚); o mouse escolhe a fatia pela direção; soltar R
> seleciona. Indicador do feitiço ativo no HUD. Verificado: abrir mostra a roda; mover o mouse pra
> direita seleciona o feitiço da direita (⚡); E emite `{"t":"cast","key":"empurrao"}` pro servidor e
> consome Vontade (60→40); screenshot mostra a roda com os 5 feitiços. **Carga por nível (segurar =
> nível 1-3): Fase 21/23** (aqui é o binding + seleção). `game.ts:roda de feitiços, tecla E/R`.
Magia sai da hotbar 1-8 pra um **botão dedicado que carrega segurando** (solta = lança); o feitiço
ativo é escolhido por **roda radial/quickslot**. (A carga por nível vem no Bloco C.) Reusa Bola/Relâmpago/Empurrão.
**Pronto:** seguro o botão de magia, escolho o feitiço na roda, solto e ele sai — sem teclas numéricas.

### Fase 7 — Dodge & block no novo esquema ✅
> Bindings mantidos (confortáveis com a mão esquerda no WASD): **Shift = dodge**, **Q = block/parry**.
> Melhorias no dodge (`tryRoll`): direção agora vem do **WASD atual relativo à câmera** (antes usava a
> última direção, stale se parado); **sem input → backstep** (pra trás da mira); **buffer de input**
> (apertar Shift durante o rolamento dispara ao terminar). Verificado: W→dodge em camera-forward,
> sem input→oposto da mira (backstep), 2º Shift no rolamento seta o buffer (`bufferWorks`), i-frames
> (invulnT 0.45); block liga/desliga no Q. `game.ts:tryRoll, tick roll-end`.
Reavaliar bindings: **Shift = dodge** (mantém i-frames), **block/parry** num botão que faça sentido com
LMB/RMB ocupados (ex.: segurar RMB sem arco = escudo, ou tecla dedicada). Feel responsivo, buffer de input.
**Pronto:** dodge e block funcionam confortáveis com as mãos no novo esquema (mouse + WASD).

### Fase 8 — HUD de ação & feel de câmera ✅
> Muito já veio das fases anteriores (retícula + cor no alvo da Fase 5, frame de alvo/anel do soft-lock
> da Fase 4, indicador de feitiço ativo da Fase 6, colisão de câmera com terreno, buffer de input da
> Fase 7). Adicionado agora: **suavização do follow** da câmera (`camFollow.lerp`, rate 16 — esconde o
> jitter de dodge/lunge/terreno) e **hit-marker** (a retícula pulsa `scale(1.7)`/`2` no crítico quando
> VOCÊ acerta, no evento `edmg` meu). Verificado: câmera atrasa e alcança o herói ao teleportar
> (suaviza, não gruda), renderiza sem regressão, 0 erros. *Honestidade: **colisão de câmera contra
> geometria** (raycast pra não clipar em paredes) foi adiada — full-scene raycast por frame é caro e o
> item é "opcional"; o pull-up por terreno cobre o caso comum. O flash do hit-marker está fiado mas é
> transiente demais pra capturar no preview throttlado.* `game.ts:camFollow, edmg (reticle)`.
Retícula/indicador de mira, feedback de alvo frontal, indicador de carga (magia/arco), câmera com leve
*lag*/*collision*/*lock-on suave* opcional. Input buffering e cancelamento pra responsividade.
**Pronto:** a tela comunica pra onde vou bater/atirar; a câmera é gostosa, sem enjoo nem clip.

### Fase 9 — Aposentar Tab-target + hotbar 1-8 ✅
> **Tab-alvo removido** (o soft-lock o substituiu) → **Tab agora é lock-on** (flourish target: trava/
> destrava no alvo atual, que fica fixo mesmo olhando pra longe; o soft-lock respeita o `lockedTarget`).
> **Teclas de habilidade 3-6 removidas**; **poções repostas em 1 (vida) / 2 (vontade)**. **Slots de
> habilidade da hotbar escondidos** e o texto de controles reescrito pro esquema novo. Verificado:
> Digit1 cura + consome poção, Digit3 não faz nada, Tab trava/destrava no alvo (`lockedIsTarget`), os 6
> slots ficam `display:none`, hint mostra "LMB golpe / RMB arco / E magia / Tab lock-on / 1-2 poções".
> `game.ts:Tab/Digit/soft-lock`, `index.html:hint+hotbar`.
Remover/migrar o Tab-target (`game.ts:2346-2355`) e os slots 1-8 (`game.ts:2370-2374`); poções vão pra
bindings novos; **lock-on opcional** (tecla) pra "flourish target" estilo Fable. Limpar HUD antigo.
**Pronto:** o esquema antigo sumiu; o novo cobre tudo (ataque, magia, poção, defesa) sem hotbar.

### Fase 10 — Vertical slice do controle ✅
> Prova de integração do esquema novo (nada de Tab/hotbar): soft-lock auto-mira, LMB golpe, dodge com
> i-frames, magia pela roda — todos coexistem num fluxo, sem erro. Verificado: cada peça produz seu
> efeito (cast enviado / i-frames / seleção) e rodam juntas; screenshot mostra o herói em combate com
> anel de soft-lock, frame de alvo e a HUD nova (barra de habilidades limpa, controles reescritos).
> *Honestidade: um kill scriptado contínuo é inviável no preview (online↔localSim, gcd, throttle de
> rAF e drift de IA se combinam) — mas é limitação do ambiente, não do código; as peças foram provadas
> uma a uma com gcd fresco. O "combate completo e confortável" final é o dono jogando com o mouse.*
Matar um inimigo do começo ao fim **100% no novo esquema** (solo): mover olhando, LMB melee, RMB arco,
magia carregada, dodge, block. Sem tocar em Tab/1-8.
**Pronto:** um combate solo completo e confortável prova o novo modelo de controle.

---

## BLOCO B — Melee de ação (o coração Fable) ✅ *(10/10 completo)*
*Peso, timing e leitura. No sim compartilhado; iterado em solo.*
> **CONCLUÍDO (Fases 11-20 ✅):** hit detection direcional (arco frontal multi-alvo) · combos por ritmo
> próprio (desacoplado do GCD) · flourish carregável (2.4× + stun/knock) · hitstun + knockback
> direcional · execuções (×4 no atordoado) · movesets por arma (swing/knock; martelo lento e pesado) ·
> block/parry com refluxo (parry→stun→execução) · dodge com i-frames + perfect-dodge · **multiplicador
> de fluência (Fase 19: só zera ao apanhar)** · vertical slice de grupo provada. **O coração do melee
> Fable está no lugar.** O feel final é o dono jogando; as mecânicas estão provadas no sim autoritativo.

### Fase 11 — Hit detection direcional ✅
> Primeira mudança no **sim autoritativo compartilhado**. O golpe melee ganhou um parâmetro `dir`
> (facing) e resolve por **arco frontal** (cos > 0.35 ≈ 139°, dentro do alcance da arma × folga de
> latência) em vez de `targetId` — acerta **todos** os inimigos à frente num swing. O arco (bow) e os
> feitiços seguem single-target (via `targetId`). Combo virou **por swing** (não por alvo): o 3º golpe
> bate 30% mais forte e empurra todos os acertados. Mudança em 4 arquivos: `protocol.ts` (`dir` no
> cast), `game.ts` (`castAbility` envia o facing), `server.ts` (repassa `dir`), `combat.ts` (o arco).
> Verificado no sim offline: 1 golpe acertou **os 3 inimigos** num arco frontal (dano 61/66/69);
> inimigo **atrás não é atingido** (`directional: true`); o **bow segue single-target** (só o alvo
> mirado). 0 erros de build. `combat.ts:cast/golpe`.
> *Nota: verifiquei via `combatLocal` (offline, mesmo `combat.ts` do servidor). O server docker usa o
> mesmo sim compartilhado (tsx watch recompila) → o online herda o arco.*

### Fase 12 — Combos por timing & feel de swing ✅
> O gargalo era o **GCD de 1s** (cliente) / 0.85s (servidor) — lento demais pra ação. O melee ganhou
> **lane e ritmo próprios**, desacoplados do GCD das magias: cliente `meleeReadyT` (**0.36s**), servidor
> `lastMelee` + `MELEE_GAP` (**0.30s**) — ~3× mais rápido, habilitando o combo por ritmo de clique (o
> combo de 3 golpes já é contado no servidor por swing, da Fase 11). `meleeAttack` reescrito: não passa
> mais pelo GCD do `tryAbility`; melee **sempre varre** (o arco frontal mira), arco/bow ainda precisa de
> alvo. Verificado: **magia → melee logo depois dispara** (lanes separadas, `decoupled: true`), 2º melee
> imediato é bloqueado pelo gap próprio, swing dispara, 0 erros. `game.ts:meleeAttack`, `combat.ts:lastMelee`.
> *O "feel" fluido final é o dono jogando; o desacoplamento e o ritmo estão provados.*

### Fase 13 — Flourish carregável ✅
> **Segurar LMB** carrega; **soltar** dispara: se segurou ≥ `FLOURISH_TIME` (0.5s) → **flourish**
> (golpe forte), senão → golpe normal (tap). O flourish (no `combat.ts`, via flag `flourish` no cast →
> protocolo/servidor) bate **2.4×**, com **alcance/arco maiores**, e **derruba/atordoa** (stun 1.3s +
> knock forte) TODOS os inimigos à frente. **Indicador de carga**: a retícula cresce e esquenta
> (laranja→amarelo cheio) enquanto segura; cancela ao destravar. Lunge maior no flourish. Verificado no
> sim: dano normal **66 → flourish 158** (2.4×), **stun aplicado** (`stunSet: true`) + knock; 0 erros.
> `combat.ts:golpe (flourish)`, `game.ts:meleeAttack/charge`, protocolo+servidor. *O feel de segurar/
> soltar é o dono jogando (agora que o mouselook engata).*

### Fase 14 — Reações a hit (hitstun, stagger, knockback direcional) ✅
> No sim (`enemies.ts`): novo **`hitstunT`** — todo golpe dá um **stagger breve** (melee 0.22s, ranged/
> magia 0.1s) que **interrompe o inimigo** (não persegue/ataca durante), sem o VFX de parry. O
> **knockback** virou **direcional em TODO golpe** (leve ~2.5; forte no finisher 8 / flourish 12) — no
> `combat.ts`, na direção do swing. E o knock foi **movido pra antes dos gates de stun/hitstun** → o
> inimigo é empurrado mesmo atordoado. A reação visual usa o flash emissivo (já existia) + o inimigo
> parando. Verificado no sim: golpe seta `hitstunT: 0.22` e `knockX: 2.5` direcional; durante o hitstun
> o inimigo **não persegue** (`staggered_didNotChase: true`) e recupera. `enemies.ts:hitstunT`, `combat.ts:knock`.
> *Anim de flinch dedicada por inimigo fica como polish (Bloco E); o stagger+flash já "lê" o impacto.*

### Fase 15 — Finalizadores / execuções ✅
> O loop Fable: **parry/flourish atordoa → você executa**. No `combat.ts`, um golpe melee contra um
> inimigo **atordoado** (`stunT > 0`) vira **execução** — dano **×4** (massivo) + evento **`eexec`**. É
> contextual e sem input novo: você atordoa (o "💫 atordoado" sinaliza) e o próximo golpe executa. No
> cliente, o `eexec` dispara VFX de peso: "⚔️ EXECUÇÃO!", **impacto forte + hit-stop + screenshake**. A
> execução bumpa o multiplicador (recompensa de fluência, via `hit`). Verificado no sim: golpe normal
> **62 → execução 264** (4.3×, `execIsMassive: true`); evento `eexec` dispara. `combat.ts:golpe (exec)`,
> `enemies.ts:SimEvent`, `game.ts:case 'eexec'`. *Anim de execução dedicada (câmera/finisher) é polish do Bloco E.*

### Fase 16 — Movesets por tipo de arma ✅
> Cada arma melee ganhou **ritmo (`swing`)** e **empurrão (`knock`)** próprios (em `items.ts`), somados
> ao dano/alcance que já variavam: **Espada Gasta** ágil (swing 0.9, knock 1), **Machado** pancada
> (1.05 / 1.4), **Espada Longa** alcance (1.0 / 1.0, range 4.3), **Martelo** lento e devastador
> (swing 1.5 → ~0.54s por golpe, knock 2.4). O `swing` modula o `meleeReadyT` no cliente (ritmo); o
> `knock` foi ao `CombatStats`/`PlayerState` (novo campo `wpnKnock`) → clampado no servidor → escala o
> empurrão no `combat.ts`. Verificado ponta-a-ponta: espada `knockX 2.5` → martelo `knockX 6` (2.4×,
> `hammerKnocksHarder: true`); 0 erros de build. `items.ts`, `abilities.ts/protocol.ts` (wpnKnock),
> `game.ts` (swing/state), `server.ts`, `combat.ts`. *O ritmo diferente por arma é o dono sentindo ao
> trocar; hyper-armor do martelo fica pra depois (o herói ainda não tem interrupção de ataque).*

### Fase 17 — Block/parry de ação (timing + refluxo) ✅
> O bloqueio (segura Q, −60%) e o **parry** (na janela de 0.3s → atordoa o atacante, dano zero) já
> existiam; a Fase 17 os torna **legíveis e recompensadores** e fecha a sinergia com a execução. O
> parry perfeito agora dá **slow-mo (hit-stop), clarão dourado, faíscas no atacante e screenshake** —
> e como **atordoa**, o inimigo vira **executável** (Fase 15): parry → stun → execução ×4 é o riposte
> Fable completo, sem precisar de refluxo de dano separado. Servidor confirma o stun por proximidade
> (a validação de **timing** no servidor fica pro Bloco D / Fase 33, que é onde entra o netcode de
> timing). Verificado: build limpo (feedback usa `ringEffect`/`impactBurst`/`hitStopT`/`shake` já
> existentes); o mecanismo de stun já era provado (Fase 15). `game.ts:damagePlayer (parry)`. *O feel/
> timing do parry é o dono aparando na hora certa (agora que o mouselook + block funcionam).*

### Fase 18 — Dodge com i-frames validado + perfect-dodge ✅
> **Esquiva perfeita**: dodge que desvia um ataque no último instante (i-frames ainda altos, `invulnT
> > 0.28` — iniciado <0.17s antes) → recompensa: **slow-mo** (hit-stop = janela de contra-ataque),
> **fôlego +22** e "✦ PERFEITA!". Dodge cedo ainda desvia ("esquivou!"), sem bônus. Validação da janela
> no **servidor** fica pro Bloco D (Fase 33). **Bugfix (dono):** a cambalhota girava `rotation.x` nos
> **pés** → o corpo **entrava no chão**. Agora o grupo sobe num arco (`1.2·(1-cos θ)`) e pivota no
> **centro**. Verificado: no meio do giro (rotX≈π) o grupo levanta **2.4u** (bate com a fórmula) →
> cambalhota acima do chão; 0 erros. `game.ts:damagePlayer/roll`. *O feel do perfect-dodge é o dono esquivando na hora.*

### Fase 19 — Multiplicador de combate reformulado ✅
> **Sabor escolhido pelo dono: "só zera ao apanhar" (Fable 1 clássico)** — o multiplicador de fluência
> **não decai mais com o tempo**; sobe a cada acerto e só zera quando o herói toma dano. Removidos os
> DOIS decaimentos por tempo: `MULT_WINDOW=5s` no sim autoritativo (`combat.ts`, `bumpMult` simplificado
> → estado agora é só `Map<pid, number>`, teto `MULT_CAP=25`) e `player.multT` no cliente (`game.ts`, o
> campo e a linha de decaimento no tick foram removidos). **XP de disciplina enriquecido** (a parte
> "alimentando XP das 3 disciplinas de forma mais rica"): cada golpe agora dá `dano×0.6 × (1 +
> min(mult,25)×0.04)` de XP → um streak limpo em x25 **dobra** o XP de Força/Skill/Vontade, além do dano
> já escalado. **HUD visível e recompensador:** o número do streak (topo-centro) esquenta por tier —
> branco→ouro→laranja→vermelho — com brilho crescente. **Verificado deterministicamente** (sim
> compartilhado headless via tsx, o mesmo que roda no servidor e offline): (1) mult sobe `1→5` por
> acerto; (2) **após +6s** — cruzando a antiga janela de 5s — **persiste** (`5→6`, não zera); (3)
> `notePlayerHit` zera (`→0`, rebuild `→1`); (4) teto em `25`. No preview (jogo rodando, 0 erros de
> boot): o ramp de cor do HUD bate por tier (x3 branco / x8 ouro / x15 laranja / x22 vermelho).
> `combat.ts:bumpMult/MULT_CAP`, `game.ts:edmg (fluency XP) + tick (multT removido) + HUD (ramp)`.
> *Nota de design: sem decaimento por tempo, o multiplicador **persiste entre encontros** enquanto você
> não apanhar (você carrega o streak da luta anterior). É o sabor pedido; se um dia soar estranho,
> resetar ao **sair de combate** (usando `player.lastCombat`) é um ajuste de uma linha — flag pro dono.*
O multiplicador (`game.ts:732`, `sim/combat.ts:32-39`) vira **recompensa de fluência contínua** estilo
Fable (encadear sem apanhar → sobe; apanhar → zera), alimentando XP das 3 disciplinas de forma mais rica.
**Pronto:** manter o combo limpo faz o multiplicador subir de forma visível e recompensadora.

### Fase 20 — Vertical slice de melee ✅
> **Prova de integração do Bloco B inteiro** contra um **grupo** (4 inimigos num arco frontal + 1 atrás
> como controle), rodada no sim compartilhado headless via tsx **E** re-provada no caminho REAL do
> cliente (bundle Vite pós-reload, via `FABLE.combatLocal`/`localSim` — o mesmo código offline do jogo),
> com resultados **idênticos** e 0 erros de console: (1) **hit direcional multi-alvo** — 1 swing varre
> os 4 da frente (`edmg=4`); (2) **combo de 3** com finisher (`ecombo`) + **hitstun e knockback em
> todos**; (3) **multiplicador de fluência** sobe (x12 pós-combo, cap 25 no encontro — sobe por HIT, num
> grupo enche depressa); (4) **flourish** carregado atordoa o grupo TODO (`estun=4`); (5) **execução** —
> o golpe seguinte nos atordoados dá 4× (`eexec=4`, o loop Fable atordoa→executa); (6) **grupo derrotado
> só no melee** (`edie=4`); (7) **risco/recompensa** — apanhar zera o streak do encontro (x25→x0, Fase
> 19); (8) **arco frontal** confirmado — o inimigo ATRÁS fica intacto (`hp cheio`, sem hitstun).
> *Honestidade (como na Fase 10): o "game feel" final de um combate de grupo — peso, leitura, ritmo com
> mouse+WASD — é o dono jogando; o pointer-lock/LMB não engata por evento sintético. As MECÂNICAS e sua
> integração estão provadas deterministicamente no sim autoritativo (o mesmo do servidor e do offline).*
> **Observação de design pro dono:** o multiplicador **bumpa por hit** (comportamento pré-existente, não
> da Fase 19) → num grupo de 4+ ele estoura pro cap 25 em ~6 swings. Se quiser que a fluência seja mais
> "ganha" (subir por SWING limpo, não por nº de alvos), é um ajuste de 1 linha no `bumpMult` — flag.
Um encontro contra um **grupo** só no melee: hit direcional, combos, flourish, parry, dodge, execução,
multiplicador. Com peso e leitura de inimigo.
**Pronto:** um combate melee contra vários inimigos tem "game feel" de ação de verdade.

---

## BLOCO C — Skill & Will: arco e magia de ação ✅ *(10/10 completo)*
*Arco de mira livre e magia carregável. No sim compartilhado.*
> **CONCLUÍDO (Fases 21-30 ✅):** arco tensionável (21) + projéteis balísticos por colisão (22) · magia
> carregável nível 1-3 (23) + mira por direção/área (24) · +2 escolas Gelo/Escudo (25) · Will pool/regen
> de ação (26) · troca fluida melee/arco/magia sem menu (27) · status effects congelar/choque/medo (28) ·
> esqueleto de carga/mira remota p/ o Bloco D (29) · vertical slice dos 3 builds (30). **Os três estilos
> Fable — guerreiro, arqueiro, mago — jogam com mira livre e loops distintos.** O feel final é o dono jogando.

### Fase 21 — Arco: mira livre + tensionar ✅
> **RMB virou segurar-pra-tensionar** (Fase 5 era tiro instantâneo): **mousedown** com arco começa a
> tensão (`bowDrawT`), **mouseup** atira com a **carga** = `min(tempo/0.7s, 1)`. A carga escala **dano
> (até 2×)** e **alcance (até ×1.35)** no **sim autoritativo** (não hack só-cliente): novo parâmetro
> `charge` plumbado igual ao flourish — `protocol.ts` (`charge?` no cast) → `game.ts` (`castAbility`
> envia; `rangedAttack(charge)` reescrito e **desacoplado do GCD** como o melee da Fase 12) → `server.ts`
> (clampa `charge` a 0..1) → `combat.ts` (`bowDmg=1+chg`, `bowRange=1+chg×0.35`; só o **arco** tensiona).
> Feedback: **retícula aperta e esfria** (ciano→branco) enquanto tensiona (distinta do laranja do
> flourish), flecha mais rápida e tom do disparo mais agudo com a carga; cancela ao destravar o mouse.
> **Verificado deterministicamente** (sim compartilhado headless via tsx **e** re-provado no bundle real
> do cliente via `FABLE.combatLocal`, resultados idênticos, 0 erros de boot): (1) **dano** médio (400
> amostras) carga 0 → ~94 vs carga cheia → ~188 = **1.98–2.05×**; (2) **alcance** — alvo a 18u: carga 0
> **não dispara** (fora do alcance), carga cheia **dispara** (estendido); (3) `charge` **não afeta o
> melee** (só o arco). `protocol.ts`, `combat.ts:cast (bowDmg/bowRange)`, `server.ts`, `game.ts:rangedAttack/mousedown/mouseup/retícula`.
> *Honestidade: o hold→release real do RMB é gated por pointer-lock (evento sintético não engata) → o
> feel de tensionar/soltar e o indicador de retícula são o dono jogando; a MECÂNICA (carga→dano/alcance,
> autoritativa) está provada. **Nota:** mira livre balística de verdade (flecha viaja e pode errar) é a
> Fase 22 — aqui o tiro ainda resolve no alvo frontal da mira (single-target), mas a carga já é real.*
RMB **tensiona** (segura = carrega: mais dano/alcance/velocidade), solta = atira na retícula. Substitui
o tiro instantâneo por-alvo (`game.ts:1202-1211`).
**Pronto:** seguro o RMB pra tensionar o arco e solto um tiro carregado na mira.

### Fase 22 — Projéteis balísticos reais ✅
> **A flecha virou um PROJÉTIL de verdade no sim autoritativo** (`combat.ts`): `cast` do arco com `dir`
> não faz mais hit instantâneo por `targetId` — lança um `Projectile {x,z,vx,vz,charge,dist,maxDist}` que
> **viaja a cada `update()`** e resolve por **colisão** (distância ponto-**segmento** do inimigo à
> trajetória do passo → **sem tunneling** mesmo com flecha rápida). Acerta o inimigo mais próximo da
> linha (raio `ARROW_HIT_R=0.9`), aplica dano `ranged` com a carga (`×(1+charge)`) e some; passou do
> `maxDist` (≈ alcance×2.4) → **erra e some**. Mira **livre**: voa pela direção da câmera/herói (Fase 2),
> não trava alvo. Cliente: `rangedAttack` agora dispara **sem exigir alvo** e a flecha visual voa **reta**
> na dir (não persegue), com impacto cosmético ao encostar num inimigo; `castAbility('golpe', null, …)`
> manda só `dir`+`charge`. **Verificado deterministicamente** (sim headless via tsx **e** bundle real do
> cliente via `FABLE.combatLocal`, idênticos, 0 erros de boot): (1) alvo **na linha** → acerta (`src:
> ranged`); (2) alvo **ao lado (8u)** com tiro reto → **erra** (é colisão direcional, não `targetId`);
> (3) **mira livre** pra +x com alvo em +x → acerta; (4) alvo a 40u (> maxDist) → erra; (5) **sem
> tunneling** — flecha de carga cheia (rápida) através de um alvo fino → acerta; (6) carga escala o dano
> do projétil **2.06×**. Servidor valida por construção (roda o mesmo `CombatSim`). `combat.ts:Projectile/segDist/update`, `game.ts:rangedAttack + loop de projéteis (straight)`.
> *Honestidade: o projétil é autoritativo e resolve online (o edmg já flui pelo snapshot). A flecha
> visual do MEU tiro é local (otimista); ver a flecha de um ALIADO viajando suave é a Fase 36 (Bloco D).
> Queda por gravidade/arco foi deixada reta de propósito (o plano permite "reto ou leve queda").*
Flechas/projéteis com trajetória real (reto ou leve queda) resolvidos no sim compartilhado por
**colisão**, não por `targetId`. Servidor valida o hit.
**Pronto:** uma flecha viaja e acerta onde mirei (ou erra se me mexo), com o servidor concordando.

### Fase 23 — Magia carregável por nível ✅
> **Segurar E carrega níveis 1-3** (keydown inicia `spellChargeT`, keyup lança no nível pelo tempo:
> <0.35s→L1, <0.8s→L2, senão→L3); a retícula **cresce por nível e fica arcana** (azul→roxo). Carregar
> **cobra mais Vontade** por nível (`×(1+(lvl-1)×0.6)`). O nível é plumbado igual ao charge do arco
> (`protocol.ts` `level?` → `game.ts` `castAbility`/`tryAbility(i, lvl)` → `server.ts` clampa 1..3 →
> `combat.ts`). No sim autoritativo, `lvlScale = 1+(lvl-1)×0.6` (L1 1× / L2 1.6× / L3 2.2×): **Bola**
> dano×nível + queimadura mais forte e longa; **Relâmpago** dano×nível + **+1 salto de cadeia por nível**;
> **Empurrão** dano×nível + **raio ×(1+(lvl-1)×0.4)** e força maior; **Cura** (local) cura mais por nível.
> Visual: bola mais grossa, screenshake do empurrão maior por nível. **Verificado deterministicamente**
> (sim headless via tsx **e** bundle real via `FABLE.combatLocal`, 0 erros de boot): (1) **Bola** L1→L2→L3
> = **1× / 1.61× / 2.14×** (~1.6/2.2 esperado); (2) **Relâmpago** encadeia **3→5** inimigos de L1 pra L3;
> (3) **Empurrão** — alvo a 8u: **L1 não pega, L3 pega** (raio cresceu); (4) **clamp** nível 9→3.
> `combat.ts:cast (lvlScale, bola/relampago/empurrao)`, `game.ts:KeyE hold + tryAbility/spells + retícula`, `protocol.ts`, `server.ts`.
> *Honestidade: o hold→release do E é gated por pointer-lock no jogo real (o dono sente a carga); a
> MECÂNICA (nível→dano/área/efeito, autoritativa) está provada. **Mira** de magia por direção/área (não
> alvo travado) é a Fase 24 — aqui a bola/relâmpago ainda miram o alvo do soft-lock; o que muda é o NÍVEL.*
Segurar o botão de magia carrega **níveis 1-3** (Fable Will): mais dano/área/efeito por nível. Bola de
Fogo/Relâmpago/Empurrão ganham níveis.
**Pronto:** carregar a magia até o nível 3 solta uma versão visivelmente mais forte.

### Fase 24 — Mira de magia (direção/área, não alvo travado) ✅
> **Bola de Fogo e Relâmpago viraram direcionais** (miram pela câmera, não por `targetId`) — o par mágico
> da mira livre que a Fase 22 deu ao arco. **Bola** virou um **projétil** (kind `'bola'` no sistema da
> Fase 22) que voa reto pela `dir` e **EXPLODE com AoE** no impacto ou no fim do alcance (`explodeBola`:
> dano+queimadura em todos no raio `BOLA_BLAST=3.2` ×(1+(nv-1)×0.35), escalando com o nível da Fase 23).
> **Relâmpago** escolhe o inimigo mais **alinhado à mira** (`aimEnemy`, cone `cos>0.5 ~120°`, dentro do
> alcance) e encadeia dele; sem ninguém na mira → o raio **arqueia no vazio** (visual, sem dano). No
> cliente: bola voa **reta** (não persegue) com rastro de fogo; `tryAbility` **não exige mais alvo** pros
> feitiços direcionais (`DIRECTIONAL_SPELLS`); ambos castam com `dir` (targetId ignorado). **Empurrão** já
> era área ao redor (sem mudança). Plumbing reusa o `dir` que o cast já enviava. **Verificado
> deterministicamente** (sim headless via tsx **e** bundle real via `FABLE.combatLocal`, idênticos, 0
> erros de boot): (1) **Bola** sem targetId mira +z e acerta (`src: magic`); (2) **AoE** pega os **3** de
> um cluster; (3) **erra** alvo fora da linha; (4) **Relâmpago** mira +x → atinge o da frente e **ignora o
> de trás**; (5) **whiff** sem ninguém no cone (0 dano); (6) **Empurrão** intacto (pega os 2 ao redor).
> `combat.ts:aimEnemy/explodeBola/cast (bola|relampago direcional)`, `game.ts:tryAbility/bola|relampago/projétil reto`.
> *Honestidade: mira por câmera (cone), não por marcador-no-chão livre 3D (isso pediria raycast do
> terreno na retícula — dá pra somar depois se quiser um AoE "plante aqui"). Servidor valida por
> construção (mesmo `CombatSim`). O feel real de mirar e lançar é o dono jogando sob pointer-lock.*
Feitiços miram por **direção da câmera / marcador no chão** (AoE), não por `targetId`. Servidor valida
área/direção com tolerância de latência.
**Pronto:** lanço fogo/força na direção/local que miro, acertando quem estiver ali.

### Fase 25 — Escolas expandidas ✅
> **+2 escolas novas jogáveis, uma ofensiva e uma defensiva, com assinatura visual própria** (reusam o
> framework de VFX+luz da Fase 44). **❄️ Estilhaço de Gelo** (autoritativo no sim): projétil direcional
> (reusa o sistema da Fase 22/24) que dá dano `magic` e **CONGELA** — novo campo `chillT` no `SimEnemy`
> faz aquele inimigo andar/atacar em **câmera lenta** (fator 0.5, via `eDt` per-inimigo no tick); chill
> escala com o nível (2.5/3.5/4.5s). VFX: octaedro ciano que tumba + `frostBurst` (estilhaços cristalinos
> + luz ciano) no evento `frost`. **🛡️ Escudo Arcano** (buff LOCAL, como a Cura — coerente com a
> arquitetura: dano ao herói já é client-side): `player.shieldT` **absorve** 50/65/80% do dano por nível,
> por 5-9s; **bolha translúcida azul** pulsa ao redor do herói (`shieldBubble`) + anel/faísca ao absorver.
> Roda de feitiços agora tem **7 slots** (🔥⚡💨❄️🛡️⏳💚). Plumbing: gelo é direcional (reusa `dir`);
> `abilityDamage` ganhou o caso `gelo`; `ABILITIES` ganhou `gelo`/`escudo`. **Verificado
> deterministicamente** (sim headless via tsx **e** bundle real via `FABLE.combatLocal`, 0 erros de boot):
> (1) Gelo acerta → `src: magic` + evento `frost` + `chillT` setado; (2) chill escala por nível
> (2.5/4.5s); (3) **congelamento desacelera o inimigo pra ~metade** (razão 0.50 medida na perseguição);
> (4) Gelo erra fora da linha; no bundle: roda com 7 slots (❄️🛡️ presentes), **Escudo casta** (shieldT
> ~9, nv3) e a **bolha azul renderiza** (screenshot no campo aberto). `combat.ts:gelo/chill/explodeBola`,
> `enemies.ts:chillT/eDt`, `abilities.ts:gelo`, `game.ts:gelo|escudo/frostBurst/shieldBubble/damagePlayer`.
> **🐛 Bug real pego na verificação e corrigido:** `tryAbility` fazia `slotEls[i].classList.add('flash')`,
> mas a hotbar aposentada só tem 6 slots → castar Gelo/Escudo (índices 6/7) pela roda **crashava o jogo**.
> Corrigido com `slotEls[i]?.` (os feitiços novos não têm slot na hotbar). *Honestidade: absorção do
> escudo é aritmética client-side determinística (como block/cura), verificada por leitura + o cast/bolha
> provados; o feel real é o dono jogando. Congelar TOTAL (parar de andar) + outros status ficam pra Fase 28.*
Adicionar escolas do ROADMAP Fase 7 (Gelo/lentidão, Escudo, etc.) reusando o framework de VFX+luz por
escola (já pronto das fases gráficas 44). Assinaturas visuais distintas.
**Pronto:** pelo menos +2 escolas novas jogáveis, com identidade visual própria.

### Fase 26 — Will pool & regen pro modelo de ação ✅
> **Regen de Vontade agora é consciente de combate** (era 4/s constante → seca num estilo mágico
> sustentado): **em combate 6/s** (não dá pra spammar magia), **fora de combate 14/s** (refila rápido,
> sem seca ao explorar) — gate por `time - player.lastCombat > 3s` (o cast/hit/dodge atualizam
> `lastCombat`). O talento **Serenidade** multiplica ambos por 1.5. **Pool** recompensa investir em
> Vontade: disciplina Wil passou de **+5 → +7 de maxWill por nível** (sustenta o estilo mágico ao subir).
> A **carga custa por nível** já entrou na Fase 23 (`×(1+(nv-1)×0.6)`). **Verificado** (bundle real,
> medindo o ganho no mesmo wall-clock, 0 erros): in-combat **9.6** vs out-of-combat **22.6** em ~1.6s →
> razão **2.34** (= 14/6, taxas exatas: 6/s e 14/s); pool = `60+(lvl-1)*12 + wil.lvl*7` confirmado
> (`matchesX7`, não X5). `game.ts:regen de Vontade (tick), recomputeMaxes (wil*7)`.
> *Nota: durante o teste, `gainDiscXP` estourou o teto de nível 50 (subiu a 6029 com 1e9 de XP) — é um
> **bug pré-existente** (o cap 50 só gateia a ENTRADA, não o while de level-up). Registrado num chip pro
> dono; inofensivo em jogo real (grants por hit são pequenos). Fora do escopo da Fase 26.*
Rebalancear Vontade (`game.ts:116-175`) pro fluxo de ação (carga custa por nível, regen fora de combate),
sem virar spam nem drought.
**Pronto:** dá pra sustentar um estilo mágico sem ficar sem Vontade a cada 3 segundos.

### Fase 27 — Alternância fluida arma↔magia ✅
> **Dois "slots" lógicos de arma** derivados do equipado + inventário — sem trocar no menu: **LMB é
> SEMPRE melee** (usa a melhor arma corpo-a-corpo que você possui, mesmo com arco equipado), **RMB é
> SEMPRE arco** (usa o melhor arco que você possui, mesmo com espada equipada; sem arco → no-op), **E é
> sempre magia** (usa a arma equipada pro `spellMult` — cajado turbina). `meleeWeaponItem()` /
> `bowWeaponItem()` escolhem a arma; `weaponStatsOf()` extrai os stats; `combatStats(eq)` aceita a arma de
> outro slot. Como **online o servidor usa a arma EQUIPADA (`p.state`), não per-cast**, a arma deste
> ataque agora vai **no próprio cast** (`protocol.ts` `wpn:{k,d,r,kn}` → `game.ts` `castAbility(...,
> eqOverride)` → `server.ts` sobrepõe a equipada, clampado) pro servidor resolver o tipo certo (arco =
> projétil balístico da Fase 22; melee = arco frontal da Fase 11). O RMB tensiona se você **possui** um
> arco (não só equipado). **Verificado no bundle real — ONLINE (WebSocket), interceptando o cast, 0
> erros:** (1) **espada equipada + arco no inventário** → LMB manda `melee`, RMB manda `bow`; (2) **arco
> equipado + espada no inventário** → LMB `melee` (pega a espada do inventário), RMB `bow` (equipado); (3)
> **só espada** → LMB `melee`, RMB no-op (sem arco). Ou seja: intercalo espada, flecha e feitiço na mesma
> troca, sem menu. `game.ts:meleeWeaponItem/bowWeaponItem/weaponStatsOf/combatStats/meleeAttack/rangedAttack`, `protocol.ts`, `server.ts`.
> *Honestidade: o herói ainda mostra visualmente a arma EQUIPADA (atirar flecha "segurando" a espada é
> estranho); a animação de troca de arma por ataque é polish do Bloco E (Fase 46). A mecânica está
> completa e provada online. Magia usa o `spellMult` do equipado — equipar um cajado ainda turbina os feitiços.*
Trocar entre melee/arco/magia sem "modo" pesado (Fable deixa fluido): ex. LMB melee + botão magia sempre
disponível, arco por RMB. Sem menus no meio da luta.
**Pronto:** intercalo espada, flecha e feitiço numa mesma troca de golpes, sem fricção.

### Fase 28 — Status effects integrados ✅
> **Sistema de status unificado no sim autoritativo**, cada efeito ligado a uma escola e legível no HUD.
> Novos campos no `SimEnemy` (`frozenT`/`shockT`/`fearT`) com gates próprios no tick, somando aos que já
> existiam (`burnT` queimar, `chillT` lentidão, `stunT`/`hitstunT`). **❄️ CONGELAR** (Gelo **carregado**,
> nível 3): `frozenT` → inimigo **parado total** (não anda/ataca) **e executável** (o exec da Fase 15
> agora dispara em `stunT>0 || frozenT>0` → congelar+golpe = **estilhaça** ×4); Gelo nível 1-2 segue só
> **lentidão** (`chillT`, Fase 25). **⚡ CHOQUE** (Raio): `shockT` **interrompe** o alvo e os encadeados
> (parado brevemente, ~0.4-0.8s por nível). **😱 MEDO** (Empurrão nível 2+): `fearT` → o inimigo **foge**
> do herói (mesma locomoção do flee). Rótulos flutuantes via novo evento `estat` ("❄️ CONGELADO / ⚡
> CHOCADO / 😱 MEDO"). **Verificado deterministicamente** (sim headless via tsx **e** bundle real via
> `FABLE.combatLocal`, 0 erros de boot): (1) Gelo L3 **congela** (`frozenT` + `estat freeze`, sem chill) vs
> Gelo L1 **só desacelera** (chill, sem freeze); (2) congelado **fica parado** (0.00u) **e é executado**
> (`eexec`); (3) Raio **choca** (`shockT` + estat, alvo parado); (4) Empurrão L2 **apavora** (`fearT` +
> estat, inimigo **fugiu 10.6u** afastando do herói). `enemies.ts:frozenT/shockT/fearT + gates`,
> `combat.ts:gelo(freeze)/relampago(shock)/empurrao(fear)/exec`, `game.ts:evento estat (rótulos)`.
> *Casa com o ROADMAP Fase 6/7. Tint persistente de "congelado/queimando" no modelo é polish (Bloco E) —
> os rótulos + VFX de impacto já tornam os status legíveis. Timing/validação online fina fica pro Bloco D.*
Queimar (existe), congelar/lentidão, choque, medo — ligados às escolas, resolvidos no sim compartilhado
(casa com ROADMAP Fase 6/7).
**Pronto:** feitiços aplicam status legíveis (congelado para de andar, queima tira vida, etc.).

### Fase 29 — Sincronizar carga/mira remota (gancho pro Bloco D) ✅
> **Esqueleto de dados de carga/mira no `PlayerState`** (o broadcast periódico já relayado nos snapshots —
> `{id, ...p.state}` no servidor, sem whitelist, então flui de graça). Campos novos: `casting` (`'' | 'bow'
> | 'spell' | 'flourish'` — o que o aliado está carregando) e `castCharge` (0..1); a **mira** já é o próprio
> `ry` (o herói encara a câmera). O cliente **declara** a carga no state a partir dos timers reais
> (`bowDrawT`/`spellChargeT`/`chargeStartT`); o receptor **guarda** `r.casting`/`r.castCharge` no modelo do
> herói remoto **e mostra um indicador legível** no plate (🏹 tensionando / ✨ magia / ⚔️ flourish + barra
> proporcional). **Verificado no bundle real (ONLINE), 0 erros:** (1) **serialização** — todo `state`
> enviado inclui as chaves `casting`+`castCharge` e faz **roundtrip por JSON**; (2) **receptor** — injetando
> um aliado tensionando (`casting:'bow', castCharge:0.75`), o herói remoto **guarda** os dados e **mostra o
> indicador** (🏹 + barra de 20px) → "aliado carregando é observável". `protocol.ts:PlayerState (casting/castCharge)`, `game.ts:state builder + updateRemoteHeroes/plate`.
> *Este é o ESQUELETO (Bloco C): o modelo de dados existe, é serializável e observável. A renderização
> SUAVE de verdade (interpolar a carga do aliado, ver o swing/flourish em tempo) é a **Fase 36 (Bloco D)**,
> que consome exatamente este esqueleto. O indicador atual é direto (12-15Hz), sem interpolação.*
Preparar o protocolo pra mostrar a **carga/mira dos aliados** (ver o mago carregando, o arqueiro
tensionando) — o esqueleto das mensagens, pronto pro Bloco D consumir.
**Pronto:** o modelo de dados de carga/mira existe e é serializável (aliado carregando é observável).

### Fase 30 — Vertical slice de builds ✅
> **Prova de integração dos 3 builds** (guerreiro/arqueiro/mago) no MESMO encontro (grupo de 4), no sim
> autoritativo (headless via tsx **E** bundle real via `FABLE.combatLocal`, resultados idênticos, 0 erros).
> Mesmo "poder", só muda a arma/estilo → o **loop** é que difere: **🗡️ Guerreiro** — fecha a distância,
> golpe **varre o arco frontal** (fonte `melee`, **até 4 acertos por swing**), combo/flourish/execução;
> **🏹 Arqueiro** — de longe, **flechas balísticas carregadas** que viajam e colidem (fonte `ranged`,
> **1 acerto por flecha** = single-target, precisa mirar); **✨ Mago** — de longe, **AoE + status** (fonte
> `magic`, **até 3 acertos por feitiço**, aplica choque/congela/medo). **Verificado:** `distinct: true` —
> guerreiro=`['melee']`+multi, arqueiro=`['ranged']`+single, mago=`['magic']`+AoE+status; e **os 3
> clareiam o mesmo encontro**. As assinaturas são nitidamente diferentes. *Honestidade (como nas Fases
> 10/20): a prova é das MECÂNICAS e sua distinção no sim; o "game feel" de cada build — mirar, tensionar,
> carregar, posicionar — é o dono jogando com mouse+WASD. Cada peça foi provada fase a fase (11-29).*

---

## BLOCO D — Netcode: a ação funcionando online ✅ *(10/10 completo)*
*O bloco arquitetural duro. Traz o feel dos Blocos A-C pro co-op responsivo.*
> **CONCLUÍDO (Fases 31-40 ✅):** snapshots 30Hz + interpolação de entidade (render ~100ms no passado) ·
> mensagens de timing (dodge/block/carga) · servidor valida i-frames/parry com folga ±150ms (nega/reflete/
> reduz) · prediction + reconciliação leve (client-auth de movimento + knockback previsto + blend de
> correção sem borrachudo) · hit detection com lag comp (rebobina inimigos ~150ms) · animações de ataque
> remotas (evento `eact` + pose de carga) · anti-cheat (carga/nível/flourish/dodge/dir validados) ·
> reconexão limpa (removePlayer + heartbeat/timeout + dedup por nome) · banda por interest (−37% a −91%) ·
> vertical slice co-op. **O combate de ação Fable funciona online, responsivo, no co-op.** O teste vivo a
> dois é o dono jogando pela tailnet; as peças e sua integração estão provadas (determinístico + bundle).

### Fase 31 — Snapshots 30Hz + interpolação suave ✅
> **`SERVER_SNAP_HZ` 15→30** (`protocol.ts`) **+ interpolação de entidade de verdade** substituindo o
> "exponential smoothing pro último snapshot" (que sempre atrasava e dependia de framerate). Agora o
> `net.ts` mantém um **buffer de posições por entidade** carimbado com `performance.now()` (janela 500ms),
> e o render amostra a posição em **`renderTime = now - 100ms`** (`INTERP_DELAY_MS`) **interpolando entre os
> dois snapshots que cercam** esse instante (`sampleEntity`, com wraparound angular e clamp nas pontas —
> segura no mais novo se o buffer esfomear, sem extrapolar). Aplicado a inimigos (`syncEnemies`) e heróis
> remotos (`updateRemoteHeroes`). **Banda medida** (`net.snapKbps`, média móvel) pra decidir se 30Hz cabe.
> **Verificado:** (1) **matemática da interpolação headless via tsx** — ponto médio (x=5,z=10,ry=π/4),
> 30%, clamp antigo/novo, wrap angular pelo caminho curto, null sem histórico (6/6); (2) **bundle real
> ONLINE** — `snapHz medido = 30` (intervalo 33.8ms, era 15), **55 entidades com buffer de interpolação**
> (~15 amostras cada), **banda 140.5 KB/s**, 0 erros. `protocol.ts:SERVER_SNAP_HZ`, `net.ts:hist/sampleEntity/snapKbps`, `game.ts:syncEnemies/updateRemoteHeroes`.
> *Observação de banda: 140 KB/s (~1.1 Mbps) porque TODOS os inimigos do mundo são serializados todo snap
> (sem interest management). Cabe numa tailnet/LAN co-op; se apertar com mais gente, é a **Fase 39**
> (delta/interest). O "sem teleporte de 66ms" é o dono vendo um aliado se mover suave no co-op real.*
Subir `SERVER_SNAP_HZ` 15→30 (`server.ts:187`) e refinar a interpolação de entidades remotas (render no
passado ~100ms). Medir banda.
**Pronto:** inimigos e heróis remotos se movem suaves; sem "teleporte" de 66ms.

### Fase 32 — Mensagens de timing (dodge/block/carga) ✅
> **3 mensagens novas de timing** no protocolo (`protocol.ts`), o alicerce pra Fase 33 validar i-frames/
> parry: **`dodge`** (`{dur}` — esquivei, i-frames por `dur`s), **`block`** (`{on}` — bloqueio liga/
> desliga), **`charge`** (`{kind, on}` — carga bow/spell/flourish começou/terminou). O **cliente envia**
> nos pontos reais: `tryRoll`→dodge; KeyQ down/up→block; e cada start/release de carga (LMB flourish, RMB
> arco, E magia) + cancelamento ao destravar o mouse→charge on/off. O **servidor registra** num
> `PlayerTiming` por herói (`iframeUntil`, `blocking`+`blockStart`, `charging`+`chargeStart`), **carimbado
> na chegada** com o relógio do servidor (`srvNow`, segundos) — nada de confiar no timestamp do cliente
> (anti-forja é a Fase 37; a folga ±150ms cobre a latência na Fase 33). **Verificado no bundle ONLINE, 0
> erros:** as **5 mensagens saem com a forma certa** (`dodge{dur:0.45}`, `block{on:true/false}`,
> `charge{kind:'spell',on:true/false}`), disparadas pelos gestos reais (dodge via hook; block/charge via
> eventos de teclado); o servidor **processa sem derrubar a conexão** (`net_connected` segue true → os
> handlers registram sem erro). `protocol.ts:dodge/block/charge`, `server.ts:PlayerTiming + handlers`, `game.ts:tryRoll/KeyQ/KeyE/mouse/unlock`.
> *O servidor agora SABE quando cada herói esquivou/bloqueou/carregou. USAR isso (negar/refletir dano
> dentro da janela) é a **Fase 33** — que fecha o loop e prova o timing ponta a ponta.*
Novas mensagens no protocolo (`protocol.ts:48-59`) com **timestamp**: `dodge`, `block`, `charge` —
início/fim/duração. Cliente envia; servidor registra.
**Pronto:** o servidor sabe QUANDO cada herói esquivou/bloqueou/carregou (não só que casta).

### Fase 33 — Servidor valida i-frames & parry windows (folgado) ✅
> **O servidor agora valida o dano ao herói** usando o `PlayerTiming` da Fase 32, com **folga ±150ms**
> (`PARRY_TOL`), "não rollback" (co-op tolerante). No drain de eventos do tick, cada `eatk`/`eland` que
> ia machucar o herói passa pela validação: **i-frame ativo** (`now ≤ iframeUntil + 150ms`) → **nega**
> (`dmg=0, blk='dodge'`); **bloqueando dentro da janela** (`now − blockStart ≤ 0.3s + 150ms`) → **reflete**
> (`dmg=0, blk='parry'` + `sim.stun` no atacante); **bloqueando fora da janela** → **reduz** (`dmg×0.4,
> blk='block'`); senão → normal (`blk='raw'`). O `notePlayerHit` (zera o multiplicador) **só dispara se o
> golpe LANDOU**. O cliente honra o veredito: `damagePlayer(dmg, atk, verdict)` — online aplica o que o
> servidor decidiu (dodge/parry só o feedback; block/raw o dano já ajustado, ainda passando por armadura/
> escudo); **offline** (`verdict=undefined`) o próprio cliente decide (localSim, lógica das Fases 17/18
> intacta). **Verificado deterministicamente:** (1) **algoritmo do servidor headless via tsx (8/8)** —
> i-frame ativo/expirado-dentro-da-folga/expirado-fora, parry na janela + borda exata (0.45s parry vs
> 0.46s block), block ×0.4, raw cheio, i-frame > block; (2) **cliente no bundle ONLINE, isolado** (movido
> a 154u do inimigo mais próximo, dano de fundo 0): dodge→**0**, parry→**0** (negam), block→**20**
> (reduzido), raw→**50** (cheio). `server.ts:validação eatk/eland`, `enemies.ts:blk no SimEvent`, `game.ts:damagePlayer(verdict)/eatk/eland`.
> *Honestidade: as duas metades (janelas do servidor + cliente honrando) estão provadas + a fiação
> typechecked. O loop VIVO de verdade — um inimigo real batendo enquanto você esquiva online — é o dono
> jogando co-op (a IA + timing tornam um script vivo instável; é a vitrine da Fase 40). Prediction/
> reconciliação do próprio herói (feedback instantâneo sob latência) é a Fase 34.*
Servidor aplica janelas de invulnerabilidade (dodge) e parry com **tolerância ±150ms** (não rollback):
ataque de inimigo dentro da janela → nega/reflete dano.
**Pronto:** esquivar/aparar no cliente é respeitado pelo servidor de forma justa (co-op PvE).

### Fase 34 — Client-side prediction + reconciliação leve ✅
> **Diagnóstico honesto primeiro:** o movimento do herói já é **client-authoritative** (o servidor usa
> `s.x/s.z` do cliente e ecoa) → mover/atacar já são **previstos e instantâneos por natureza**, sem
> round-trip. O que faltava pra fechar "responde na hora E não corrige feio": **(1) knockback PREVISTO** —
> ao apanhar (golpe que LANDA, do veredito da Fase 33), o cliente aplica um empurrão local instantâneo
> (`player.knockX/Z`, decai) na direção contrária ao atacante, escalando com o dano; esquiva/parry **não**
> empurram. **(2) Suavização de reconciliação (render)** — `heroRenderPos` separa o render da posição
> lógica: salto/correção grande (>3u: teleporte, respawn, travel, ou correção do servidor) faz **blend
> ~250ms (sem borrachudo)**; passo normal → **render = predição, zero lag**. **(3) Reconciliação LÓGICA
> server-wins** — captura a posição autoritativa própria (`net.selfAuth`) e, só em **desync GRITANTE**
> (>8u, impossível por lag), puxa suave o `player.pos` pra ela (o servidor vence); desync pequeno (o
> normal) é ignorado (confia na predição). É a rede de segurança pro clamp anti-cheat da Fase 37.
> **Verificado no bundle ONLINE, isolado, 0 erros:** knock aplica+decai e é setado só no golpe que landa
> (não na esquiva); render **blenda 20.5→0** na correção mas tem **gap 0 no movimento normal**; nudge
> lógico **puxa 5.8 pro servidor** em desync gritante e **ignora (0) o pequeno**; `selfAuth` capturado e
> sincronizado (divergência 0 parado). `game.ts:knockback previsto/reconcileHero/heroRenderPos`, `net.ts:selfAuth`.
> *Honestidade: co-op PvE tolera folga → client-auth de movimento é a escolha certa (o feel é instantâneo).
> Reconciliação com replay de inputs por sequência (o modelo "pesado" Quake) seria pra PvP justo — fora do
> escopo. O loop VIVO sob latência real é o dono jogando co-op (Fase 40).*
Herói próprio prevê movimento **e ação** localmente (feedback instantâneo); reconcilia com o servidor
sem "borrachudo". Reaproveita o sim compartilhado.
**Pronto:** com ~100ms de latência, meu herói responde na hora e não corrige feio.

### Fase 35 — Hit detection autoritativa com lag comp ✅
> O hit já resolvia no servidor (o `CombatSim` roda lá); faltava **compensar a latência**. O `EnemySim`
> agora mantém um **histórico curto de posições** por inimigo (`hist`, ~400ms, carimbado com `simTime`,
> gravado todo tick) e expõe **`posAt(id, backT)`** — a posição interpolada `backT`s atrás. O `cast` ganhou
> um param `lagT`: toda a hit detection **rebobina os inimigos** pra onde o atacante os VIU — arco frontal
> do melee (Fase 11), alcance do golpe, `aimEnemy` (relâmpago), raio do empurrão. O servidor passa
> `LAG_COMP=0.15s` (≈ interp 100ms da Fase 31 + ~meia-latência); **offline `lagT=0`** (sem lag → posição
> atual). Mantém `RANGE_TOLERANCE 1.3` como folga sã por cima. **Verificado deterministicamente (headless
> via tsx 4/4 + bundle real):** (1) `posAt` rebobina certo (agora (10,0) · 150ms atrás (0,0) · 75ms (5,0),
> interpolado); (2) golpe **COM** lag comp acerta o inimigo **onde ele estava** (perto do herói) → justo;
> (3) o **mesmo golpe SEM** comp **erra** (usa a posição atual, longe) — mostra a diferença; (4) offline
> sem regressão; no bundle: `posAt` rebobina dados reais (inimigo perseguindo: agora z=1.29, 150ms atrás
> z=1.08). `enemies.ts:hist/simTime/posAt/recordHist`, `combat.ts:cast(lagT) em melee/range/aimEnemy/empurrão`, `server.ts:LAG_COMP`.
> *Honestidade: `LAG_COMP` é FIXO (0.15s), não per-cliente-preciso — o servidor ainda não mede RTT
> (ping); é a folga "co-op tolerante" (refinar com RTT medido é possível depois). **Projéteis** (arco
> balístico da Fase 22) mantêm compensação NATURAL pelo tempo de voo — NÃO rebobino a colisão de propósito,
> pra o inimigo poder ESQUIVAR a flecha (a mecânica da Fase 22). O feel justo real é o dono no co-op.*
O arco frontal/raycast do melee (Fase 11) e projéteis (Fase 22) resolvem no servidor com **compensação
de latência** (posições ~100ms atrás), mantendo a folga sã (hoje `RANGE_TOLERANCE 1.3`).
**Pronto:** acertos parecem justos pra quem bate e pra quem apanha, mesmo com lag.

### Fase 36 — Animações de ataque remotas sincronizadas ✅
> Antes, o aliado remoto só tocava Idle/Run — você via o **resultado** (dano), nunca o **swing/tiro/cast**.
> Agora: **(1)** novo evento **`eact`** ({`pid`, `a`: melee/bow/spell/flourish}) emitido no `combat.cast`
> a cada ação validada → broadcast a todos → o cliente **anima o modelo remoto**: `r.actor.triggerUpper`
> (SwordSlash/Shoot/Spellcast, o mesmo Knight GLTF do herói local) + `r.swingT` pro fallback procedural +
> trilha de lâmina no melee; o próprio herói é ignorado (`pid===myPid`, já anima local). **(2) Pose de
> carga** consumindo o esqueleto da **Fase 29** (`r.casting`): enquanto o aliado tensiona/carrega, fica
> numa **pose focada (Idle)** mesmo se movendo, + o indicador 🏹/✨/⚔️ no plate (Fase 29). **Verificado no
> bundle real, 0 erros:** **emissão** — castar emite `eact` com o tipo certo (melee/flourish/bow/spell);
> **recepção** — injetando um aliado fake + o evento `eact`, o modelo remoto **anima** (`swingT` 0→0.3, e
> `triggerUpper` no GLTF carregado); **pose de carga** — o remoto consome `r.casting='spell'` e fica
> focado mesmo com `moving:true`. `enemies.ts:eact SimEvent`, `combat.ts:emite eact`, `game.ts:handler eact + pose de carga + swingT remoto`.
> *Honestidade: as duas pontas (servidor anuncia a ação · o modelo remoto anima) estão provadas + reusa o
> esqueleto da Fase 29. Ver o amigo dar um flourish e soltá-lo em co-op de verdade é o dono jogando a dois.*
Ver o **swing/flourish/carga** dos aliados em tempo (não só o resultado): eventos de início de ação +
interpolação. Consome o esqueleto da Fase 29.
**Pronto:** vejo meu amigo carregar um flourish e soltá-lo, não só o dano aparecendo.

### Fase 37 — Validação & anti-cheat do modelo de ação ✅
> O servidor já clampava stats/arma; agora **sanea as ENTRADAS NOVAS** (direção, carga, timing) e descarta
> o impossível. **Chave:** o WebSocket é **ordenado/confiável** → o `charge off` (Fase 32) chega ANTES do
> cast, então o servidor tem o **HOLD REAL cronometrado** (`lastChargeDur`) pra cruzar com o que o cliente
> alega. **(1) Carga instantânea (arco):** `charge` clampado ao que o hold suporta — `charge=1` sem ter
> carregado → cai pra ~0.18; hold 0.2s → ~0.47; hold cheio 0.7s → 1 (legítimo passa). **(2) Nível de magia
> forjado:** `level=3` sem hold → 1; hold 0.85s → 3, 0.4s → 2. **(3) Flourish forjado:** só vale se
> segurou ≥ `FLOURISH_TIME`; senão vira golpe normal. **(4) Dodge infinito:** rate-limit — esquivas com <
> `MIN_DODGE_GAP=0.33s` de intervalo são **descartadas** (sem i-frames grátis permanentes). **(5) Direção
> saneada:** NaN/Infinity → `undefined`. Tudo com folga `CHARGE_TOL=0.18s` pra não punir latência/jitter.
> **Verificado deterministicamente (algoritmo replicado headless via tsx, 8/8):** carga/nível/flourish
> forjados rejeitados · legítimos passam (crucial: sem falso-positivo) · dir saneada · dodge-spam
> descartado. **Bundle ONLINE:** boot limpo, conectado, recebendo snaps, inimigos visíveis — legítimo não
> quebrou. `server.ts:PlayerTiming (lastCharge/lastDodge) + handlers dodge/charge + validação no cast`.
> *Deferido de propósito: clamp de POSIÇÃO/anti-teleporte — quebraria os travel gates legítimos (saltos
> enormes) sem um sinal de "warp"; o hook `net.selfAuth` da Fase 34 já está pronto pra quando for somado.
> Não estava no "Pronto" do plano (dodge infinito / carga instantânea), que está coberto.*
Clampar/sanear as novas entradas (direção, carga, timing) no servidor (como já faz com stats em
`server.ts:116-128`). Descartar timing impossível.
**Pronto:** entradas forjadas (dodge infinito, carga instantânea) são rejeitadas pelo servidor.

### Fase 38 — Reconexão & estado sob o novo modelo ✅
> Quatro peças pra "cair e voltar sem travar nem duplicar": **(1) Limpeza do estado per-pid** — novo
> `CombatSim.removePlayer(pid)` zera **tudo** do herói (multiplicador, combo, cooldowns `cds`/`lastCast`/
> `lastMelee`, e remove as flechas em voo dele) → sem leak, sem estado velho ressurgindo. **(2) Heartbeat/
> timeout** — cada mensagem carimba `lastSeen`; uma varredura a cada 5s remove quem sumiu por >15s
> (`DISCONNECT_TIMEOUT`) → mata **fantasmas** de disconnect abrupto (que não dispara `close`). **(3) Dedup
> por nome** — ao logar, se o MESMO nome já está conectado (o fantasma da sessão anterior), ele é removido
> antes → a reconexão **substitui**, não duplica o herói nem herda estado. Tudo via um `dropPlayer(pid,
> motivo)` limpo e reusado por close/timeout/dedup. **(4) Reset transiente no cliente** — no (re)login, o
> herói zera `blocking`/cargas (`chargeStartT`/`bowDrawT`/`spellChargeT`)/`mult`/`knock`/`invulnT` → não
> volta preso bloqueando ou carregando. **Verificado deterministicamente (headless via tsx + bundle):**
> `removePlayer` limpa TUDO (mult 2→0, projétil removido, cds/combo/lastCast/lastMelee sumiram) e o 1º
> golpe pós-reconexão começa **fresco** (mult=1, não herdou o velho); bundle: `removePlayer` presente e
> funciona, server com dropPlayer/heartbeat/dedup **boota saudável e conectado**, reset transiente rodou
> no login inicial sem quebrar. `combat.ts:removePlayer`, `server.ts:dropPlayer/lastSeen/timeout sweep/dedup no login`, `game.ts:reset transiente no onLogin`.
> *Honestidade: as PEÇAS estão provadas (limpeza determinística + server saudável). O fluxo VIVO de
> desconectar e reconectar de fato — auto-reconnect (2s) + dedup do fantasma + carregar o save — é o dono
> testando (fechar/reabrir a aba no co-op); scriptar um disconnect real no preview single-client é inviável.*
Garantir que desconectar/reconectar no meio de um combate de ação não corrompe estado (carga, cooldown,
multiplicador). Heartbeat/timeout.
**Pronto:** cair e voltar no meio da luta recupera o estado sem travar nem duplicar.

### Fase 39 — Otimização de banda (delta/interest) ✅
> **Interest management**: o snapshot deixou de ser um `broadcast` único com TODOS os ~55 inimigos e virou
> **per-herói** — cada um recebe só os inimigos dentro de **140u** (`INTEREST_R2`). Os 140u cobrem o
> alcance do minimapa (~134u) e do render 3D, então **a UI não muda** (o que estava fora já não era
> desenhado); além disso, os camps distantes são cortados. Encaixa no cliente sem mudança: o `syncEnemies`
> já remove as views ausentes do snapshot (Fase 31), então inimigo fora do raio some e reentra suave.
> Eventos seguem globais (pequenos; o handler ignora quem não tem view). **Verificado no bundle ONLINE
> (baseline da Fase 31: 140.5 KB/s com ~55 inimigos):** num **canto vazio** → **0 inimigos, 12.4 KB/s
> (−91%)**; **perto dos camps** → 32-40 inimigos (de 55), **88.6 KB/s (−37%)**; os inimigos recebidos =
> views 3D renderizados (40=40, sem estado quebrado), minimapa e conexão intactos, 0 erros.
> `server.ts:snapshot per-herói com filtro de raio`.
> *Nota: fiz **interest** (o maior ganho e que encaixa no cliente existente), não delta compression — o
> plano pede "delta E/OU interest". Delta (só inimigos que mudaram) somaria em cima, mas exigiria o cliente
> parar de remover ausentes; interest já traz o combate de ação online pra uma banda folgada (co-op). O
> teste real com vários jogadores/inimigos juntos é o dono no co-op.*
Se 30Hz apertar: delta compression e/ou interest management (só entidades no raio) — itens já previstos
no ROADMAP Fase 1b. Só se o custo pedir.
**Pronto:** o combate de ação online cabe na banda sem engasgar com vários jogadores/inimigos.

### Fase 40 — Vertical slice co-op ✅
> **Prova de integração do Bloco D inteiro.** **(A) Sim autoritativo com 2 heróis (headless via tsx):**
> guerreiro (pid 0) + mago (pid 1) clareiam o MESMO grupo juntos (4+4 hits, 4/4 mortos), com **lanes
> independentes** (multiplicador por pid, mapas separados) e **`removePlayer(0)` isolado** (desconectar o
> guerreiro não toca o estado do mago). **(B) Experiência co-op + stack no bundle ONLINE (0 erros):** um
> **parceiro remoto** aparece, **carrega** (indicador 🏹 + pose focada, `casting='bow'`) e **ataca**
> (animação via `eact`) — ações remotas visíveis; e a stack do Bloco D **coexiste**: **~30Hz** medido
> (28), banda por **interest** (~97 KB/s), e **vereditos honrados** (dodge→0, parry→0, raw→40 com hp
> válido — o "false" do 1º teste foi o clamp de maxHp mascarando, não regressão). Os Blocos A-C rodam
> online, responsivos, no co-op. *Honestidade (como 10/20/30): as peças e sua integração estão provadas
> (determinístico + bundle); o combate co-op a dois de verdade, sentido, é o dono jogando pela tailnet — a
> vitrine final do pivô.*

---

## BLOCO E — Inimigos, progressão & polish de combate 🔨 *(em andamento)*
*IA que dá o que lutar; afinação e prova final.*

### Fase 41 — IA de inimigos com telegrafia ✅
> O ataque do inimigo era **instantâneo** (dano na hora, sem tell) → agora tem **windup**: quando o
> inimigo vai bater, entra numa fase de telegrafia (`windupT`, `WINDUP_TIME=0.5s`) e emite **`ewind`**; o
> golpe só **LANDA** quando o windup expira, e **só se o alvo ainda estiver no alcance** — saiu andando/
> esquivando → **erra (whiff)**. Durante o windup o inimigo está **comprometido** (parado, encarando).
> **Parry/atordoamento CANCELA** o golpe telegrafado (`stun` zera o `windupT` → riposte Fable). No sim
> (`enemies.ts`): `tryAttack` inicia o windup em vez de dano; um gate no tick resolve na hora certa (com
> checagem de alcance). No cliente: `ewind` toca a **anim de ataque** (a "rearmada") + **flash de aviso
> âmbar** + **anel no chão** + tell audível; `eatk` virou só o impacto. **Verificado deterministicamente
> (headless via tsx 4/4 + bundle real):** (1) `ewind` vem **antes** de `eatk`, separados por ~0.6s
> (windup); (2) **esquivar andando** (sair do alcance no windup) → **erra**; (3) **parry** no windup
> **cancela** (`windupT 0.5→0`, sem hit); (4) ficar no alcance → o golpe **landa** (não virou impossível);
> bundle: o sim real emite a sequência `['ewind','eatk']`. `enemies.ts:windupT/tryAttack/gate/stun cancela`, `game.ts:ewind (tell)`.
> *Base do "combate de leitura" Fable. O troll (slam) e o balverine (leap) já têm tells próprios (eslam/
> eleap); windup por-tipo afinado (tempos diferentes por inimigo) é a Fase 43. O feel de ler-e-reagir é o
> dono jogando.*

### Fase 42 — Comportamento de grupo ✅
> Duas peças no `enemies.ts`: **(A) Revezar** — só **`MAX_ATTACKERS=2`** inimigos entram em windup por herói
> ao mesmo tempo (tokens: `windCount` contado por tick, `tryAttack` recusa se o cap tá cheio → o inimigo
> **espera a vez**). Você não leva 6 golpes simultâneos; a luta vira leitura de posição. **(B) Cercar/
> flanquear** — **força de separação** (`sepVec`: empurra pra longe de aliados a <3u) somada à atração pelo
> herói no `moveToward` → o grupo **se espalha num anel** em vez de empilhar; aplicada também no **strafe**
> (quem espera a vez **circula** ao redor, metade pra cada lado, ameaçando). **Verificado deterministicamente
> (headless via tsx + bundle real):** (1) **revezar** — 6 inimigos no mesmo herói, **máx 2** em windup ao
> mesmo tempo (nunca empilham); (2) **cercar** — 6 empilhados no mesmo ponto se **espalham** (min distância
> par-a-par **0.20u → 1.35u**, formando o anel); (3) o grupo **ainda ataca** revezando (15 golpes/8s — não
> paralisou). `enemies.ts:windCount/MAX_ATTACKERS/tryAttack/sepVec/moveToward/strafe`.
> *Reusa a IA de matilha/alfa existente. Flanqueamento fino (pincer coordenado, cortar rota de fuga) e
> patrulhas são refinamento futuro; o "gerenciar posição, não só girar batendo" já está no lugar — o dono
> sente ao encarar um grupo.*

### Fase 43 — Movesets de inimigos pro novo timing ✅
> A telegrafia da Fase 41 era um `WINDUP_TIME=0.5s` **global**; agora é **por TIPO** (novo campo `windup?`
> em `EnemyDef`, com fallback 0.5): **troll 0.9s** (lento, muito telegráfico — punição grande), **arqueiro
> 0.6s** (janela de mira — dá pra fechar a distância ou esquivar a flecha), **xamã 0.55**, **balverine
> 0.45** (perigoso/rápido), **lobo/alfa 0.4** (ágil), **besouro/caranguejo 0.35** (rápido, fraco),
> **malachi 0.7**. Pesado = leitura mais fácil, punição maior; leve = mais rápido, menos punível. E o
> **slam de área** (troll/malachi) — que batia **instantâneo** — agora **TELEGRAFA**: emite `eslam` (anel
> de aviso vermelho no chão marcando a zona) + entra em windup (`windupPid=-2` sentinela de AoE); o dano
> só resolve ao fim, pegando **só quem NÃO saiu do raio** de 5.5u → **dá pra fugir do slam**. **Verificado
> deterministicamente (headless via tsx 4/4 + bundle real):** (1) o `dur` do `ewind` bate com `def.windup`
> por tipo (lobo 0.4, arqueiro 0.6, xamã 0.55); (2) troll (0.9) telegrafa mais que lobo (0.4); (3) slam
> **telegrafado** — `eslam` (t=0.1s) antes do `eatk` (t=1.3s, gap 1.2s); (4) slam **esquivável** — sair do
> raio no windup evita o dano; bundle: lobo 0.4 / arqueiro 0.6 / troll slam-telegrafado.
> `enemies.ts:def (windup por tipo)`, `enemies.ts:tryAttack (def.windup) + slam windup/AoE gate`, `game.ts:eslam (aviso)`.
> *Cada tipo tem agora um padrão com abertura pra revidar. O leap do balverine (eleap) já tinha tell; o
> ataque regular dele usa o windup 0.45. Padrões de ataque MÚLTIPLOS por inimigo (combos/variação) são
> polish de chefe (Fase 44). O feel de ler cada inimigo é o dono jogando.*

### Fase 44 — Chefes com mecânicas de ação ✅
> 6 inimigos viraram **chefes** (`boss` na def: troll, balverine, malachi, cavaleiro-sombrio, chefe-bandido,
> capitão-hobbe) com **FASES por HP**: novo campo `phase` (0/1/2) que sobe ao cruzar **66%** e **33%** de
> vida. Em cada virada: **(1)** evento **`ephase`** → o cliente mostra **"⚡ ENFURECIDO!/☠️ FÚRIA MÁXIMA!"**
> + **onda de choque** (anel vermelho) + rugido grave + screenshake; **(2)** uma **onda de choque real** —
> empurra/fere quem está **perto (<6u)**, **esquivável mantendo distância** (ou i-frame); **(3)** a
> agressão **escala** — windup e cadência × `(1 - fase×0.18)` (fase 2 → **×0.64**, telegrafa menos/ataca
> mais rápido) e o slam fica mais frequente. Reseta o ataque atual na virada (entra na fúria fresco).
> **Verificado deterministicamente (headless via tsx 4/4 + bundle real):** (1) troll **cruza os limiares
> → `ephase` [1,2]**, fase final 2; (2) **onda de choque esquivável** — perto (<6u) leva dano, longe (20u)
> não; (3) **agressão escala** — windup fase 0 **0.90s → fase 2 0.58s**; (4) **não-chefe** (lobo) **nunca
> muda de fase**; bundle: troll fases [1,2]. `enemies.ts:phase/applyDamage (ephase+onda)/tryAttack (escala)`, `defs/enemies.ts:boss`, `game.ts:ephase`.
> *Chefe não é mais saco de pancada — exige dodge/parry/posição, e fica mais intenso conforme cai. Fases
> com PADRÕES totalmente novos por chefe (ataques inéditos na fúria, não só mais rápidos) é polish futuro;
> o esqueleto de fases + escalação + onda de choque está no lugar. O combate de chefe é o dono jogando.*

### Fase 45 — Progressão afinada pro action ✅
> **Três entregas, todas no sim autoritativo (padrão provado do `chainBonus`/Tormenta):** (1) **Recompensa
> de fluência (multiplicador → XP)** — já entregue e verificada na Fase 19 (`game.ts:edmg`, `fluency =
> 1+min(mult,25)×0.04` → um streak limpo em x25 dobra o XP das 3 disciplinas); mantida. (2) **Curva das 3
> disciplinas distinta** — antes as três usavam a MESMA curva linear; agora cada escola tem a sua
> (`DISC_CURVE` em `game.ts`): **Força barata** (52+lvl×46 — você bate o tempo todo), **Habilidade no meio**
> (60+lvl×56), **Vontade cara/lenta** (72+lvl×70 — magia é potente) → subir de nível "sente" diferente por
> escola. (3) **3 talentos capstone (tier 4) que mudam o MOVESET, não números**, destravados subindo a
> disciplina (1 ponto/nível → tier 4 pede disc ≥5), plumbados por um bitfield **`perks`** em `CombatStats`/
> `PlayerState` (cliente declara em `combatStats` → servidor **mascara a 0..7** com `PERK_ALL` → o sim lê os
> bits): **💪 Terremoto** — o finalizador do combo (e o flourish) abre uma **onda de choque RADIAL** (360°,
> não só o arco frontal): empurra + atordoa 0.6s TODOS ao redor (raio 4.5u), sem dano (é controle → abre
> execução da Fase 15); **🎯 Flecha Perfurante** — a flecha **TRANSPASSA** (acerta cada inimigo novo no
> segmento, não some no primeiro → alinhe-os e transpasse vários); **✨ Conjuração Gêmea** — a Bola de Fogo
> dispara num **leque de 3** projéteis (±0.22rad), cada um explode em AoE. **Verificado deterministicamente**
> (sim compartilhado headless via tsx, o MESMO do servidor e do offline — 12/12): Terremoto atordoa (0.6) +
> empurra (6.0) o inimigo ATRÁS no finalizador, hp cheio (é CC), e sem o perk o de trás fica intacto; Flecha
> Perfurante acerta os 3 da fila (111) vs. padrão só o 1º (100); Conjuração Gêmea = 3 explosões vs 1 e o
> leque pega um alvo lateral que a bola central erra; curva str(512)<skl(620)<wil(772) no nível 10. Bundle do
> cliente compila limpo (39 módulos, 0 erros — import dos `PERK_`, talentos tier-4 e `perks` no `combatStats`
> transpilam). `abilities.ts:CombatStats/PERK_*`, `talents.ts:terremoto/flecha_perfurante/conjuracao_gemea`,
> `protocol.ts:perks`, `server.ts:perks clamp`, `combat.ts:quake/pierce/twin`, `game.ts:combatStats perks + DISC_CURVE`.
> *Honestidade: "subir a disciplina muda o combate" é servido pelo gating de pontos (disc lvl → talento capstone),
> o design existente de árvores (ROADMAP 2/6). O feel real dos perks é o dono jogando; a MECÂNICA (autoritativa)
> está provada. Re-prova no bundle via `FABLE.combatLocal` (mesmo `combat.ts`) ficou pendente — o preview :8485
> está ocupado por OUTRO chat (strictPort); o `vite build` limpo cobre a integração do cliente e o headless
> cobre a lógica idêntica que roda online e offline.*
Recompensa de fluência (multiplicador → XP), curva das 3 disciplinas, talentos que mudam o *moveset*
(não só números). Casa com ROADMAP Fase 2/6.
**Pronto:** subir Força/Skill/Vontade muda como o combate se sente, não só o dano.

### Fase 46 — Juice de combate ✅
> **A base de juice já era rica** (hitstop `hitStopT`, screenshake `shake`, `impactBurst`, `ringEffect`,
> `beep`/`noiseBurst`, hit-marker na retícula) — o que FALTAVA era a **câmera de combate**: nenhum **punch
> de FOV/zoom** existia, e os golpes fortes (finalizador, execução, parry, fúria de chefe) não tinham um
> peso de câmera unificado. Adicionado: (1) **punch de FOV (zoom-in)** — `camPunch` reduz o FOV (base 58 de
> `core.ts`) por alguns graus e **volta ao base** decaindo rápido (`camera.fov`/`updateProjectionMatrix` só
> quando ativo); (2) **roll/dutch kick** — `camRoll` inclina a câmera de leve (aplicado DEPOIS do `lookAt` via
> `camera.rotateZ`) e **alterna o lado** a cada golpe → sensação de chacoalhar, não travar; (3) um helper
> **`juiceHit(power)`** (power 0..1) que amarra hitstop + shake + zoom + roll numa curva única, roteando TODOS
> os destaques por ele com **tiers**: crít melee **0.35** (punch sutil ~3.6°), finalizador/flourish (`ecombo`)
> **0.55** (~4.5° — o finisher ganhou peso, antes só tinha beep), fúria de chefe (`ephase`) **0.8**, parry
> **0.6** e esquiva-perfeita **0.5** (mantendo o slow-mo 0.14 da Fase 18), **execução (`eexec`) 1.0** (peso
> máximo ~6.5°). O golpe **normal** (não-crít) segue só no micro-hitstop 0.05 — **de propósito**: zoomar todo
> swing enjoa. **Verificado:** (a) headless da dinâmica pura (7/7): tiers escalam (crít 3.58° < combo 4.47° <
> exec 6.50°), magnitude sã (<8° do FOV 58), o zoom **decai e VOLTA ao FOV base em 0.42s**, o roll assenta em
> zero e alterna o lado; (b) `vite build` limpo (39 módulos, 0 erros). Hooks novos: `FABLE.vfx.juice(power)` e
> `FABLE.juiceState` (lê hitStopT/shake/camPunch/camRoll/fov). `game.ts:juiceHit + camPunch/camRoll no loop da
> câmera + roteamento em edmg/ecombo/eexec/ephase/parry/perfect-dodge`.
> *Honestidade: o juice é **inerentemente subjetivo** — "dá vontade de bater de novo" é o dono jogando com o
> mouse; a MECÂNICA (curva de punch, tiers, decaimento, roteamento) está provada e o `FABLE.juiceState` deixa
> conferir o punch ao vivo. Re-prova visual no preview ficou pendente: `:8485` está ocupado por OUTRO chat
> (strictPort, não subi o meu nem toquei o `launch.json` do dono). Screen-flash/vinheta e câmera cinemática de
> finisher (corte/órbita) ficaram FORA — são polish maior; o punch+roll+shake cobre o "peso" que a fase pede.*
Afinar hitstop (existe, `game.ts:3067`), screenshake, VFX de impacto (Fase gráfica 43), som e a câmera
de combate (leve zoom/shake em golpes fortes). O "suco" que faz bater ser gostoso.
**Pronto:** cada golpe forte tem impacto audiovisual que dá vontade de bater de novo.

### Fase 47 — Tutorial / onboarding do novo esquema ❌ *(cortada pelo dono — 2026-07-05)*
> **REMOVIDA do escopo por decisão do dono ("sem tutorial por agora").** O número **47 fica reservado/vago**
> (não renumerei 48/49/50 pra evitar churn no doc e na memória); se o onboarding voltar, ressuscita aqui.
> ~~Ensinar o combate batendo (bonecos de treino / primeiro inimigo guiado): mouselook, LMB/RMB, carga de
> magia, dodge, parry.~~ Depois da Fase 46, o próximo passo ativo é a **Fase 48**.

### Fase 48 — Gamepad, remap & acessibilidade ✅
> **Camada de input completa, só-cliente** (`game.ts` + painel no `index.html`), persistida em `localStorage`
> (`fable_settings`, separada do save do personagem). **(1) Gamepad** (Gamepad API, plug-and-play, polado no
> tick via `pollGamepad(dt)`): stick esquerdo = mover (relativo à câmera, **somado ao WASD**, com **zona
> morta** radial e **velocidade analógica** — pouca inclinação anda devagar), stick direito = câmera
> (mouselook), e os botões nas **MESMAS funções** do teclado/mouse com **detecção de borda** (press/release):
> RT golpe (segura=flourish), LT arco (segura=tensiona), X magia (segura=carrega nível), Y roda de feitiços,
> A esquiva, B bloquear/parry, LB lock-on, RB interagir, D-pad ↑/↓ poções; com a roda aberta o stick direito
> escolhe a fatia. **(2) Remapeamento** das 12 ações de combate/movimento (WASD/esquiva/bloqueio/magia/roda/
> lock-on/interagir/poções) — as teclas de painel (C/I/T/M/O) ficam fixas; captura "clique e aperte a tecla"
> no painel (Escape não é vinculável). **(3) Sensibilidade do mouse** ajustável + **(4) Inverter Y** (mouse e
> stick) + sensibilidade/zona morta do stick. **(5) Lock-on TOGGLE vs HOLD** (acessibilidade — segurar em vez
> de alternar), compartilhado por Tab e gamepad (LB). Painel de **⚙️ Opções** (tecla **O**) com sliders/toggles
> + lista de rebind + "restaurar padrões". **Verificado:** headless das fórmulas puras (20/20 — zona morta sem
> salto no limiar, sensibilidade linear, invert-Y troca o sinal, velocidade analógica ½ curso→½ vel mas teclado
> sempre cheio, resolução de bind remapeado, máquina toggle-vs-hold, borda press/release única) + `vite build`
> limpo (39 módulos) + tsc sem nome indefinido novo. Hooks: `FABLE.input` (settings/rebind/invertY/lockOnHold/
> `poll(dt)` com `navigator.getGamepads` mockável/`pad()`/`deadzone()`). `game.ts:settings+loadSettings/pollGamepad/
> keydown+keyup por binds/mouselook sens+invertY/movimento binds+pad+analog/tryRoll dir/renderSettings+toggleSettings`, `index.html:setPanel`.
> *Honestidade: o gamepad REAL (segurar um controle) e o painel/rebind ao vivo são o dono jogando — a lógica
> (mapeamento, borda, deadzone, sensibilidade, binds, toggle/hold) está provada headless e o `FABLE.input.poll`
> com `getGamepads` mockado permite re-provar no bundle. Re-prova visual no preview ficou PENDENTE (`:8485`
> ocupado por OUTRO chat, strictPort — não subi o meu nem toquei o `launch.json`). Pulo/`Space` seguem só no
> teclado (não mapeei um botão de pulo — combate é o foco); mouse LMB/RMB não entram no rebind (são fixos).*
Suporte a **gamepad** (ROADMAP Fase 5), remapeamento de teclas, sensibilidade de mouse, inverter Y,
**lock-on opcional** pra quem prefere alvo travado. Toggle vs hold.
**Pronto:** dá pra jogar o combate de controle, com bindings e sensibilidade ajustáveis.

### Fase 49 — Balanceamento & telemetria ✅
> **Duas entregas. (1) Telemetria de combate** (`game.ts`, objeto `telemetry`, `FABLE.telemetry`/
> `telemetrySummary()`): agrega dos eventos do sim + gestos defensivos — **dano por fonte** (melee/ranged/
> magic → % de participação), **TTK** por inimigo (do 1º acerto MEU à morte → média), **taxa de crítico**,
> **kills/mortes/dano recebido**, e **uso de dodge/esquiva-perfeita/parry/block**. Hooks em `edmg`(mine)/`edie`
> (mine)/`damagePlayer`(ramos dodge/parry/block)/`playerDie`. Verificado headless (7/7 — agregação: TTK médio,
> dmgShare soma 100%, critRate, só conta inimigo que EU acertei). **(2) Rebalance DATA-DRIVEN**: escrevi um
> harness headless que roda os 3 estilos (guerreiro/arqueiro/mago) no **sim real** medindo DPS single-target,
> TTK solo-vs-Troll e TTK de grupo (média de 150-200 runs). **Diagnóstico (ANTES):** melee **dominante-óbvio**
> (single 397 + limpa grupo em 0.4s, sem trade-off) e magia **quase inútil** (single 27, 14.7× abaixo). **Ajustes
> (só números/janelas):** melee golpe `12→10 base, str×2.5→2.0, rand8→6` + swing mais lento (`MELEE_GAP 0.30→0.36`,
> `MELEE_CD 0.36→0.42`); arco golpe `10→12 base, skl×2.5→2.7` (vira o **rei do single-target seguro**); Bola de
> Fogo `18→22 base, wil×2.5→2.8, cd 3.5→2.5, custo 20→16` (magia sai do fundo). **DEPOIS (nv10):** single-target
> **guerreiro 290 ≈ arqueiro 286** (empatados — melee arriscado / arco seguro), **mago 47** (taxa de AoE:
> single baixo de propósito, mas ranged+status+grupo competitivo); solo-Troll melee 3.5s ≈ arco 3.3s, mago 17.5s;
> grupo(4×130) melee 0.5s / arco 2.7s / mago 2.6s. **Papéis (rock-paper-scissors):** arco = rei do single seguro;
> mago = controlador ranged de AoE+status; melee = brigão de cluster frontal, arriscado (melee range). `abilities.ts:
> abilityDamage (golpe/bola) + ABILITIES.bola (cd/custo)`, `combat.ts:MELEE_GAP`, `game.ts:MELEE_CD + telemetry`.
> *Honestidade: o balanceamento é do SIM real (o mesmo do servidor e offline), mas TTK sterile-lab (inimigos parados,
> sem IA/dodge do jogador) = teto, não jogo real. O melee ainda limpa **cluster frontal apertado** rápido (0.5s) —
> deixei DE PROPÓSITO (identidade Fable do arco frontal da Fase 11/20, gated por estar no perigo do corpo-a-corpo);
> não meti cleave-falloff pra não desfazer o feel multi-hit do Bloco B. A telemetria REAL (o dono jogando → números
> de verdade pra próxima passada de tuning) e o feel são o dono jogando; o preview `:8485` segue ocupado por outro chat.*
Afinar armas/magias/inimigos (dano, custo, janelas), instrumentar métricas de combate (TTK, uso de
dodge/parry, mortes). Rebalance data-driven.
**Pronto:** nenhum estilo é dominante-óbvio nem inútil; os números fazem sentido.

### Fase 50 — Passe final: prova do combate Fable ⬜
Um **encontro vitrine** trailer-worthy (arena/miniboss) que mostra o combate de ação completo — solo e
co-op — provando que o pivô valeu.
**Pronto:** um clipe de 60s do combate parece um action-RPG de verdade, e joga tão bem quanto parece.

---

## Ordem sugerida & princípios

```
BLOCO A (1-10)  ▶ COMEÇAR AQUI — mouselook + LMB/RMB/magia; sem isto nada muda de sensação
BLOCO B (11-20) ▶ o melee de ação (hit direcional, combos, flourish, parry) — o coração
BLOCO C (21-30) ▶ arco de mira livre + magia carregável — os outros dois estilos
BLOCO D (31-40) ▶ netcode: trazer o feel pro co-op responsivo (o bloco duro)
BLOCO E (41-50) ▶ inimigos/IA, chefes, progressão e polish — fecha pronto pra mostrar
```

- **Verificar jogando** antes de dizer "pronto" — cada fase termina provada no preview.
- **Sim compartilhado é a verdade** — mudanças de combate entram em `src/shared/sim/`, nunca só no
  cliente; o servidor valida (respeita a "regra de ouro" do MP).
- **Feel primeiro (solo), online depois** — iterar a sensação em latência zero; o Bloco D traz responsividade.
- **Fable de alma** — clique-pra-agir, leitura de inimigo, fluência recompensada, três estilos viáveis.
- **Co-op tolera folga** — janelas ±150ms, não rollback competitivo; PvP justo fica fora destas 50 fases.
- **Não rebuildar o que existe** — disciplinas, combo, block/parry, dodge, magia e o sim autoritativo
  já funcionam; este plano os **transforma** no modelo de ação, não recomeça do zero.
```
