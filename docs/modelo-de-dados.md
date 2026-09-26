# Modelo de dados — Loja Interna F8

> Schema implementado no Neon (Postgres 18). O SQL aqui é referência de leitura;
> a implementação está nos modelos SQLAlchemy em `api/app/models/` e na migration
> `55da2fa5e05c_schema_inicial.py`.

## 1. Convenções

- Nomes em **português**.
- Chaves primárias `uuid` com `gen_random_uuid()`.
- Datas sempre `timestamptz`.
- **Estados em `text` com `CHECK`**, não em `ENUM` nativo — enum do Postgres
  exige `ALTER TYPE` para evoluir.
- Dinheiro em `numeric(10,2)`. Nunca `float`.
- **Sem triggers.** Toda regra é constraint declarativa ou código de serviço.

## 2. Fuso horário

**Todo cálculo de "dia" usa `America/Sao_Paulo`**, inclusive o índice que limita
o almoço a um por dia.

## 3. Identificação: as três chaves

Este é o ponto mais importante do modelo, e o que mais errou antes de acertar.
São três identificadores com papéis distintos, e confundi-los quebra a
exportação:

| campo | tipo | papel |
|---|---|---|
| `colaboradores.codigo` | `varchar` | **Credencial de login.** Criada pelo admin junto com a senha provisória. Não tem nenhuma relação com o ERP |
| `colaboradores.codparc` | `integer` | **A chave do Sankhya.** Obrigatória e única no sistema inteiro. Vale para CLT e PJ |
| `colaboradores.matricula` | `integer` | Número de RH. **Só CLT.** Única dentro da empresa, mas **repete entre empresas** |
| `empresas.codemp` | `integer` | Código da empresa no Sankhya. Decide onde a despesa é lançada |

Três consequências que o schema precisa refletir:

1. **Matrícula não identifica ninguém sozinha.** No Sankhya a mesma matrícula
   existe em empresas diferentes. Quem identifica é `codparc`.
2. **PJ não tem matrícula.** Só CLT tem.
3. **`codigo` é texto de propósito.** É credencial, nunca entra em conta, e
   texto preserva exatamente o que foi digitado. Os outros três são números no
   Sankhya e são `integer` aqui.

## 4. Tabelas de cadastro

```sql
create table empresas (
  id        uuid primary key default gen_random_uuid(),
  codemp    integer not null unique,
  nome      text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table departamentos (
  id   uuid primary key default gen_random_uuid(),
  nome text not null unique            -- compartilhados entre as empresas
);

create table categorias_produto (
  id   uuid primary key default gen_random_uuid(),
  nome text not null unique
);
```

### Colaboradores

```sql
create table colaboradores (
  id               uuid primary key default gen_random_uuid(),
  nome_completo    text not null,

  codigo           text not null unique,       -- login
  codparc          integer not null unique,    -- Sankhya
  vinculo          text not null default 'clt',
  matricula        integer,                    -- só CLT
  empresa_id       uuid not null references empresas(id),

  papel            text not null default 'colaborador',
  departamento_id  uuid references departamentos(id),
  ativo            boolean not null default true,

  senha_hash       text not null,              -- argon2id
  senha_provisoria boolean not null default false,

  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),

  check (papel in ('colaborador','refeitorio','admin')),
  check (vinculo in ('clt','pj')),
  check (
    (vinculo = 'clt' and matricula is not null) or
    (vinculo = 'pj'  and matricula is null)
  ),
  unique (empresa_id, matricula)
);
```

**`codparc` é obrigatório.** Ninguém entra no sistema sem estar cadastrado como
parceiro no Sankhya. Isso garante que nenhuma competência fecha com pendência de
identificação, ao custo de o cadastro no ERP ter de vir antes do acesso.

**O `CHECK` de vínculo faz o trabalho que seria de trigger.** CLT sem matrícula e
PJ com matrícula são recusados pelo banco.

**`unique (empresa_id, matricula)` funciona para PJ** porque no Postgres `NULL`
não colide com `NULL`: vários PJ convivem na mesma empresa sem constraint extra.

### Produtos e preço do almoço

```sql
create table produtos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  codigo       text not null unique,
  categoria_id uuid references categorias_produto(id),
  custo        numeric(10,2) not null default 0,
  preco_venda  numeric(10,2) not null default 0,
  estoque      integer not null default 0 check (estoque >= 0),
  foto_url     text,                      -- URL do R2, nunca base64
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

create table precos_almoco (
  id              uuid primary key default gen_random_uuid(),
  valor           numeric(10,2) not null,
  vigencia_inicio date not null,
  vigencia_fim    date,                    -- null = vigente
  criado_em       timestamptz not null default now(),
  criado_por      uuid references colaboradores(id)
);
```

`precos_almoco` existe mesmo se o almoço for gratuito hoje: a exportação de
março precisa usar o preço de março, não o de hoje. Ver pendência S3.

## 5. Identidade congelada nos fatos

`pedidos` e `almocos` guardam `empresa_id`, `vinculo` e `matricula` **do momento
em que o consumo aconteceu**, não do cadastro atual.

Isso não é redundância. Duas coisas mudam ao longo do tempo:

- **Transferência de empresa.** Quem muda de empresa em fevereiro não pode ter o
  consumo de janeiro lançado no CODEMP novo.
- **Conversão CLT → PJ.** Quando acontece, o `CHECK` obriga a matrícula a virar
  nula — ela **desaparece do cadastro**. Sem congelar, o histórico de CLT seria
  reexportado sem matrícula.

Ambos são erros silenciosos: o arquivo importa normalmente e o lançamento vai
para o lugar errado.

**`codparc` não é congelado** — identifica a pessoa e não muda com essas
transições. É resolvido a partir do cadastro na hora de exportar.

Comportamento verificado no banco:

```
pedido   codemp  vinculo  matricula      (cadastro hoje: pj, matricula nula)
AAA      1       clt      1234           ← antes da conversão
BBB      2       pj       -              ← depois
```

## 6. Pedidos, itens e almoços

```sql
create table pedidos (
  id                  uuid primary key default gen_random_uuid(),
  colaborador_id      uuid not null references colaboradores(id),
  empresa_id          uuid not null references empresas(id),   -- congelado
  vinculo             text not null,                           -- congelado
  matricula           integer,                                 -- congelado
  valor_total         numeric(10,2) not null default 0,
  status              text not null default 'pendente'
                      check (status in ('pendente','entregue','cancelado')),
  codigo_retirada     text not null,
  criado_em           timestamptz not null default now(),
  entregue_em         timestamptz,
  entregue_por        uuid references colaboradores(id),
  cancelado_em        timestamptz,
  motivo_cancelamento text,
  lote_id             uuid references exportacoes(id),
  exportado_em        timestamptz
);

create table itens_pedido (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references pedidos(id) on delete cascade,
  produto_id     uuid references produtos(id) on delete set null,
  nome_produto   text not null,               -- congelado
  categoria      text,                        -- congelado
  quantidade     integer not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null,      -- congelado
  custo_unitario numeric(10,2) not null       -- congelado
);

create table almocos (
  id             uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id),
  empresa_id     uuid not null references empresas(id),        -- congelado
  vinculo        text not null,                                -- congelado
  matricula      integer,                                      -- congelado
  codigo_barras  text not null unique,
  status         text not null default 'pendente'
                 check (status in ('pendente','confirmado','expirado','cancelado')),
  origem         text not null default 'totem'
                 check (origem in ('totem','manual')),
  valor          numeric(10,2) not null default 0,             -- congelado
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null,
  confirmado_em  timestamptz,
  confirmado_por uuid references colaboradores(id),
  lote_id        uuid references exportacoes(id),
  exportado_em   timestamptz
);

create table ajustes_estoque (
  id         uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id),
  tipo       text not null check (tipo in ('entrada','baixa')),
  quantidade integer not null check (quantidade > 0),
  motivo     text not null,
  criado_por uuid references colaboradores(id),
  criado_em  timestamptz not null default now()
);
```

Os campos "congelados" em `itens_pedido` preservam o retrato da venda: se o
produto for renomeado ou tiver o preço alterado, o pedido antigo continua
contando a verdade da época.

## 7. Os três índices parciais

**Estas regras vivem em índices, não em código.** Nenhum ORM as gera: estão em
`op.execute()` na migration, escritas à mão.

```sql
create unique index almocos_um_por_dia
  on almocos (colaborador_id, ((criado_em at time zone 'America/Sao_Paulo')::date))
  where status in ('pendente','confirmado');

create unique index pedidos_codigo_retirada_pendente_uk
  on pedidos (codigo_retirada)
  where status = 'pendente';

create unique index exportacoes_competencia_ativa_uk
  on exportacoes (competencia)
  where status <> 'descartada';
```

**Perder qualquer um é falha silenciosa:** só aparece quando dois usuários agem
ao mesmo tempo. Todos os três têm teste.

## 8. Apoio ao login

```sql
create table tentativas_login (      -- contador do bloqueio; histórico vai em log_acesso
  codigo        text primary key,
  tentativas    integer not null default 0,
  bloqueado_ate timestamptz
);

create table solicitacoes_senha (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null,
  nome_informado text,
  status         text not null default 'aberta'
                 check (status in ('aberta','atendida','descartada')),
  criado_em      timestamptz not null default now(),
  atendido_em    timestamptz,
  atendido_por   uuid references colaboradores(id)
);
```

## 9. Exportação para o Sankhya

```sql
create table exportacoes (
  id              uuid primary key default gen_random_uuid(),
  competencia     text not null,               -- 'AAAA-MM'
  status          text not null default 'aberta'
                  check (status in ('aberta','fechada','exportada','descartada')),
  criado_em       timestamptz not null default now(),
  criado_por      uuid references colaboradores(id),
  fechado_em      timestamptz,
  exportado_em    timestamptz,
  arquivo_caminho text,
  total_registros integer,
  valor_total     numeric(12,2)
);
```

Mais a marcação `lote_id` / `exportado_em` em `pedidos` e `almocos`.

**Arquivo único**, com `codparc` como chave da pessoa — CLT e PJ na mesma
planilha. Matrícula e vínculo saem das colunas congeladas do fato, não do
cadastro atual.

As quatro exigências que separam isto de um relatório:

1. **Idempotência.** Sem `lote_id`, um mês entra duas vezes no Sankhya e ninguém
   percebe até o fechamento contábil.
2. **Fechamento.** Competência fechada é imutável.
3. **Reprodutibilidade.** Gerado no servidor, arquivo guardado. Se o Sankhya
   recusar, reenvia-se o mesmo arquivo.
4. **Mapeamento isolado.** Um adaptador traduz o modelo interno para as colunas
   do Sankhya; quando o template chegar, muda só ele.

O fechamento **recusa competência com colaborador sem `codparc`** — hoje isso é
impossível, porque a coluna é obrigatória, mas a validação fica como rede.

## 10. Auditoria

Sem trigger, escrita pelo serviço. Sem expurgo e sem particionamento — o volume
é de cerca de 40 MB/ano.

**As duas tabelas têm regras de transação opostas, e isso é deliberado:**

- `log_auditoria` descreve uma **mudança** → mesma transação dela, para os dois
  caírem juntos ou não caírem.
- `log_acesso` e os contadores de tentativa descrevem uma **tentativa** →
  transação própria, com commit imediato. Precisam sobreviver ao rollback da
  falha; do contrário não sobraria rastro das tentativas negadas e o bloqueio
  por excesso de erros nunca dispararia.

Há também `tentativas_ip`, janela deslizante por endereço — no banco e não em
memória, porque memória de processo não é compartilhada entre workers nem
sobrevive a deploy. Não justifica um Redis neste volume; a barreira principal
contra varredura é a regra de rate limiting do Cloudflare, antes da API.

```sql
create table log_auditoria (
  id               uuid primary key default gen_random_uuid(),
  criado_em        timestamptz not null default now(),

  usuario_id       uuid references colaboradores(id),
  usuario_codigo   text not null,      -- copiados, não referenciados
  usuario_nome     text not null,
  usuario_papel    text not null,

  acao             text not null,
  entidade         text not null,
  entidade_id      uuid,
  descricao        text not null,      -- legível sem join

  dados_anteriores jsonb,
  dados_novos      jsonb,

  ip               inet,
  user_agent       text,
  correlacao_id    uuid not null
);

create table log_acesso (
  id            uuid primary key default gen_random_uuid(),
  criado_em     timestamptz not null default now(),
  codigo        text not null,          -- o digitado, mesmo se não existir
  usuario_id    uuid references colaboradores(id),
  usuario_nome  text,
  evento        text not null
                check (evento in ('login_ok','login_negado','bloqueado',
                                  'logout','senha_trocada','senha_solicitada')),
  motivo        text,
  ip            inet,
  user_agent    text,
  correlacao_id uuid not null
);
```

Os campos de usuário são **copiados**: sem isso, toda consulta precisa de join —
e se o colaborador for renomeado, a trilha antiga passa a mentir sobre quem era
aquela pessoa na época.

### Índices

```sql
create index on log_auditoria (usuario_id, criado_em desc);
create index on log_auditoria (usuario_codigo, criado_em desc);
create index on log_auditoria (criado_em desc);
create index on log_auditoria (entidade, entidade_id, criado_em desc);
create index on log_auditoria (acao, criado_em desc);

create index on log_acesso (codigo, criado_em desc);
create index on log_acesso (criado_em desc);
create index on log_acesso (evento, criado_em desc);
create index on log_acesso (ip, criado_em desc);
```

### Eventos auditáveis

| `acao` | `entidade` |
|---|---|
| `pedido.entregue` | pedido |
| `pedido.cancelado` | pedido |
| `almoco.confirmado_manual` | almoco |
| `almoco.confirmacao_desfeita` | almoco |
| `estoque.ajustado` | produto |
| `produto.criado` · `produto.alterado` | produto |
| `produto.inativado` · `produto.reativado` | produto |
| `colaborador.criado` · `colaborador.alterado` | colaborador |
| `colaborador.inativado` · `colaborador.reativado` | colaborador |
| **`colaborador.vinculo_alterado`** | colaborador |
| **`colaborador.empresa_alterada`** | colaborador |
| `colaborador.senha_redefinida` | colaborador |
| `colaboradores.importados` | colaborador |
| `preco_almoco.alterado` | preco_almoco |
| `lote.fechado` · `lote.exportado` · `lote.reaberto` | exportacao |

`colaborador.vinculo_alterado` é o que preserva a matrícula perdida: quando o CLT
vira PJ, o `dados_anteriores` guarda o valor que sai do cadastro.

**Não entram na auditoria** a criação de pedido e a geração ou confirmação normal
de almoço: as próprias tabelas já são o registro do fato, com autor e horário. A
auditoria cobre o que **altera, desfaz ou sobrepõe** o fluxo normal.

Append-only por convenção. Não há tela de consulta: a leitura é por SQL, sob
demanda.

## 11. Pendências — Sankhya

Bloqueiam apenas a exportação. O resto do sistema anda sem elas.

| # | Pendência | Situação |
|---|---|---|
| S1 | Uma linha por consumo ou um total por colaborador no período? | **aberta** |
| S2 | Como o Sankhya casa a pessoa? | **resolvida** — `codparc`, para CLT e PJ, arquivo único |
| S3 | O almoço tem valor? Há desconto em folha? | **aberta** — enquanto isso, `precos_almoco` existe com valor zero |
| S4 | Template final de colunas | **aberta** — isolado no adaptador |
