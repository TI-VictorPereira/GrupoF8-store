# Arquitetura — Loja Interna F8

> Documento de decisões. Descreve o sistema **alvo**, não o atual.
> O código em `src/` hoje é um protótipo em Supabase/Lovable que serve como
> especificação e será substituído. Ver [plano.md](plano.md).

## 1. O que o sistema é

Controle de consumo interno do Grupo F8: compras na loja interna e almoços no
refeitório, por cerca de 100 colaboradores.

**O produto final não é a loja — é o arquivo.** O objetivo do sistema é gerar
uma planilha de consumo por colaborador para ser importada no **Sankhya**. Toda
decisão de arquitetura se subordina a isso: o dado precisa ser confiável,
rastreável e reproduzível, porque vira lançamento em ERP.

Quatro papéis. Cada um é um acréscimo sobre ser colaborador, com uma exceção:

| Papel | Usa |
|---|---|
| `colaborador` | Libera o almoço do dia (código de barras), compra na loja, vê o próprio consumo |
| `dp` | Tudo do colaborador, mais o **fechamento do ciclo** e a exportação para o Sankhya |
| `admin` | Tudo, mais entregas, estoque, preço do almoço, vendas e colaboradores |
| `refeitorio` | **Só** o totem: o leitor de código de barras e nada além dele |

O `refeitorio` é a exceção porque não é uma pessoa — é um posto que fica logado
o dia inteiro num lugar de passagem, e quem passar na frente dele está
autenticado sem ter feito login. Por isso ele não compra, não gera o próprio
almoço e não vê extrato: seria consumo lançado numa conta que ninguém carrega.
Quem opera o balcão e também consome precisa do próprio login.

Escala: ~100 colaboradores, com pico de 1 a 2 requisições por segundo na hora do
almoço. Acesso **pela internet**, com login.

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Banco | **Neon** (Postgres) | Gerenciado, PITR, branches para dev/prod |
| Backend | **Python 3.12 + FastAPI** | Padrão de backend do TI |
| ORM | **SQLAlchemy 2.0, síncrono** | Padrão do ecossistema; síncrono porque o volume não justifica a complexidade do async |
| Migrations | **Alembic** | Aceita SQL bruto, necessário para os índices parciais |
| Schemas | **Pydantic v2** | Nativo do FastAPI; gera o OpenAPI |
| Senha | **argon2-cffi** (argon2id) | Recomendação atual do OWASP |
| Token | **PyJWT** | |
| Planilha | **openpyxl** | Gerada no servidor, não no navegador |
| Log de aplicação | **structlog** | JSON em stdout |
| Testes | **pytest** | |
| Front | **Vite + React 19 + TanStack Router** (SPA) | |
| Dados no front | **TanStack Query** | |
| Estilo | **Tailwind 4** | Mantido do protótipo |
| Contrato front/back | **openapi-typescript + openapi-fetch** | Tipos de ponta a ponta a partir do `/openapi.json` |
| Infra | **VPS + Docker Compose**, Caddy, Cloudflare | |

### Por que SPA e não SSR

SSR serve para SEO e primeira pintura de visitante anônimo. Aqui não existe
nenhum dos dois: todo acesso é autenticado e o totem fica com a aba aberta o dia
inteiro. Em troca, SSR cobraria um runtime Node só para servir o front,
hidratação e cuidado permanente com o que roda onde.

Como SPA, o front vira arquivo estático servido pelo Caddy.

### Por que síncrono e não async

Com o volume acima, async não compra desempenho e cobra em depuração: sessão
async do SQLAlchemy, erros de greenlet, atenção a toda chamada bloqueante.
Endpoints `def` rodam em threadpool e resolvem com folga de duas ordens de
grandeza.

Se o TI já tiver um esqueleto FastAPI padronizado, usar o dele — consistência
organizacional vale mais que esta preferência.

## 3. Estrutura do repositório

```
f8-store/
├── web/                     Front (Vite + React + TanStack Router)
│   └── src/
│       ├── api/             cliente HTTP (transporte, sem tipos de domínio)
│       ├── interfaces/      contratos de dados da API, um arquivo por domínio
│       ├── componentes/     UI reutilizável, um componente por arquivo
│       ├── comum/           hooks e utilitários (sessão, formatação)
│       ├── rotas/           árvore de rotas
│       └── telas/           uma tela por rota
├── api/
│   └── app/
│       ├── core/            config, segurança, dependências
│       ├── models/          SQLAlchemy
│       ├── schemas/         Pydantic
│       ├── modules/         auth/ pedidos/ almocos/ estoque/
│       │                    colaboradores/ exportacao/
│       ├── routers/         rotas FastAPI (camada fina)
│       └── main.py
├── alembic/
├── docs/
├── tests/
└── docker-compose.yml
```

Backend em Python e front em TypeScript: **não há monorepo nem workspaces**.
São duas pastas independentes no mesmo repositório.

## 4. As cinco regras

Estas regras são o que sustenta o desenho. Quebrar qualquer uma devolve o
projeto ao estado do protótipo.

### 4.1 O front nunca conhece o banco

No protótipo, `supabase.from(...)` aparecia direto em 10 arquivos de rota.
Passa a existir exatamente um caminho:

```
componente → TanStack Query → cliente OpenAPI → FastAPI → módulo → SQLAlchemy
```

Nenhum componente monta consulta. Nenhum router contém regra de negócio.

### 4.2 Todo serviço recebe o ator

Toda função de serviço tem a assinatura `(session, ator, ...)`, com
`ator = {id, codigo, nome, papel}`.

Isto é o que substitui a RLS do Postgres, que existia no protótipo e não
existirá aqui. Diferença importante: a RLS protegia mesmo quando o
desenvolvedor esquecia o filtro. Autorização em código **só vale se tiver
teste** — ver os testes obrigatórios no [plano.md](plano.md), fase 5.

### 4.3 Commit só na borda

**Serviço nunca dá commit.** A sessão vem por dependência do FastAPI, os
serviços recebem essa sessão e apenas fazem `session.add(...)`. O commit
acontece uma vez, no fim da requisição.

É isso que garante que a mudança e o registro de auditoria caiam juntos ou não
caiam. Um `session.commit()` solto dentro de um serviço quebra a garantia sem
dar erro — vale regra de lint, ou no mínimo destaque no guia de contribuição.

**A exceção, e por que ela existe.** Quando um serviço levanta exceção, o
FastAPI a propaga para dentro da dependência da sessão e a transação inteira é
desfeita. Isso está certo para dados de negócio e errado para registro de
segurança: o log de uma tentativa de login negada, e o contador que dispara o
bloqueio, precisam persistir **justamente porque** a requisição falhou. Se
vivessem na transação da requisição, sumiriam no rollback — e o bloqueio após
N erros nunca dispararia, porque o contador nunca chegaria a incrementar.

A distinção é de natureza, não de conveniência:

| registro | descreve | transação |
|---|---|---|
| `log_auditoria` | uma **mudança** | a mesma da mudança |
| `log_acesso` e contadores | uma **tentativa** | própria, commit imediato |

Só `app/modules/auth/registro.py` abre sessão própria. Qualquer outro módulo
que precise fazer isso precisa justificar por escrito.

### 4.4 Auditoria em código, nunca em trigger

Decisão explícita: **não usar triggers**. Comportamento disparado pelo banco é
invisível para quem lê o código do serviço.

Em troca, escrever a auditoria é responsabilidade do serviço, na mesma
transação da mudança (regra 4.3). Ver [modelo-de-dados.md](modelo-de-dados.md).

### 4.5 Mesmo domínio para front e API

O Caddy serve o front estático na raiz e faz proxy de `/api` para o FastAPI, no
mesmo domínio.

Isso elimina CORS, `SameSite=None` e toda a classe de problema de cookie entre
origens diferentes.

## 5. Autenticação e sessão

- Login por **código + senha**, com hash **argon2id**
- **JWT em cookie `HttpOnly` + `Secure` + `SameSite=Lax`** — não em localStorage
- Token de acesso curto (15–30 min) e refresh token de vida longa
- **Totem:** refresh de 12h, para cobrir o expediente sem deslogar no meio do almoço

Como o sistema fica **exposto na internet** e os códigos são numéricos e curtos,
portanto enumeráveis:

- Bloqueio por código: 5 tentativas, 2 minutos (regra herdada do protótipo)
- **Rate limiting por IP**, com penalidade progressiva — o bloqueio por código
  protege uma conta, mas não impede varredura de códigos a partir de vários IPs
- Política de senha mínima real (o protótipo aceitava 4 caracteres)
- Cloudflare na frente, absorvendo varredura antes de chegar na API

Troca de senha obrigatória no primeiro acesso (`senha_provisoria`).

## 6. Infraestrutura

```
Internet → Cloudflare → VPS
                         ├── caddy   TLS automático; front estático + proxy /api
                         └── api     uvicorn com workers → Neon
```

O Postgres **não** fica no Compose — o banco é o Neon.

Ambientes por **branch do Neon**: uma de desenvolvimento e uma de produção.

### Itens não-negociáveis da operação

- **Rotação de log do Docker.** Driver `json-file` com `max-size` e `max-file`.
  Sem isso o disco enche e a máquina cai — é a falha mais comum em VPS.
- **Backup fora do Neon.** O PITR do Neon cobre erro humano; não cobre
  indisponibilidade da conta. `pg_dump` semanal para outro provedor.
- **Deploy pelo CI.** GitHub Actions constrói a imagem, o VPS faz `pull` e
  `up -d`. Build na máquina de produção parece mais simples e não é.
- **Higiene:** SSH só por chave, firewall liberando apenas 80/443,
  atualizações de segurança automáticas.
- **Sentry** para erros. Substitui o `lovable-error-reporting` do protótipo;
  sem ele, o front fica cego.

Dimensionamento: 2 vCPU e 2 GB sobram.

### Neon: dois cuidados

1. **Autosuspend.** Nos planos menores o banco suspende com inatividade e a
   primeira consulta depois disso demora perto de um segundo — a primeira
   leitura do totem no almoço vai sentir. Resolver com ping periódico ou plano
   que permita desligar.
2. **Região.** Preferir São Paulo. Se o banco ficar nos EUA, cada consulta ganha
   cerca de 120 ms de ida e volta: invisível no admin, perceptível no totem.

### Postgres local para desenvolvimento e testes

`docker compose up` sobe um Postgres 18 no próprio compose e aponta a API para
ele. É o padrão. Falar com o Neon é que exige pedir:

```
docker compose -f docker-compose.yml -f docker-compose.neon.yml up -d
```

O padrão já foi o inverso, e o inverso cobrou: com o Neon no `docker compose
up` seco, uma rodada inteira da suíte de testes escreveu no banco de produção
sem ninguém notar. O que enganou foi o `exec` — ele entra num container que já
existe e não aplica overlay nenhum, então a flag na linha de comando parecia
estar protegendo e não protegia. Agora esquecer a flag dá o banco descartável;
acertar a produção é que exige digitar.

Existe por dois motivos concretos:

1. **A rede da empresa bloqueia a saída na 5432.** O host do Neon responde na
   443 e não na 5432 — quando isso acontece, nada que fale com o banco sobe.
2. **A suíte de testes.** Cada consulta ao Neon custa cerca de 137 ms e cada
   conexão nova, 424 ms; a suíte levava 5 a 6 minutos. No Postgres local, os
   mesmos 44 testes rodam em 3 segundos.

O banco local é descartável: `docker compose down -v` apaga, e um
`alembic upgrade head` seguido de `python -m app.scripts.semear` reconstrói.

Enquanto o sistema não entrar em produção, **o Neon também é descartável**: na
virada ele será apagado e recriado do zero. Por isso migration já aplicada pode
ser editada ou consolidada em vez de ganhar uma correção por cima — o histórico
de um sistema que ainda não serviu ninguém não vale o peso que carrega. Isso
deixa o Neon fora de sintonia com os arquivos no meio do caminho, o que é
esperado. A partir da entrada em produção a regra se inverte e vale a
disciplina de expand/contract.
O que ele não cobre é comportamento de pooler — PgBouncer em modo transação
não existe aqui. Antes de publicar algo que dependa disso, validar no Neon.

## 7. As três camadas de log

Confusão comum é tratar tudo como "log". São três coisas, com donos, retenções e
lugares diferentes.

**A regra que separa:** se um contador ou auditor pode perguntar, vai no banco.
Se é um desenvolvedor depurando, vai no stdout.

| Camada | Onde | Retenção |
|---|---|---|
| Trilha de auditoria de negócio | Postgres, `log_auditoria` | Permanente |
| Acesso e segurança | Postgres, `log_acesso` | Permanente |
| Aplicação (requests, erros, stack) | stdout → Docker / Sentry | Dias |

As duas primeiras estão detalhadas em [modelo-de-dados.md](modelo-de-dados.md).

**Nunca entra em log de aplicação:** senha, hash, token, cookie de sessão e — este
é específico deste sistema — **o código de barras do almoço completo**. Aquele
código é na prática um token ao portador: quem tem o número consegue um almoço.
Registrar apenas os últimos dígitos, como a tela do painel já faz.

Um `correlacao_id` por requisição atravessa as três camadas. É ele que permite
ligar um cancelamento ao request que o causou e ao stack trace do erro.

## 8. Registro de decisões descartadas

| Descartado | Motivo |
|---|---|
| Supabase | Objetivo declarado: eliminar a dependência da plataforma |
| Lovable | Idem. Desconectar **antes** de reestruturar, senão os commits sincronizam de volta |
| Backend separado em Nest/Fastify TS | TI padroniza Python |
| Prisma | O client Python está em modo manutenção |
| Manter SSR (TanStack Start) | Sem benefício aqui; é a peça mais acoplada ao Lovable |
| Realtime por WebSocket | `refetchInterval` do TanStack Query cobre os três usos |
| Redis, filas, réplica, autoscaling | O volume não justifica |
| Triggers de auditoria | Escondem comportamento de quem lê o código |
| Particionamento e expurgo de logs | Cerca de 40 MB/ano; complexidade sem ganho |
| Tela de consulta de auditoria | Consulta por SQL, sob demanda. Em vez da tela, um `docs/auditoria.sql` versionado com as consultas prontas *(a escrever)* |
| bcrypt | Só fazia sentido para preservar hashes do Supabase; sem produção, argon2id é melhor |
