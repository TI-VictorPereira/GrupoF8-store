"""Upload de foto de produto: valida antes de chamar o storage de verdade.

Os testes nunca tocam o Vercel Blob de verdade — `blob.enviar` é substituído,
porque isto é teste da validação e do encaixe com o módulo, não do serviço
externo (que nem tem como ser testado aqui sem uma conta real).
"""

import pytest

from app.core import blob
from app.excecoes import (
    ArquivoGrandeDemais,
    FalhaNoEnvioDeArquivo,
    SemPermissao,
    TipoDeArquivoInvalido,
)
from app.modules import produtos
from app.modules.auditoria import Ator

ADMIN = Ator(id=None, codigo="admin-teste", nome="Admin", papel="admin")
COMUM = Ator(id=None, codigo="comum-teste", nome="Comum", papel="colaborador")


def test_colaborador_comum_nao_envia_foto():
    with pytest.raises(SemPermissao):
        produtos.enviar_foto(COMUM, "foto.jpg", b"conteudo", "image/jpeg")


def test_recusa_tipo_de_arquivo_fora_da_lista():
    with pytest.raises(TipoDeArquivoInvalido):
        produtos.enviar_foto(ADMIN, "arquivo.pdf", b"conteudo", "application/pdf")


def test_recusa_arquivo_maior_que_5mb():
    grande = b"x" * (produtos.TAMANHO_MAXIMO_DA_FOTO + 1)
    with pytest.raises(ArquivoGrandeDemais):
        produtos.enviar_foto(ADMIN, "foto.jpg", grande, "image/jpeg")


def test_upload_valido_devolve_a_url_do_storage(monkeypatch):
    url_esperada = "https://exemplo.blob.vercel-storage.com/produtos/x.jpg"
    monkeypatch.setattr(blob, "enviar", lambda nome, conteudo: url_esperada)

    url = produtos.enviar_foto(ADMIN, "foto.jpg", b"conteudo", "image/jpeg")

    assert url == url_esperada


def test_falha_do_storage_vira_erro_da_aplicacao(monkeypatch):
    def _falha(nome, conteudo):
        raise blob.FalhaNoUploadDeArquivo("Vercel Blob recusou o upload (500): erro interno")

    monkeypatch.setattr(blob, "enviar", _falha)

    with pytest.raises(FalhaNoEnvioDeArquivo):
        produtos.enviar_foto(ADMIN, "foto.jpg", b"conteudo", "image/jpeg")
