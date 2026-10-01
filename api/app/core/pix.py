"""Geração de payload Pix (BR Code) e QR Code para venda a visitante.

Sem integração com banco ou PSP: aqui só se monta o payload EMV que o app do
banco lê pra abrir a transferência já com valor e recebedor certos. Confirmar
que o pagamento realmente caiu é sempre manual — ver `pedidos.confirmar_pix`.
"""

import base64
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO

import qrcode

from app.core.config import obter_config


class PixNaoConfigurado(Exception):
    """Falta PIX_CHAVE, PIX_RECEBEDOR ou PIX_CIDADE no ambiente."""


@dataclass
class PixGerado:
    valor: Decimal
    txid: str
    copia_cola: str
    qr_code_base64: str


def _normalizar(texto: str) -> str:
    """Sem acento e em caixa alta — é o que o padrão BR Code exige pro nome
    do recebedor e pra cidade."""
    sem_acento = unicodedata.normalize("NFD", texto)
    sem_acento = "".join(c for c in sem_acento if unicodedata.category(c) != "Mn")
    return sem_acento.upper().strip()


def _tlv(id_campo: str, valor: str) -> str:
    return f"{id_campo}{len(valor):02d}{valor}"


def _crc16(payload: str) -> str:
    """CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, sem reflexão."""
    crc = 0xFFFF
    for caractere in payload:
        crc ^= ord(caractere) << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def _payload(chave: str, recebedor: str, cidade: str, valor: Decimal, txid: str) -> str:
    conta_do_recebedor = _tlv("00", "br.gov.bcb.pix") + _tlv("01", chave)
    dados_adicionais = _tlv("05", txid)

    corpo = (
        _tlv("00", "01")
        + _tlv("26", conta_do_recebedor)
        + _tlv("52", "0000")
        + _tlv("53", "986")
        + _tlv("54", f"{valor:.2f}")
        + _tlv("58", "BR")
        + _tlv("59", _normalizar(recebedor)[:25])
        + _tlv("60", _normalizar(cidade)[:15])
        + _tlv("62", dados_adicionais)
        + "6304"
    )
    return corpo + _crc16(corpo)


def gerar(valor: Decimal, txid: str) -> PixGerado:
    config = obter_config()
    if not (config.pix_chave and config.pix_recebedor and config.pix_cidade):
        raise PixNaoConfigurado()

    copia_cola = _payload(config.pix_chave, config.pix_recebedor, config.pix_cidade, valor, txid)

    buffer = BytesIO()
    qrcode.make(copia_cola).save(buffer, format="PNG")
    qr_code_base64 = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

    return PixGerado(valor=valor, txid=txid, copia_cola=copia_cola, qr_code_base64=qr_code_base64)
