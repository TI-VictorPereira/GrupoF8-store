# Runbook de produção

Comandos para copiar e colar. Todos rodam no VPS, na pasta do projeto.

O que está aqui é o que existe hoje. O que ainda não existe está marcado como
**pendente** em vez de omitido — omitir dá a impressão de que já foi feito.

---

## Antes da primeira subida

Na máquina, uma vez:

```bash
# 1. o .env de produção. Nunca vem do git.
cp api/.env.example api/.env && vi api/.env
```

Precisa ter, no mínimo:

| variável | o que é |
|---|---|
| `DATABASE_URL` | Neon, endpoint **com pooler** — é o da aplicação |
| `DATABASE_URL_DIRETA` | Neon, endpoint **sem pooler** — é o do Alembic |
| `JWT_SECRET` | aleatório e longo; trocar derruba todas as sessões |
| `AMBIENTE` | `producao` (o compose já força, mas deixe explícito) |

```bash
# 2. o domínio, que o Caddy usa para emitir o certificado
echo 'DOMINIO=loja.suaempresa.com.br' >> .env

# 3. firewall: só 80 e 443 entram
ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
```

Cloudflare em modo **Full (strict)**. Em Flexible o cookie de sessão viaja sem
TLS entre a Cloudflare e o VPS.

---

## Subir

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl -sf https://$DOMINIO/api/saude && echo OK
```

Conferir que a documentação **não** está pública — se responder 200, o
`AMBIENTE` não chegou no container:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://$DOMINIO/api/docs   # espera 404
```

---

## Deploy de uma versão nova

A ordem importa e não é negociável: **migration antes do código novo receber
tráfego**. Ao contrário, os workers sobem contra um schema que ainda não
existe.

```bash
git pull

# 1. migration, num container descartável que não recebe requisição
docker compose -f docker-compose.prod.yml run --rm --no-deps api alembic upgrade head

# 2. só então o código novo
docker compose -f docker-compose.prod.yml up -d --build
```

### A regra que torna essa ordem segura

Toda migration precisa ser compatível com o código que **já está rodando**.
Com isso, schema novo + código velho funciona, e a ordem deixa de ser frágil —
inclusive na volta, se o deploy precisar ser revertido.

Migration destrutiva — dropar coluna, renomear, apertar `NOT NULL` — não passa
nesse teste e vai em **dois deploys**:

1. sobe o código que parou de usar a coluna; schema intocado
2. só depois, a migration que a remove

O SQLAlchemy seleciona todas as colunas mapeadas. Dropar uma coluna que o
código ainda mapeia derruba 100% das consultas daquela tabela na hora, não aos
poucos.

---

## Reverter

```bash
# volta para a imagem anterior
git checkout <commit-anterior>
docker compose -f docker-compose.prod.yml up -d --build

# se a migration também precisar voltar (só se ela for reversível)
docker compose -f docker-compose.prod.yml run --rm --no-deps api alembic downgrade -1
```

Se as migrations seguiram a regra acima, o código velho roda com o schema novo
e **não é preciso reverter o banco** — reverter só a imagem é mais rápido e
mais seguro.

---

## Operação do dia a dia

### Alguém perdeu a senha e é o único admin

```bash
docker compose -f docker-compose.prod.yml exec api python -m app.scripts.redefinir_senha 1000
```

A senha aparece uma vez, as sessões daquela pessoa caem e a troca fica na
auditoria com ator `console`.

### O ciclo foi fechado por engano

A tela de Fechamento tem "Descartar lote", que pede motivo. Isso solta o
carimbo de tudo que entrou e libera a competência para fechar de novo. Não
existe caminho por fora: fechar duas vezes é recusado pelo banco.

### Expiração parece travada

```bash
docker compose -f docker-compose.prod.yml logs relogio --tail 50
docker compose -f docker-compose.prod.yml exec api python -m app.scripts.relogio
```

### Ver o que a API está respondendo

```bash
docker compose -f docker-compose.prod.yml logs api --tail 200 -f
```

Cada resposta traz `x-correlacao-id`; é por ele que se acha a requisição no
log a partir de um print do usuário.

---

## Backup

**Pendente.** O PITR do Neon cobre erro humano; não cobre indisponibilidade da
conta. Falta um `pg_dump` semanal para outro provedor, com restore testado —
backup que nunca foi restaurado não é backup.

```bash
# o comando é este; falta o agendamento e o destino
pg_dump "$DATABASE_URL_DIRETA" -Fc -f f8-store-$(date +%F).dump
```

---

## O que ainda não existe

- **Backup automatizado** e restore testado
- **Sentry**: `SENTRY_DSN` já é lido pela config, mas o SDK não está instalado
  e nada o inicializa. Hoje um erro em produção só aparece no log do container
- **Deploy pelo CI**: o build ainda acontece na máquina de produção
  (`up -d --build`). O desenhado é o GitHub Actions construir a imagem e o VPS
  só fazer `pull` + `up -d`
- **Atualizações de segurança automáticas** no VPS (`unattended-upgrades`)
