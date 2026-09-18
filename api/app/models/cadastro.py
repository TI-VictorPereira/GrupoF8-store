"""Cadastros: departamentos, categorias, colaboradores, produtos, preço do almoço."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, criado_em, dinheiro, fk_uuid, pk_uuid

PAPEIS = ("colaborador", "refeitorio", "admin")
VINCULOS = ("clt", "pj")


class Empresa(Base):
    """Empresa do grupo, espelhando o cadastro do Sankhya.

    `codemp` decide em qual empresa a despesa é lançada. Antes isto era um campo
    de texto livre no colaborador — um acento trocado mandava o lançamento para
    a empresa errada, sem erro nenhum aparecer.
    """

    __tablename__ = "empresas"

    id: Mapped[uuid.UUID] = pk_uuid()
    codemp: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    criado_em: Mapped[datetime] = criado_em()


class Departamento(Base):
    __tablename__ = "departamentos"

    id: Mapped[uuid.UUID] = pk_uuid()
    nome: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)


class CategoriaProduto(Base):
    __tablename__ = "categorias_produto"

    id: Mapped[uuid.UUID] = pk_uuid()
    nome: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)


class Colaborador(Base):
    """Todo colaborador tem `codparc` — é o que identifica a pessoa no Sankhya.
    Só o CLT tem, além disso, `matricula`; o PJ não tem nenhuma.

    `codigo` é coisa separada: a credencial de login, criada pelo admin junto
    com a senha provisória. Não tem relação com o ERP.

    `codparc` é obrigatório: ninguém entra no sistema sem estar cadastrado como
    parceiro no Sankhya. Isso garante que toda competência fecha sem pendência
    de identificação, ao custo de o cadastro no ERP ter de vir antes do acesso.
    """

    __tablename__ = "colaboradores"
    __table_args__ = (
        CheckConstraint(f"papel in {PAPEIS}", name="papel_valido"),
        CheckConstraint(f"vinculo in {VINCULOS}", name="vinculo_valido"),
        CheckConstraint(
            "(vinculo = 'clt' and matricula is not null) or "
            "(vinculo = 'pj' and matricula is null)",
            name="matricula_conforme_vinculo",
        ),
        # A matrícula repete entre empresas — no Sankhya ela só é única dentro
        # de uma. NULL não colide com NULL, então vários PJ convivem aqui.
        UniqueConstraint("empresa_id", "matricula", name="uq_colaboradores_empresa_matricula"),
        Index("ix_colaboradores_ativo_nome", "ativo", "nome_completo"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    nome_completo: Mapped[str] = mapped_column(String(160), nullable=False)

    # credencial de login
    codigo: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)

    # identificação no Sankhya
    codparc: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    vinculo: Mapped[str] = mapped_column(String(10), nullable=False, server_default="clt")
    matricula: Mapped[int | None] = mapped_column(Integer, nullable=True)
    empresa_id: Mapped[uuid.UUID] = fk_uuid("empresas.id")

    papel: Mapped[str] = mapped_column(String(20), nullable=False, server_default="colaborador")
    departamento_id: Mapped[uuid.UUID | None] = fk_uuid("departamentos.id", obrigatorio=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    senha_provisoria: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # A temporária deixa de valer sozinha: papel com senha anotada não pode
    # continuar sendo credencial válida semanas depois do reset.
    senha_provisoria_expira_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Corte de sessão. O token carrega a versão com que foi emitido; qualquer
    # divergência o invalida. Resetar a senha, trocar a senha ou inativar o
    # acesso incrementam este número e derrubam tudo que estava aberto.
    #
    # É contador e não data de propósito: o `iat` do JWT só tem precisão de
    # segundo, então um corte por timestamp deixa passar todo token emitido
    # dentro do mesmo segundo — justamente a sessão que se quer expulsar.
    # `default` além do `server_default`: o default do banco só vale no INSERT,
    # então um objeto recém-construído teria None aqui e o incremento estouraria
    # antes de chegar ao banco.
    sessao_versao: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    criado_em: Mapped[datetime] = criado_em()
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Produto(Base):
    __tablename__ = "produtos"
    __table_args__ = (
        CheckConstraint("estoque >= 0", name="estoque_nao_negativo"),
    )

    id: Mapped[uuid.UUID] = pk_uuid()
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    codigo: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    categoria_id: Mapped[uuid.UUID | None] = fk_uuid("categorias_produto.id", obrigatorio=False)
    custo: Mapped[Decimal] = dinheiro()
    preco_venda: Mapped[Decimal] = dinheiro()
    estoque: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # URL do objeto no R2. Nunca base64 — no protótipo a imagem inteira ficava
    # na coluna e era trafegada em toda listagem da loja.
    foto_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    criado_em: Mapped[datetime] = criado_em()


class PrecoAlmoco(Base):
    """Preço com vigência: a exportação de um mês usa o preço vigente naquele
    mês, não o atual."""

    __tablename__ = "precos_almoco"

    id: Mapped[uuid.UUID] = pk_uuid()
    valor: Mapped[Decimal] = dinheiro()
    vigencia_inicio: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    vigencia_fim: Mapped[date | None] = mapped_column(Date, nullable=True)
    criado_em: Mapped[datetime] = criado_em()
    criado_por: Mapped[uuid.UUID | None] = fk_uuid("colaboradores.id", obrigatorio=False)
