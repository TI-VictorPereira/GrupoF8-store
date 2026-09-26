# Loja Interna F8

Sistema interno do Grupo F8 para a loja e o refeitório: colaboradores compram
itens da loja e liberam o próprio almoço por código de barras; o consumo do
ciclo é fechado e exportado para importação de eventos no **Sankhya**.

**O produto final não é a loja — é o arquivo.** Todo o resto (autenticação,
papéis, o corte de ciclo no dia 20) existe para que esse arquivo saia
confiável e reproduzível.

## Papéis

| Papel | O que faz |
|---|---|
| `colaborador` | Libera o almoço do dia, compra na loja, vê o próprio consumo |
| `dp` | Tudo do colaborador, mais o fechamento do ciclo e a exportação pro Sankhya |
| `admin` | Tudo, mais entregas, estoque, preço do almoço, vendas e cadastro |
| `refeitorio` | Só o totem — o leitor de código de barras, nada além disso |

## Stack

- **`api/`** — FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2, Python 3.12
- **`web/`** — Vite + React 19 + TanStack Router/Query, Tailwind 4
- **Banco** — [Neon](https://neon.tech) (Postgres gerenciado)
- **Deploy** — dois projetos na Vercel (API e front), conectados por um
  rewrite de `/api/*` no front — ver [docs/runbook.md](docs/runbook.md)

## Rodando localmente

Precisa de [Docker](https://www.docker.com/) — não de Node nem Python
instalados na máquina, os dois vivem dentro dos containers.

```sh
docker compose up -d
docker compose exec api alembic upgrade head
docker compose exec api python -m app.scripts.semear
```

Front em `http://localhost:8800`, API em `http://localhost:8801`. O padrão
sobe um Postgres descartável no próprio compose — para apontar pro Neon em vez
disso, veja o overlay em [docker-compose.neon.yml](docker-compose.neon.yml).

Testes e lint:

```sh
docker compose exec api python -m pytest
docker compose exec api python -m ruff check app tests
docker compose exec web npx tsc --noEmit
docker compose exec web npx eslint src
```

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md) — decisões de arquitetura e as
  regras que sustentam o desenho
- [docs/modelo-de-dados.md](docs/modelo-de-dados.md) — tabelas e por que cada
  uma é do jeito que é
- [docs/fechamento-competencia.md](docs/fechamento-competencia.md) — a regra
  do ciclo (21 a 20) e onde ela vive no código
- [docs/runbook.md](docs/runbook.md) — deploy, migration, e o que fazer
  quando algo quebra em produção
