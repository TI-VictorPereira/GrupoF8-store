"""Erros de autenticação e autorização.

Cuidado ao acrescentar erros aqui: distinguir "código não existe" de "senha
errada" na RESPOSTA entrega a lista de códigos válidos a quem varre. Por isso
as duas situações levantam a mesma `CredenciaisInvalidas`, com o mesmo código e
a mesma mensagem.

A distinção existe, mas fica em `log_acesso.motivo` — visível para quem
investiga, invisível para quem ataca.
"""

from app.excecoes.base import ErroDaAplicacao


class NaoAutenticado(ErroDaAplicacao):
    status = 401
    codigo = "nao_autenticado"
    mensagem = "Sessão expirada ou inválida."


class CredenciaisInvalidas(ErroDaAplicacao):
    status = 401
    codigo = "credenciais_invalidas"
    mensagem = "Código ou senha inválidos."


class AcessoBloqueado(ErroDaAplicacao):
    status = 429
    codigo = "acesso_bloqueado"
    mensagem = "Muitas tentativas. Aguarde alguns minutos e tente novamente."


class ColaboradorInativo(ErroDaAplicacao):
    status = 401
    codigo = "colaborador_inativo"
    mensagem = "Acesso inativo. Procure o RH ou o administrador."


class SemPermissao(ErroDaAplicacao):
    status = 403
    codigo = "sem_permissao"
    mensagem = "Sem permissão para esta operação."


class SenhaProvisoriaExpirada(ErroDaAplicacao):
    status = 401
    codigo = "senha_provisoria_expirada"
    mensagem = "A senha temporária expirou. Peça uma nova ao administrador."


class SenhaProvisoriaPendente(ErroDaAplicacao):
    status = 403
    codigo = "senha_provisoria_pendente"
    mensagem = "Troque a senha provisória antes de continuar."


class SenhaAtualIncorreta(ErroDaAplicacao):
    status = 400
    codigo = "senha_atual_incorreta"
    mensagem = "Senha atual incorreta."


class SenhaFraca(ErroDaAplicacao):
    status = 400
    codigo = "senha_fraca"
    mensagem = "A senha não atende ao tamanho mínimo."


class SenhaRepetida(ErroDaAplicacao):
    status = 400
    codigo = "senha_repetida"
    mensagem = "A senha nova precisa ser diferente da atual."
