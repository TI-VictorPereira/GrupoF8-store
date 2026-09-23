"""Entrada recusada antes de tocar o banco (422).
"""

from app.excecoes.base import DadosInvalidos


class VinculoInvalido(DadosInvalidos):
    codigo = "vinculo_invalido"
    mensagem = "Vínculo inválido. Use clt ou pj."


class PapelInvalido(DadosInvalidos):
    codigo = "papel_invalido"
    mensagem = "Papel inválido. Use colaborador, refeitorio, dp ou admin."


class MatriculaObrigatoria(DadosInvalidos):
    """CLT sem matrícula. O banco tem o mesmo CHECK; aqui a mensagem é útil."""

    codigo = "matricula_obrigatoria"
    mensagem = "Colaborador CLT precisa de matrícula."


class MatriculaNaoPermitida(DadosInvalidos):
    """PJ não tem matrícula — só codparc identifica quem é no Sankhya."""

    codigo = "matricula_nao_permitida"
    mensagem = "Colaborador PJ não tem matrícula."


class NomeObrigatorio(DadosInvalidos):
    """Serve a empresa, departamento e produto: `detalhes` diz qual deles."""

    codigo = "nome_obrigatorio"
    mensagem = "O nome é obrigatório."


class CodempInvalido(DadosInvalidos):
    codigo = "codemp_invalido"
    mensagem = "O código da empresa precisa ser positivo."


class ValorNegativo(DadosInvalidos):
    codigo = "valor_negativo"
    mensagem = "Preço e custo não podem ser negativos."


class FotoUrlLonga(DadosInvalidos):
    """A coluna guarda a URL, não a imagem: base64 aqui arrastaria a foto
    inteira em toda listagem da loja."""

    codigo = "foto_url_longa"
    mensagem = "A foto deve ser enviada ao storage; aqui vai apenas a URL."


class TipoDeAjusteInvalido(DadosInvalidos):
    """Entrada inválida não é 'estoque insuficiente' — devolver o código errado
    faz o front tratar como falta de estoque e esconde o defeito real."""

    codigo = "tipo_ajuste_invalido"
    mensagem = "Tipo de ajuste inválido. Use entrada ou baixa."


class QuantidadeInvalida(DadosInvalidos):
    codigo = "quantidade_invalida"
    mensagem = "A quantidade do ajuste precisa ser positiva."


class CompetenciaInvalida(DadosInvalidos):
    codigo = "competencia_invalida"
    mensagem = "Competência inválida. Use o formato AAAA-MM."


class ImportacaoVazia(DadosInvalidos):
    codigo = "importacao_vazia"
    mensagem = "Nenhuma linha para importar."


class ImportacaoGrandeDemais(DadosInvalidos):
    codigo = "importacao_grande_demais"
    mensagem = "Importe no máximo 500 linhas por vez."


class PeriodoInvalido(DadosInvalidos):
    codigo = "periodo_invalido"
    mensagem = "A data final não pode ser anterior à inicial."


class ProdutoIncompletoNaImportacao(DadosInvalidos):
    """Linha de produto novo sem o mínimo para cadastrar.

    """

    codigo = "produto_incompleto"
    mensagem = "Para cadastrar é preciso nome e preço de venda."


class BrindeForaDoCarrinho(DadosInvalidos):
    """O item escolhido para o brinde tem de estar no carrinho. Sem isso o
    pedido sairia com um item de graça que ninguém pediu."""

    codigo = "brinde_fora_do_carrinho"
    mensagem = "O item escolhido para o brinde não está no carrinho."


class MesAniversarioInvalido(DadosInvalidos):
    codigo = "mes_aniversario_invalido"
    mensagem = "O mês do aniversário deve estar entre 1 e 12."
