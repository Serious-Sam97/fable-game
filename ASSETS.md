# Assets 3D — Caminho 2 (modelos GLTF de verdade)

O **Caminho 1** (cel-shading, color grade, rim light, poeira) já está no jogo e transforma
o mood sem precisar de nada externo. O **Caminho 2** é o maior salto isolado: trocar os
personagens/props procedurais por **modelos GLTF animados**. Isso resolve de vez o "robô
rígido" — andar, correr e atacar com animação de esqueleto de verdade.

Eu não consigo baixar esses arquivos por aqui de forma confiável (e não vejo o jogo ao vivo,
só screenshots). Então o combinado é: **você baixa os packs abaixo e joga na pasta certa; eu
escrevo todo o código de carregamento + a máquina de animação.** Tudo local, servido pelo
próprio Vite — sem problema de CSP.

---

## O que baixar (tudo CC0 / gratuito)

### 1. Personagem animado (prioridade máxima) — Quaternius
- Site: **https://quaternius.com** → seção **"Ultimate Animated Character Pack"** (ou
  "Universal Animated Characters"). Licença CC0.
- É um personagem modular com animações prontas: `Idle`, `Walk`, `Run`, `Attack`, `Jump`,
  `Death`, etc. — exatamente o que precisamos para herói/NPCs/inimigos humanoides.
- Baixe a versão **glTF/GLB**. Se vier em `.blend` ou `.fbx`, dá pra exportar como `.glb`
  no Blender (te ajudo com o passo a passo se precisar).

### 2. Natureza & props — Kenney (opcional, mas ótimo)
- Site: **https://kenney.nl/assets** → **"Nature Kit"**, **"Survival Kit"**, **"Castle Kit"**,
  **"Fantasy Town Kit"**. Licença CC0.
- Árvores, pedras, cercas, casas, barris, baús — para substituir a geometria procedural do
  mundo por props com mais capricho.
- Baixe o formato **GLB** (os kits do Kenney têm pasta `Models/GLB/`).

### 3. Criaturas (opcional) — Quaternius
- Quaternius também tem **"Animated Animals"** e **"RPG Monsters"** (CC0) — para lobos,
  javalis, criaturas. Formato GLB.

### Alternativa agregadora
- **https://poly.pizza** — busca por modelos CC0 avulsos (ex.: "sword", "dog", "chest"),
  download direto em GLB. Bom para peças específicas.

---

## Onde colocar os arquivos

Crie a pasta e jogue os `.glb` lá:

```
test-fable-game/
  public/
    models/
      hero.glb          ← personagem animado (Quaternius)
      villager.glb      ← (pode ser o mesmo base com outra roupa/cor)
      wolf.glb          ← criatura
      tree_oak.glb      ← natureza (Kenney)
      tree_pine.glb
      rock.glb
      cottage.glb
      chest.glb
      ...
```

Tudo em `public/` é servido como `/models/hero.glb` — o `GLTFLoader` carrega direto, sem
build, sem CSP.

---

## O que EU faço quando os arquivos estiverem lá

1. **Loader central** (`src/client/assets.ts`): carrega e cacheia os GLBs, com `GLTFLoader` +
   `DRACOLoader` se comprimidos; devolve clones prontos para instanciar.
2. **Máquina de animação** (`AnimationMixer` + state-machine): `idle ↔ walk ↔ run`,
   ataque, rolar, morrer, com **blending** suave entre estados; sincronizada com a velocidade
   e as ações que o jogo já dispara (swingT, player.moving, morte etc.).
3. **Fallback gracioso**: se um `.glb` não existir, o jogo usa o modelo procedural atual —
   então **nada quebra** durante a transição; migramos peça por peça.
4. **Materiais**: aplico o cel-shading do Caminho 1 nos modelos importados também (troco o
   material do GLTF por `MeshToonMaterial` mantendo as texturas), pra manter o look coeso.
5. **Ajuste de escala/pivô**: cada pack vem numa escala/orientação; eu calibro para o mundo.

---

## Como me avisar

Quando baixar, é só dizer algo como *"coloquei o hero.glb e um tree_oak.glb em public/models"*
— eu detecto, escrevo o loader e a animação, ligo o fallback e a gente migra o herói primeiro
(o item de maior impacto visual), depois inimigos, depois props do mundo.

**Dica:** comece só com **1 arquivo** — o personagem animado do Quaternius como `hero.glb`.
Com ele já dá pra ver o herói andando/atacando com animação real, e a partir daí decidimos o
ritmo do resto.
