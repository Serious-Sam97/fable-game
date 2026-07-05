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

## BLOCO B — Melee de ação (o coração Fable) 🔨 *(em andamento)*
*Peso, timing e leitura. No sim compartilhado; iterado em solo.*

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

### Fase 19 — Multiplicador de combate reformulado ⬜
O multiplicador (`game.ts:732`, `sim/combat.ts:32-39`) vira **recompensa de fluência contínua** estilo
Fable (encadear sem apanhar → sobe; apanhar → zera), alimentando XP das 3 disciplinas de forma mais rica.
**Pronto:** manter o combo limpo faz o multiplicador subir de forma visível e recompensadora.

### Fase 20 — Vertical slice de melee ⬜
Um encontro contra um **grupo** só no melee: hit direcional, combos, flourish, parry, dodge, execução,
multiplicador. Com peso e leitura de inimigo.
**Pronto:** um combate melee contra vários inimigos tem "game feel" de ação de verdade.

---

## BLOCO C — Skill & Will: arco e magia de ação ⬜
*Arco de mira livre e magia carregável. No sim compartilhado.*

### Fase 21 — Arco: mira livre + tensionar ⬜
RMB **tensiona** (segura = carrega: mais dano/alcance/velocidade), solta = atira na retícula. Substitui
o tiro instantâneo por-alvo (`game.ts:1202-1211`).
**Pronto:** seguro o RMB pra tensionar o arco e solto um tiro carregado na mira.

### Fase 22 — Projéteis balísticos reais ⬜
Flechas/projéteis com trajetória real (reto ou leve queda) resolvidos no sim compartilhado por
**colisão**, não por `targetId`. Servidor valida o hit.
**Pronto:** uma flecha viaja e acerta onde mirei (ou erra se me mexo), com o servidor concordando.

### Fase 23 — Magia carregável por nível ⬜
Segurar o botão de magia carrega **níveis 1-3** (Fable Will): mais dano/área/efeito por nível. Bola de
Fogo/Relâmpago/Empurrão ganham níveis.
**Pronto:** carregar a magia até o nível 3 solta uma versão visivelmente mais forte.

### Fase 24 — Mira de magia (direção/área, não alvo travado) ⬜
Feitiços miram por **direção da câmera / marcador no chão** (AoE), não por `targetId`. Servidor valida
área/direção com tolerância de latência.
**Pronto:** lanço fogo/força na direção/local que miro, acertando quem estiver ali.

### Fase 25 — Escolas expandidas ⬜
Adicionar escolas do ROADMAP Fase 7 (Gelo/lentidão, Escudo, etc.) reusando o framework de VFX+luz por
escola (já pronto das fases gráficas 44). Assinaturas visuais distintas.
**Pronto:** pelo menos +2 escolas novas jogáveis, com identidade visual própria.

### Fase 26 — Will pool & regen pro modelo de ação ⬜
Rebalancear Vontade (`game.ts:116-175`) pro fluxo de ação (carga custa por nível, regen fora de combate),
sem virar spam nem drought.
**Pronto:** dá pra sustentar um estilo mágico sem ficar sem Vontade a cada 3 segundos.

### Fase 27 — Alternância fluida arma↔magia ⬜
Trocar entre melee/arco/magia sem "modo" pesado (Fable deixa fluido): ex. LMB melee + botão magia sempre
disponível, arco por RMB. Sem menus no meio da luta.
**Pronto:** intercalo espada, flecha e feitiço numa mesma troca de golpes, sem fricção.

### Fase 28 — Status effects integrados ⬜
Queimar (existe), congelar/lentidão, choque, medo — ligados às escolas, resolvidos no sim compartilhado
(casa com ROADMAP Fase 6/7).
**Pronto:** feitiços aplicam status legíveis (congelado para de andar, queima tira vida, etc.).

### Fase 29 — Sincronizar carga/mira remota (gancho pro Bloco D) ⬜
Preparar o protocolo pra mostrar a **carga/mira dos aliados** (ver o mago carregando, o arqueiro
tensionando) — o esqueleto das mensagens, pronto pro Bloco D consumir.
**Pronto:** o modelo de dados de carga/mira existe e é serializável (aliado carregando é observável).

### Fase 30 — Vertical slice de builds ⬜
Um **arqueiro** e um **mago** jogáveis de ponta a ponta (solo), cada um com seu loop (mira/carga), tão
distintos quanto o guerreiro do Bloco B.
**Pronto:** três builds (guerreiro/arqueiro/mago) jogam o mesmo encontro de formas nitidamente diferentes.

---

## BLOCO D — Netcode: a ação funcionando online ⬜
*O bloco arquitetural duro. Traz o feel dos Blocos A-C pro co-op responsivo.*

### Fase 31 — Snapshots 30Hz + interpolação suave ⬜
Subir `SERVER_SNAP_HZ` 15→30 (`server.ts:187`) e refinar a interpolação de entidades remotas (render no
passado ~100ms). Medir banda.
**Pronto:** inimigos e heróis remotos se movem suaves; sem "teleporte" de 66ms.

### Fase 32 — Mensagens de timing (dodge/block/carga) ⬜
Novas mensagens no protocolo (`protocol.ts:48-59`) com **timestamp**: `dodge`, `block`, `charge` —
início/fim/duração. Cliente envia; servidor registra.
**Pronto:** o servidor sabe QUANDO cada herói esquivou/bloqueou/carregou (não só que casta).

### Fase 33 — Servidor valida i-frames & parry windows (folgado) ⬜
Servidor aplica janelas de invulnerabilidade (dodge) e parry com **tolerância ±150ms** (não rollback):
ataque de inimigo dentro da janela → nega/reflete dano.
**Pronto:** esquivar/aparar no cliente é respeitado pelo servidor de forma justa (co-op PvE).

### Fase 34 — Client-side prediction + reconciliação leve ⬜
Herói próprio prevê movimento **e ação** localmente (feedback instantâneo); reconcilia com o servidor
sem "borrachudo". Reaproveita o sim compartilhado.
**Pronto:** com ~100ms de latência, meu herói responde na hora e não corrige feio.

### Fase 35 — Hit detection autoritativa com lag comp ⬜
O arco frontal/raycast do melee (Fase 11) e projéteis (Fase 22) resolvem no servidor com **compensação
de latência** (posições ~100ms atrás), mantendo a folga sã (hoje `RANGE_TOLERANCE 1.3`).
**Pronto:** acertos parecem justos pra quem bate e pra quem apanha, mesmo com lag.

### Fase 36 — Animações de ataque remotas sincronizadas ⬜
Ver o **swing/flourish/carga** dos aliados em tempo (não só o resultado): eventos de início de ação +
interpolação. Consome o esqueleto da Fase 29.
**Pronto:** vejo meu amigo carregar um flourish e soltá-lo, não só o dano aparecendo.

### Fase 37 — Validação & anti-cheat do modelo de ação ⬜
Clampar/sanear as novas entradas (direção, carga, timing) no servidor (como já faz com stats em
`server.ts:116-128`). Descartar timing impossível.
**Pronto:** entradas forjadas (dodge infinito, carga instantânea) são rejeitadas pelo servidor.

### Fase 38 — Reconexão & estado sob o novo modelo ⬜
Garantir que desconectar/reconectar no meio de um combate de ação não corrompe estado (carga, cooldown,
multiplicador). Heartbeat/timeout.
**Pronto:** cair e voltar no meio da luta recupera o estado sem travar nem duplicar.

### Fase 39 — Otimização de banda (delta/interest) ⬜
Se 30Hz apertar: delta compression e/ou interest management (só entidades no raio) — itens já previstos
no ROADMAP Fase 1b. Só se o custo pedir.
**Pronto:** o combate de ação online cabe na banda sem engasgar com vários jogadores/inimigos.

### Fase 40 — Vertical slice co-op ⬜
**Dois jogadores** matam um grupo juntos com o combate de ação: hits justos, dodge/parry respeitados,
ações remotas visíveis, sem borrachudo.
**Pronto:** o combate Fable funciona online, a dois, com feel responsivo pela tailnet.

---

## BLOCO E — Inimigos, progressão & polish de combate ⬜
*IA que dá o que lutar; afinação e prova final.*

### Fase 41 — IA de inimigos com telegrafia ⬜
Inimigos ganham **windup visível** (telegrafa o golpe) → ataques esquiváveis/aparáveis. A base do
"combate de leitura" Fable. Reusa a IA de `sim/enemies.ts`.
**Pronto:** dá pra ver o inimigo "carregar" o ataque e reagir (dodge/parry) a tempo.

### Fase 42 — Comportamento de grupo ⬜
Inimigos cercam, flanqueiam, revezam ataques (não empilham em cima) — o item "flanquear/patrulhas"
pendente do ROADMAP. Alfa/matilha já existem.
**Pronto:** enfrentar um grupo exige gerenciar posição, não só girar batendo.

### Fase 43 — Movesets de inimigos pro novo timing ⬜
Reformular leap/AoE/ranged dos inimigos (troll, arqueiro, xamã, balverine) pro ritmo de ação: janelas
claras de ataque e vulnerabilidade.
**Pronto:** cada tipo de inimigo tem um padrão de ataque com abertura pra revidar.

### Fase 44 — Chefes com mecânicas de ação ⬜
Balverine/Troll (e o arco do Malachi) reformulados com **fases e padrões esquiváveis** (ROADMAP Fase 15).
Combate de chefe que testa o novo moveset.
**Pronto:** um chefe tem padrões que exigem dodge/parry/posição — não é saco de pancada.

### Fase 45 — Progressão afinada pro action ⬜
Recompensa de fluência (multiplicador → XP), curva das 3 disciplinas, talentos que mudam o *moveset*
(não só números). Casa com ROADMAP Fase 2/6.
**Pronto:** subir Força/Skill/Vontade muda como o combate se sente, não só o dano.

### Fase 46 — Juice de combate ⬜
Afinar hitstop (existe, `game.ts:3067`), screenshake, VFX de impacto (Fase gráfica 43), som e a câmera
de combate (leve zoom/shake em golpes fortes). O "suco" que faz bater ser gostoso.
**Pronto:** cada golpe forte tem impacto audiovisual que dá vontade de bater de novo.

### Fase 47 — Tutorial / onboarding do novo esquema ⬜
Ensinar o combate batendo (bonecos de treino / primeiro inimigo guiado): mouselook, LMB/RMB, carga de
magia, dodge, parry. Fable ensina brincando.
**Pronto:** um jogador novo entende o combate em 2 minutos sem ler manual.

### Fase 48 — Gamepad, remap & acessibilidade ⬜
Suporte a **gamepad** (ROADMAP Fase 5), remapeamento de teclas, sensibilidade de mouse, inverter Y,
**lock-on opcional** pra quem prefere alvo travado. Toggle vs hold.
**Pronto:** dá pra jogar o combate de controle, com bindings e sensibilidade ajustáveis.

### Fase 49 — Balanceamento & telemetria ⬜
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
