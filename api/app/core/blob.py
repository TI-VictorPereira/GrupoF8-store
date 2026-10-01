"""Upload de arquivo pro Vercel Blob.

⚠️ Não existe SDK oficial da Vercel para Python — isto é o protocolo HTTP que
o SDK oficial em JS (`@vercel/blob`) usa por baixo, reconstruído a partir do
código-fonte publicado dele. Não é um contrato documentado pela Vercel para
uso de fora do próprio SDK, então pode mudar numa atualização deles sem
aviso nenhum. Se o upload começar a falhar do nada um dia, é aqui que se
começa a procurar — confira a versão atual do `@vercel/blob` no GitHub e
ajuste a URL, os cabeçalhos ou o formato da resposta conforme o que mudou.
"""

import mimetypes
import uuid

import httpx

from app.core.config import obter_config

_URL_API = "https://vercel.com/api/blob"


class FalhaNoUploadDeArquivo(Exception):
    """Vercel Blob recusou ou não respondeu ao upload."""


def enviar(nome_arquivo: str, conteudo: bytes) -> str:
    """Sobe um arquivo e devolve a URL pública. Nome final é aleatório —
    quem chama não escolhe o path exato, só a extensão importa."""
    config = obter_config()
    if not config.blob_read_write_token:
        raise FalhaNoUploadDeArquivo("BLOB_READ_WRITE_TOKEN não configurado.")
    if not config.blob_store_id:
        raise FalhaNoUploadDeArquivo("BLOB_STORE_ID não configurado.")

    extensao = nome_arquivo.rsplit(".", 1)[-1].lower() if "." in nome_arquivo else "bin"
    pathname = f"produtos/{uuid.uuid4()}.{extensao}"
    tipo = mimetypes.guess_type(nome_arquivo)[0] or "application/octet-stream"

    try:
        resposta = httpx.put(
            f"{_URL_API}/",
            params={"pathname": pathname},
            content=conteudo,
            headers={
                "authorization": f"Bearer {config.blob_read_write_token}",
                "x-vercel-blob-store-id": config.blob_store_id,
                "x-api-blob-request-id": str(uuid.uuid4()),
                "x-api-blob-request-attempt": "0",
                "x-api-version": "12",
                "x-vercel-blob-access": "public",
                "x-content-type": tipo,
            },
            timeout=30,
        )
    except httpx.HTTPError as erro:
        raise FalhaNoUploadDeArquivo(f"Não deu pra falar com o Vercel Blob: {erro}") from erro

    if resposta.status_code >= 400:
        raise FalhaNoUploadDeArquivo(
            f"Vercel Blob recusou o upload ({resposta.status_code}): {resposta.text[:300]}"
        )

    url = resposta.json().get("url")
    if not url:
        raise FalhaNoUploadDeArquivo(f"Resposta do Vercel Blob sem URL: {resposta.text[:300]}")
    return url
