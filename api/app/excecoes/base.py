"""Erro base da aplicação.

Todo erro previsto tem um `codigo` estável e legível por máquina. O front decide
o que fazer olhando o código, nunca comparando o texto da mensagem — texto muda,
é traduzido e não serve de contrato.

A resposta de erro é sempre a mesma forma:

    {"codigo": "estoque_insuficiente",
     "mensagem": "Quantidade acima do estoque disponível.",
     "detalhes": {...},
     "correlacao_id": "..."}

O `correlacao_id` fecha o ciclo: o usuário informa o código que apareceu na tela
e ele encontra, no log, exatamente a requisição que falhou.
"""

from typing import Any


class ErroDaAplicacao(Exception):
    """Erro esperado, de negócio ou de acesso. Nunca use para defeito de código."""

    status = 400
    codigo = "erro"
    mensagem = "Não foi possível concluir a operação."

    def __init__(
        self,
        mensagem: str | None = None,
        *,
        detalhes: dict[str, Any] | None = None,
    ) -> None:
        self.mensagem = mensagem or type(self).mensagem
        self.detalhes = detalhes or {}
        super().__init__(self.mensagem)

    def corpo(self, correlacao_id: str) -> dict[str, Any]:
        corpo: dict[str, Any] = {
            "codigo": self.codigo,
            "mensagem": self.mensagem,
            "correlacao_id": correlacao_id,
        }
        if self.detalhes:
            corpo["detalhes"] = self.detalhes
        return corpo


class NaoEncontrado(ErroDaAplicacao):
    status = 404
    codigo = "nao_encontrado"
    mensagem = "Registro não encontrado."


class Conflito(ErroDaAplicacao):
    """Estado atual impede a operação — não é erro de entrada."""

    status = 409
    codigo = "conflito"
    mensagem = "A operação conflita com o estado atual do registro."


class DadosInvalidos(ErroDaAplicacao):
    status = 422
    codigo = "dados_invalidos"
    mensagem = "Dados inválidos."
