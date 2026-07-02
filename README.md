# FABLE — As Colinas de Pedravento

Action-RPG online no navegador (Three.js + TypeScript), inspirado em *Fable: The Lost
Chapters* × *World of Warcraft*. Roadmap completo em [ROADMAP.md](ROADMAP.md).

## Rodando (Docker — recomendado)

```bash
docker compose up
```

| Serviço  | Porta | O quê |
|----------|-------|-------|
| `web`    | [8471](http://localhost:8471) | Vite dev server com HMR (edite `src/` e o navegador atualiza sozinho) |
| `server` | 8787  | Servidor autoritativo (`tsx watch` — reinicia ao salvar `server/` ou `src/shared/`) |
| `db`     | 5434  | Postgres 16 (personagens persistidos por nome, tabela `characters`) |

Tudo com hot reload — nenhum build manual necessário. O código é montado por bind
mount; `node_modules` ficam em volumes nomeados (binários linux ≠ macOS).

Banco: `psql postgres://fable:fable@localhost:5434/fable`

## Rodando sem Docker

```bash
npm install
npm run dev      # cliente em http://localhost:8471
npm run server   # servidor em ws://localhost:8787 (usa DATABASE_URL ou localhost:5434)
```

Sem Postgres alcançável, o servidor roda sem persistência; sem servidor, o jogo
entra em modo solo com a mesma simulação rodando localmente.

## Multiplayer com amigos

O cliente conecta em `ws://<hostname-da-página>:8787` — basta expor as portas 8471 e
8787 na mesma máquina (por exemplo via Tailscale) e compartilhar a URL.

## Estrutura

```
src/client/   Three.js, UI, input, áudio (só navegador)
src/shared/   math, terrain, protocol, defs/, sim/ (roda no cliente E no servidor)
server/       servidor autoritativo (WebSocket + Postgres)
```
