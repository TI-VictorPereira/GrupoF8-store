"""Hash de senha e emissão de token."""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import obter_config

_config = obter_config()

# Padrões da biblioteca: argon2id, com custo já adequado.
# Em teste o custo cai para o mínimo — ver `senha_hash_rapido` na configuração.
_hasher = (
    PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)
    if _config.senha_hash_rapido
    else PasswordHasher()
)

# Hash descartável, usado para gastar o mesmo tempo quando o código não existe.
# Sem isso, uma resposta rápida denuncia que o código não está cadastrado — e o
# sistema fica exposto na internet com códigos numéricos, fáceis de varrer.
_HASH_FALSO = _hasher.hash("senha-que-nao-existe")

TipoToken = Literal["acesso", "refresh"]


# Sem caracteres ambíguos: 0/O, 1/l/I, 5/S, 2/Z. A senha temporária costuma ser
# ditada por telefone ou copiada de um papel — confundir um caractere custa uma
# ligação a mais para o admin.
_ALFABETO_TEMPORARIA = "ABCDEFGHJKMNPQRTUVWXY346789"


def gerar_hash(senha: str) -> str:
    return _hasher.hash(senha)


def gerar_senha_temporaria() -> str:
    """Senha aleatória em grupos legíveis, no formato XXXX-XXXX.

    `secrets` e não `random`: o segundo é previsível e não serve para nada que
    proteja acesso.
    """
    import secrets

    bruto = "".join(secrets.choice(_ALFABETO_TEMPORARIA) for _ in range(8))
    return f"{bruto[:4]}-{bruto[4:]}"


def conferir_senha(hash_armazenado: str | None, senha: str) -> bool:
    """Devolve True/False. Nunca levanta exceção por senha errada."""
    alvo = hash_armazenado or _HASH_FALSO
    try:
        _hasher.verify(alvo, senha)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return hash_armazenado is not None


def gastar_tempo_de_conferencia() -> None:
    """Chamado quando o código não existe, para o tempo de resposta não variar."""
    conferir_senha(None, "qualquer-coisa")


def precisa_rehash(hash_armazenado: str) -> bool:
    try:
        return _hasher.check_needs_rehash(hash_armazenado)
    except InvalidHashError:
        return True


def criar_token(
    colaborador_id: uuid.UUID, papel: str, tipo: TipoToken, sessao_versao: int
) -> str:
    agora = datetime.now(timezone.utc)
    if tipo == "acesso":
        expira = agora + timedelta(minutes=_config.acesso_expira_minutos)
    else:
        expira = agora + timedelta(hours=_config.refresh_expira_horas)

    return jwt.encode(
        {
            "sub": str(colaborador_id),
            "papel": papel,
            "tipo": tipo,
            "sv": sessao_versao,
            "iat": agora,
            "exp": expira,
            "jti": str(uuid.uuid4()),
        },
        _config.jwt_secret,
        algorithm=_config.jwt_algoritmo,
    )


def ler_token(token: str, tipo_esperado: TipoToken) -> dict | None:
    """Devolve o payload, ou None se o token for inválido, expirado ou do tipo errado."""
    try:
        dados = jwt.decode(token, _config.jwt_secret, algorithms=[_config.jwt_algoritmo])
    except jwt.PyJWTError:
        return None
    if dados.get("tipo") != tipo_esperado:
        return None
    return dados


def agora_em_segundos() -> datetime:
    """Instante atual truncado no segundo.

    O `iat` do JWT só tem precisão de segundo. Guardar o corte de sessão com
    microssegundos faria o token recém-emitido parecer anterior ao próprio
    corte, e a sessão cairia no mesmo instante em que foi criada.
    """
    return datetime.now(timezone.utc).replace(microsecond=0)


def token_de_sessao_cortada(dados: dict, sessao_versao: int) -> bool:
    """Compara exato. Token sem a versão é de antes desta regra e não vale."""
    return dados.get("sv") != sessao_versao
