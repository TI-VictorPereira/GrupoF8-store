"""Termo de uso + tratamento de dados (LGPD), aceitos juntos.

O texto vive aqui, versionado por código — não numa tela editável por admin.
Mudar o texto é mudar este arquivo e subir uma versão nova de `VERSAO_ATUAL`;
quem já aceitou a versão anterior vê a barreira de novo no próximo login.

A versão aceita fica gravada em `colaboradores.termos_versao`, não o texto
inteiro: o Git já guarda cada versão que existiu, e é isso que permite provar
depois qual texto uma pessoa aceitou numa data específica.

⚠️ O texto abaixo é um rascunho em linguagem simples, escrito para destravar o
desenvolvimento — não é parecer jurídico. Antes de valer para produção de
verdade, alguém que entenda de LGPD na empresa precisa revisar e aprovar a
redação, em especial a parte de tratamento de dados pessoais.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.cadastro import Colaborador
from app.modules import auditoria
from app.modules.auditoria import Ator

# Formato livre, só precisa mudar sempre que o texto mudar de verdade.
VERSAO_ATUAL = "2026-09-26"


@dataclass
class Secao:
    titulo: str
    paragrafos: list[str]

SECOES: list[Secao] = [
    Secao(
        titulo="Termo de uso",
        paragrafos=[
            "Este sistema é de uso interno da empresa, para consumo na loja e no "
            "refeitório e para acompanhar seu próprio consumo. O acesso é pessoal e "
            "intransferível — a senha não deve ser compartilhada.",
            "O valor consumido é descontado em folha, conforme a política já vigente na "
            "empresa. O ciclo de apuração vai do dia 21 ao dia 20 do mês seguinte.",
        ],
    ),
    Secao(
        titulo="Tratamento de dados pessoais (LGPD)",
        paragrafos=[
            "Para operar o sistema, tratamos os seguintes dados seus: nome, código de "
            "acesso, vínculo empregatício, departamento, mês de aniversário (usado "
            "somente para o benefício de aniversário) e o histórico do que você comprou "
            "na loja ou consumiu no refeitório.",
            "Esses dados são usados para: liberar seu acesso, calcular o desconto em "
            "folha, e gerar os relatórios que a empresa envia ao sistema de folha de "
            "pagamento (Sankhya). Não compartilhamos esses dados com terceiros fora "
            "desse propósito.",
            "Ao continuar, você confirma que leu e concorda com o uso do sistema e com "
            "o tratamento dos seus dados pessoais descrito acima.",
        ],
    ),
]


def pendente(colaborador: Colaborador) -> bool:
    return colaborador.termos_versao != VERSAO_ATUAL


def aceitar(sessao: Session, ator: Ator) -> Colaborador:
    """Registra o aceite da versão atual. Aceitar de novo a mesma versão não
    grava nada a mais — só a mudança de versão é que interessa auditar."""
    colaborador = sessao.get(Colaborador, ator.id)
    assert colaborador is not None  # o ator já veio autenticado desta linha

    se_ja_estava = colaborador.termos_versao
    if se_ja_estava == VERSAO_ATUAL:
        return colaborador

    colaborador.termos_versao = VERSAO_ATUAL
    colaborador.termos_aceitos_em = datetime.now(UTC)

    auditoria.registrar(
        sessao,
        ator,
        acao="colaborador.termos_aceitos",
        entidade="colaborador",
        entidade_id=colaborador.id,
        descricao=f"Aceitou os termos de uso, versão {VERSAO_ATUAL}.",
        dados_anteriores={"termos_versao": se_ja_estava},
        dados_novos={"termos_versao": VERSAO_ATUAL},
    )
    return colaborador
