# Plano de construção — Loja Interna F8

> Ver [arquitetura.md](arquitetura.md) e [modelo-de-dados.md](modelo-de-dados.md).

## Contexto

O sistema **não está em produção**. Não há dado real, nem usuário ativo, nem
senha a preservar.

Isso muda a natureza do trabalho: **não é uma migração, é uma construção** com o
protótipo atual servindo de especificação. Some o maior risco de um projeto
deste tipo — perder dado de produção. O que sobra é risco de prazo e de escopo.

Tamanhos: **P** = até um dia · **M** = poucos dias · **G** = uma semana ou mais.

## O que o protótipo atual vale

O código em `src/` é um protótipo funcional em Supabase/Lovable. Aproveitável:

- **O JSX e o Tailwind das 15 telas.** A interface está desenhada e validada; a
  fase 7 troca a camada de dados, não redesenha telas.
- **As funções plpgsql** (`finalizar_pedido`, `cancelar_pedido`, `gerar_almoco`,
  `confirmar_almoco`, `ajustar_estoque`, `registrar_almoco_manual`) como
  especificação do que cada serviço Python precisa fazer.
- **O SQL do schema** como ponto de partida — agora livre para melhorar, já que
  não há dado legado a respeitar.
- **O layout de colunas da exportação** por colaborador.

Descartado: os 45 componentes `shadcn/ui` nunca usados, a camada Supabase
inteira e o acoplamento com o Lovable.

## Fase 1 — Modelo e decisões · P

Papel, não código.

- Fechar o schema alvo → já em [modelo-de-dados.md](modelo-de-dados.md)
- Fechar a lista de eventos auditáveis → idem
- Registrar as pendências do Sankhya (S1–S4) e as premissas adotadas
- Definir a política de senha mínima

**Pronto quando:** os três documentos em `docs/` estão revisados e aceitos.

## Fase 2 — Repositório e corte do Lovable · P

**A ordem importa: desconecte o Lovable no editor ANTES de mexer no código.**
Se não, os commits da reestruturação sincronizam de volta e você briga com o
editor.

Depois:

- `git mv` do front atual para `web/` (preserva histórico)
- Criar `api/`
- Remover `.lovable/`, `AGENTS.md`, `lovable-error-reporting.ts`,
  `previewAuthStorage.ts`, `cron-auth.ts`, `auth-attacher.ts`,
  `auth-middleware.ts`, e os pacotes `@lovable.dev/*`
- `vite.config.ts` novo, escrito do zero (react + tailwind + tsconfig paths).
  Hoje ele delega tudo a `@lovable.dev/vite-tanstack-config`
- Apagar os 45 componentes `ui/` mortos, `components/f8/Shell.tsx` e
  `hooks/use-mobile.tsx` — saem junto **34 dependências**
- `.env` no `.gitignore` e `.env.example` com placeholders

Sem produção, dá para quebrar o build por alguns dias sem consequência.

**Pronto quando:** `grep -ri lovable` não retorna nada e a árvore está no
formato `web/` + `api/`.

## Fase 3 — API e schema · M

- Projeto no Neon com **duas branches**: desenvolvimento e produção
- FastAPI de pé, healthcheck, `Dockerfile`, `docker-compose.yml`
- Modelos SQLAlchemy das tabelas de [modelo-de-dados.md](modelo-de-dados.md)
- Migration inicial no Alembic
- `structlog` com `correlacao_id` por requisição

**O ponto de atenção:** os dois índices parciais (seção 4 do modelo de dados)
vão em `op.execute()`, SQL escrito à mão. Nenhum ORM os gera.

**Pronto quando:** `alembic upgrade head` numa branch limpa do Neon produz o
schema completo, índices parciais incluídos, conferido por `pg_dump --schema-only`.

## Fase 4 — Autenticação · M

Fundação: enquanto a sessão não existir, nenhuma tela pode ser ligada.

- Login por código + senha com **argon2id**
- JWT em cookie `HttpOnly` + `Secure` + `SameSite=Lax`
- Refresh token; 12h para o totem
- Bloqueio por código (5 tentativas / 2 min) **e rate limiting por IP**
- Troca de senha obrigatória no primeiro acesso
- Solicitação de nova senha pelo colaborador
- Dependência `get_ator()` e guards por papel
- **`log_acesso` nasce aqui**, não é item separado

**Pronto quando:** os seis eventos de `log_acesso` são gravados corretamente e
um colaborador de teste percorre login → troca obrigatória → logout.

## Fase 5 — Módulos de negócio e auditoria · G

As funções plpgsql viram serviços Python, seguindo as regras 4.2 e 4.3 da
[arquitetura](arquitetura.md).

| Protótipo (plpgsql) | Vira |
|---|---|
| `finalizar_pedido` | transação: baixa de estoque + pedido + itens + código de retirada |
| `cancelar_pedido` | transação: devolve estoque, marca cancelado, audita |
| `gerar_almoco` | insert apoiado no índice único; conflito = já tem almoço hoje |
| `confirmar_almoco` | valida validade e status, confirma |
| `registrar_almoco_manual` | confirma sem código, audita |
| `ajustar_estoque` | ajuste + `ajustes_estoque` + auditoria |

**A armadilha:** baixa de estoque **não pode ser ler-depois-escrever**. Precisa
ser `UPDATE produtos SET estoque = estoque - :qtd WHERE id = :id AND estoque >= :qtd`,
conferindo `rowcount == 1`. Ler o estoque em Python, decidir e depois escrever
deixa duas compras simultâneas furarem o estoque — coisa que a função Postgres
do protótipo protegia.

### Testes obrigatórios desta fase

Não são opcionais: são o que substitui a RLS que deixou de existir.

- Colaborador A não lê pedido do colaborador B
- Colaborador não acessa rota de admin
- Refeitório não acessa rota de admin
- Dois `gerar_almoco` simultâneos para a mesma pessoa → só um passa
- Compra concorrente não deixa estoque negativo
- Cada ação da lista de eventos grava auditoria, **na mesma transação**
- Rollback da mudança faz sumir também o registro de auditoria

**Pronto quando:** os testes acima passam e a API cobre tudo que as telas do
protótipo usam.

## Fase 6 — Exportação para o Sankhya · M

Bloqueada pelas pendências S1–S4; o resto do plano não depende dela.

- Tabela `exportacoes`, marcação `lote_id` / `exportado_em`
- Fechar competência (torna imutável) e reabrir (com auditoria)
- Adaptador de template isolado num arquivo
- Geração com `openpyxl`, arquivo do lote guardado
- Eventos `lote.fechado`, `lote.exportado`, `lote.reaberto`

**Pronto quando:** você gera o lote de um mês, apaga o arquivo, gera de novo e
sai idêntico — e uma segunda exportação da mesma competência não duplica
registro nenhum.

## Fase 7 — Front em SPA · G

Só começa quando a API cobrir as telas. Quatro pedaços entregáveis:

**7a — Esqueleto · M**
Vite + React + TanStack Router sem o Start. Cliente TypeScript gerado do
`/openapi.json` com `openapi-typescript` + `openapi-fetch`. Sessão por cookie.
TanStack Query configurado. Sentry no lugar do reporting do Lovable.

**7b — Colaborador · M**
Login, home, loja, almoço, consumo. São as telas mais simples e validam o padrão
para as demais.

**7c — Refeitório · P**
Painel do totem. O Realtime do Supabase vira `refetchInterval`. Downgrade só no
papel: a confirmação é disparada pela leitura do próprio operador, então a tela
dele já atualiza na hora.

**7d — Admin · G**
Entregas, almoços, estoque, vendas, colaboradores, fechamento de lote. É onde
estão as telas gordas do protótipo (estoque com 775 linhas, colaboradores com
572) — **quebrar em componentes por feature ao migrar, não depois.**

Aqui também entra o conserto herdado: **a importação por planilha precisa aceitar
matrícula**, senão o furo do protótipo se repete no sistema novo.

**Pronto quando:** não existe nenhuma referência a `supabase` em `web/`.

## Fase 8 — Infra e go-live · M

- VPS com Docker Compose: Caddy (TLS + estático + proxy `/api`) e a API
- Cloudflare na frente
- Rotação de log do Docker configurada
- `pg_dump` semanal para fora do Neon, **com restore testado**
- Sentry ligado nas duas pontas
- Deploy por GitHub Actions
- **Carga inicial:** os 100 colaboradores (com matrícula) e o catálogo de
  produtos, pela importação por planilha

**Pronto quando:** um colaborador real faz login, compra, gera almoço e o
refeitório confirma — tudo em produção — e o restore do backup foi testado de
verdade.

## Ordem e paralelismo

```
1 ──► 2 ──► 3 ──► 4 ──► 5 ──┬──► 6 ──┐
                            │        ├──► 8
                            └──► 7 ──┘
```

- A fase 2 pode começar assim que a 1 estiver aceita.
- As fases 6 e 7 são independentes entre si e podem andar em paralelo.
- A fase 6 pode atrasar sem travar a 7: se as pendências do Sankhya demorarem,
  vá para o front e volte depois.

## Riscos

| Risco | Por que importa | Mitigação |
|---|---|---|
| **Perder os índices parciais** | Falha silenciosa: só aparece com dois usuários simultâneos | Teste de concorrência na fase 5 |
| **A RLS que deixa de existir** | O banco não protege mais contra filtro esquecido | Ator obrigatório no serviço + testes de autorização |
| **Auditoria fora da transação** | A trilha passa a mentir, que é pior do que não ter trilha | Regra "commit só na borda" + teste de rollback |
| **Template do Sankhya indefinido** | Pode invalidar o desenho do lote | Adaptador isolado; premissas registradas em S1–S4 |
| **Escopo do admin** | 7d é a fase mais longa e a mais fácil de subestimar | Quebrar por tela, entregar uma de cada vez |

## Decisões canceladas no caminho

Registro para não serem retomadas por engano:

| Cancelado | Motivo |
|---|---|
| Consertar a matrícula no sistema atual | Sem produção, o campo nasce correto no schema novo |
| Fase de migração de dados | Não há dado a migrar |
| Preservar hashes bcrypt do Supabase | Não há senha a preservar → argon2id |
| Janela de corte e operação em paralelo | Não há sistema no ar para cortar |
