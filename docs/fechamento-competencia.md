# Fechamento da competência

O mês de consumo **fecha no dia 20**; o seguinte abre no dia 21. Não é mês
civil.

A competência `AAAA-MM` vai do dia 21 de `MM-1` até o fim do dia 20 de `MM`, e
leva o nome do mês em que **fecha** — o mesmo padrão da folha, em que o ciclo
encerrado em 20/09 é descontado no pagamento de setembro.

```
competência 2026-09
  21/08/2026 00:00  ─────────────────────────  20/09/2026 23:59
                                                21/09 abre a 2026-10
```

Consequência: em 22/09 o ciclo aberto é `2026-10`.

## Onde a regra vive

**`api/app/modules/consumo.py`** — `DIA_CORTE`, `_competencia_de()` e
`_intervalo()`. É a versão que importa: decide quanto cada pessoa paga e em
qual mês.

**`web/src/comum/periodo.ts`** — `DIA_CORTE`, `competenciaDe()` e `cicloDe()`.
Só rotula o filtro de meses e preenche as datas dos relatórios. Se o corte
mudar, os dois mudam junto.

Duas implementações pequenas em camadas diferentes foi decisão consciente: a
alternativa era um endpoint só para o front perguntar onde o mês começa.

## A armadilha

`criado_em` é gravado em UTC. Uma compra às 21h do dia 20 em São Paulo é
`21/09 00:00` em UTC — comparar sem converter o fuso joga a compra no ciclo
seguinte e cobra a pessoa no mês errado, sem erro nenhum aparecer.

`tests/test_consumo.py::test_compra_da_noite_do_dia_20_fica_no_ciclo_que_fecha`
é o que segura a conversão no lugar.

## Na interface

Os colaboradores já convivem com o corte do dia 20, então não há aviso nem
explicação: o extrato simplesmente conta certo, e zerar no dia 21 é o
esperado. O intervalo aparece onde se escolhe o ciclo, e só ali.

**Colaborador** — o seletor do "Meu consumo" mostra *outubro de 2026 · 21/09 a
20/10*.

**Admin** — o filtro das telas de vendas e de almoços tem um botão **Ciclo**
que abre a mesma lista. Escolhido o ciclo, a exportação sai com aquele
período. Sem essa lista a data é digitada à mão, que é como o mês entra
errado no Sankhya.

As duas telas usam o mesmo `componentes/FiltroPeriodo.tsx`. A regra vale para
os dois tipos de lançamento: um almoço confirmado em 21/09 cai no mesmo ciclo
que uma compra feita no mesmo dia, e dois controles separados acabariam
divergindo — o sintoma seria dois totais diferentes para o mesmo período. A
tela de almoços abre em "hoje", porque também é operacional: é nela que o
admin confirma almoço quando o leitor falha.

Almoço **expirado não aparece** no extrato do colaborador. Código gerado e não
usado não é lançamento: ninguém almoçou e nada foi cobrado. Já não entrava no
total, mas aparecia na lista e fazia a pessoa procurar uma cobrança que não
existe.

Os dois seletores mostram **apenas ciclos com movimento**, consultados no
banco: `GET /consumo/competencias` para os da própria pessoa e
`/consumo/competencias/empresa` para os de todo mundo. O ciclo aberto entra
sempre, mesmo vazio — no dia 21 o seletor ficaria sem opção nenhuma até a
primeira compra.

### A regra existe duas vezes no servidor

`_competencia_de()` roda em Python para montar o intervalo de uma competência.
`_competencia_sql()` roda no banco para descobrir quais ciclos têm movimento —
varrer tudo em Python custaria carregar a tabela inteira.

Se as duas divergirem, um ciclo aparece no seletor e volta vazio quando é
aberto. `test_sql_e_python_concordam_sobre_o_ciclo` compara as duas em quatro
meses de instantes, incluindo as 21h de todo dia.

## Ainda não existe

Fechar competência de verdade — tornar imutável, marcar `lote_id`, impedir
exportação em dobro. É a fase 6. A tabela `exportacoes` e as colunas
`lote_id` / `exportado_em` em `pedidos` e `almocos` já existem e estão vazias;
nenhum ciclo foi fechado com a regra antiga, o que é a razão de esta mudança
ter saído de graça.
