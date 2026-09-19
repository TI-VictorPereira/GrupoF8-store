"""Garantias sobre o catálogo de erros.
"""

import re
from pathlib import Path

import pytest

from app import excecoes
from app.excecoes.base import Conflito, DadosInvalidos, ErroDaAplicacao, NaoEncontrado

BASES = {ErroDaAplicacao, NaoEncontrado, Conflito, DadosInvalidos}


def _concretas() -> list[type[ErroDaAplicacao]]:
    return [
        obj
        for nome in excecoes.__all__
        if isinstance(obj := getattr(excecoes, nome), type)
        and issubclass(obj, ErroDaAplicacao)
        and obj not in BASES
    ]


def test_cada_erro_tem_codigo_proprio():
    por_codigo: dict[str, list[str]] = {}
    for classe in _concretas():
        por_codigo.setdefault(classe.codigo, []).append(classe.__name__)

    repetidos = {codigo: nomes for codigo, nomes in por_codigo.items() if len(nomes) > 1}
    assert not repetidos, f"código reaproveitado por mais de uma exceção: {repetidos}"


def test_erro_concreto_nao_herda_codigo_da_base():
    """Esquecer o `codigo` faz a classe nova responder 'conflito' e ninguém nota."""
    genericos = {base.codigo for base in BASES}
    herdados = [c.__name__ for c in _concretas() if c.codigo in genericos]

    assert not herdados, f"classes sem codigo próprio: {herdados}"


@pytest.mark.parametrize("modulo", sorted(Path("app/modules").rglob("*.py")), ids=str)
def test_modulo_nao_levanta_erro_generico(modulo: Path):
    """As bases existem para herdar, não para levantar.

    `raise Conflito("...")` devolve o código "conflito" para qualquer coisa: o
    front não consegue distinguir "empresa tem colaboradores" de "solicitação
    já tratada" e acaba decidindo pelo texto da mensagem.
    """
    generico = re.compile(r"raise (NaoEncontrado|Conflito|DadosInvalidos)\b")
    achados = [
        f"{modulo}:{n}: {linha.strip()}"
        for n, linha in enumerate(modulo.read_text(encoding="utf-8").splitlines(), 1)
        if generico.search(linha)
    ]

    assert not achados, "crie a classe específica em excecoes/:\n" + "\n".join(achados)
