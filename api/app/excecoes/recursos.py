"""Registro pedido não existe (404).

Todas mantêm status 404 e herdam o corpo de `NaoEncontrado`.
"""

from app.excecoes.base import NaoEncontrado


class ColaboradorNaoEncontrado(NaoEncontrado):
    codigo = "colaborador_nao_encontrado"
    mensagem = "Colaborador não encontrado."


class EmpresaNaoEncontrada(NaoEncontrado):
    codigo = "empresa_nao_encontrada"
    mensagem = "Empresa não encontrada."


class DepartamentoNaoEncontrado(NaoEncontrado):
    codigo = "departamento_nao_encontrado"
    mensagem = "Departamento não encontrado."


class ProdutoNaoEncontrado(NaoEncontrado):
    codigo = "produto_nao_encontrado"
    mensagem = "Produto não encontrado."


class CategoriaNaoEncontrada(NaoEncontrado):
    codigo = "categoria_nao_encontrada"
    mensagem = "Categoria não encontrada."


class AlmocoNaoEncontrado(NaoEncontrado):
    codigo = "almoco_nao_encontrado"
    mensagem = "Almoço não encontrado."


class SolicitacaoNaoEncontrada(NaoEncontrado):
    codigo = "solicitacao_nao_encontrada"
    mensagem = "Solicitação não encontrada."


class LoteNaoEncontrado(NaoEncontrado):
    codigo = "lote_nao_encontrado"
    mensagem = "Lote de exportação não encontrado."
