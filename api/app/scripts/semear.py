"""Popula o banco de desenvolvimento com o mínimo para usar o sistema.

Rodar com:  docker compose run --rm api python -m app.scripts.semear

É idempotente: rodar de novo não duplica nada. As senhas são sorteadas e
mostradas uma única vez, como no reset feito pelo admin — não existe senha
padrão escrita no código, nem aqui.

NÃO usar em produção: a carga inicial de verdade é a importação por planilha,
com os códigos de parceiro reais do Sankhya.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.core import seguranca
from app.core.config import obter_config
from app.core.db import FabricaDeSessao
from app.models.cadastro import (
    CategoriaProduto,
    Colaborador,
    Departamento,
    Empresa,
    PrecoAlmoco,
    Produto,
)

CATEGORIAS = ["Energético", "Refrigerante", "Água", "Picolé"]

PRODUTOS = [
    # nome, código, categoria, custo, venda, estoque
    ("Energético 250ml", "ENE250", "Energético", "4.20", "8.00", 24),
    ("Refrigerante lata", "REF350", "Refrigerante", "2.10", "4.50", 48),
    ("Água com gás 500ml", "AGU500", "Água", "1.30", "3.00", 36),
    ("Picolé de fruta", "PIC001", "Picolé", "1.80", "4.00", 20),
]

PESSOAS = [
    # nome, código, codparc, matrícula, papel
    ("Administrador F8", "1000", 1000, 1000, "admin"),
    ("Refeitório F8", "2000", 2000, 2000, "refeitorio"),
    ("Colaborador de Teste", "3000", 3000, 3000, "colaborador"),
]


def _obter_ou_criar(sessao, modelo, filtro, **campos):
    existente = sessao.scalar(select(modelo).filter_by(**filtro))
    if existente:
        return existente, False
    novo = modelo(**{**filtro, **campos})
    sessao.add(novo)
    sessao.flush()
    return novo, True


def semear() -> None:
    config = obter_config()
    if config.ambiente == "producao":
        raise SystemExit("Recusado: este script não roda em produção.")

    senhas: dict[str, str] = {}

    with FabricaDeSessao() as s:
        empresa, _ = _obter_ou_criar(s, Empresa, {"codemp": 1}, nome="Grupo F8")

        departamentos = {}
        for nome in ["Administrativo", "Produção", "Logística"]:
            dep, _ = _obter_ou_criar(s, Departamento, {"nome": nome})
            departamentos[nome] = dep

        categorias = {}
        for nome in CATEGORIAS:
            cat, _ = _obter_ou_criar(s, CategoriaProduto, {"nome": nome})
            categorias[nome] = cat

        for nome, codigo, categoria, custo, venda, estoque in PRODUTOS:
            _obter_ou_criar(
                s,
                Produto,
                {"codigo": codigo},
                nome=nome,
                categoria_id=categorias[categoria].id,
                custo=Decimal(custo),
                preco_venda=Decimal(venda),
                estoque=estoque,
            )

        # Almoço sem valor por enquanto — a pendência S3 (desconto em folha)
        # ainda está aberta. A vigência já existe para quando o valor chegar.
        if not s.scalar(select(PrecoAlmoco)):
            s.add(
                PrecoAlmoco(valor=Decimal("0.00"), vigencia_inicio=date(date.today().year, 1, 1))
            )

        for nome, codigo, codparc, matricula, papel in PESSOAS:
            pessoa = s.scalar(select(Colaborador).where(Colaborador.codigo == codigo))
            if pessoa:
                continue
            senha = seguranca.gerar_senha_temporaria()
            senhas[codigo] = senha
            s.add(
                Colaborador(
                    nome_completo=nome,
                    codigo=codigo,
                    codparc=codparc,
                    vinculo="clt",
                    matricula=matricula,
                    empresa_id=empresa.id,
                    papel=papel,
                    departamento_id=departamentos["Administrativo"].id,
                    ativo=True,
                    senha_hash=seguranca.gerar_hash(senha),
                    # Provisória: o primeiro acesso obriga a troca, igual ao
                    # fluxo real de reset feito pelo admin.
                    senha_provisoria=True,
                    sessao_versao=0,
                )
            )

        s.commit()

    print()
    print("Banco de desenvolvimento pronto.")
    print(f"  empresa      : Grupo F8 (codemp 1)")
    print(f"  produtos     : {len(PRODUTOS)} itens com estoque")
    print()
    if senhas:
        print("  Senhas provisórias — anote, elas não aparecem de novo:")
        for nome, codigo, *_ , papel in PESSOAS:
            if codigo in senhas:
                print(f"    {papel:<12} código {codigo}   senha {senhas[codigo]}")
        print()
        print("  No primeiro login o sistema exige a troca da senha.")
    else:
        print("  Os usuários já existiam; nenhuma senha foi alterada.")
        print("  Para gerar outra, use o reset de senha pelo admin.")
    print()


if __name__ == "__main__":
    semear()
