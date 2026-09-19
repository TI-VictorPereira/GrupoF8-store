"""Erros das regras de negócio.

Vários destes correspondem a constraints do banco. A checagem em código existe
para dar uma mensagem decente ao usuário; quem garante a regra sob concorrência
continua sendo o banco. Por isso os serviços também traduzem a violação de
constraint para o erro correspondente daqui — os dois caminhos chegam à mesma
resposta.
"""

from app.excecoes.base import Conflito, ErroDaAplicacao


class EstoqueInsuficiente(Conflito):
    codigo = "estoque_insuficiente"
    mensagem = "Quantidade acima do estoque disponível."


class ProdutoIndisponivel(Conflito):
    codigo = "produto_indisponivel"
    mensagem = "Produto inativo ou sem estoque."


class CarrinhoVazio(ErroDaAplicacao):
    codigo = "carrinho_vazio"
    mensagem = "Nenhum item selecionado."


class AlmocoJaGeradoHoje(Conflito):
    codigo = "almoco_ja_gerado_hoje"
    mensagem = "Já existe um almoço liberado para hoje."


class AlmocoExpirado(Conflito):
    codigo = "almoco_expirado"
    mensagem = "Código de almoço expirado. Gere um novo."


class AlmocoJaConfirmado(Conflito):
    codigo = "almoco_ja_confirmado"
    mensagem = "Este almoço já foi confirmado."


class CodigoDeBarrasInvalido(ErroDaAplicacao):
    codigo = "codigo_barras_invalido"
    mensagem = "Código não encontrado."


class PedidoNaoPendente(Conflito):
    codigo = "pedido_nao_pendente"
    mensagem = "O pedido não está mais pendente."


class CompetenciaFechada(Conflito):
    codigo = "competencia_fechada"
    mensagem = "Esta competência já foi fechada."


class ColaboradorSemCodparc(Conflito):
    """Impede fechar competência com alguém que o Sankhya não sabe identificar."""

    codigo = "colaborador_sem_codparc"
    mensagem = "Há colaboradores sem código de parceiro. Corrija antes de fechar."


class CodigoDuplicado(Conflito):
    codigo = "codigo_duplicado"
    mensagem = "Já existe um cadastro com este código."


class MatriculaDuplicada(Conflito):
    codigo = "matricula_duplicada"
    mensagem = "Já existe um colaborador com esta matrícula nesta empresa."


class CodparcDuplicado(Conflito):
    codigo = "codparc_duplicado"
    mensagem = "Já existe um colaborador com este código de parceiro."


class AlmocoNaoConfirmado(Conflito):
    """Desfazer só faz sentido no que foi confirmado."""

    codigo = "almoco_nao_confirmado"
    mensagem = "Só é possível desfazer um almoço confirmado."


class AutoInativacao(Conflito):
    """Inativar o próprio acesso deixaria o admin fora do sistema que ele
    administra — e possivelmente sem ninguém para reverter."""

    codigo = "auto_inativacao"
    mensagem = "Você não pode inativar o próprio acesso."


class SolicitacaoJaTratada(Conflito):
    codigo = "solicitacao_ja_tratada"
    mensagem = "Esta solicitação já foi tratada."


class EmpresaComColaboradores(Conflito):
    """Inativar com gente dentro deixaria colaboradores sem empresa válida para
    lançar consumo — o erro só apareceria no fechamento do mês."""

    codigo = "empresa_com_colaboradores"
    mensagem = "Há colaboradores ativos nesta empresa. Transfira-os antes."


class CodempDuplicado(Conflito):
    codigo = "codemp_duplicado"
    mensagem = "Já existe uma empresa com este código."


class DepartamentoDuplicado(Conflito):
    codigo = "departamento_duplicado"
    mensagem = "Já existe um departamento com este nome."


class CadastroDuplicado(Conflito):
    """Violação de unicidade que não caiu em nenhuma das específicas.

    Existe para o tradutor de IntegrityError ter um destino nomeado em vez de
    devolver `Conflito` cru — se este código aparecer no log, falta uma classe.
    """

    codigo = "cadastro_duplicado"
    mensagem = "Cadastro conflita com um registro existente."


class CodigoRetiradaIndisponivel(Conflito):
    """Dez colisões seguidas em 1 milhão de códigos é praticamente impossível;
    ainda assim é conflito de estado, não defeito: 409 com mensagem útil em vez
    de um 500 mudo."""

    codigo = "codigo_retirada_indisponivel"
    mensagem = "Não foi possível gerar um código de retirada. Tente novamente."
