"""Teste de carga do almoço, contra a API local. NUNCA apontar para produção.

Cenário do horário de pico: todo mundo entra, gera o código, e a tela fica
consultando a cada 5 s até o refeitório ler. Um posto lê os códigos conforme
chegam e o painel do balcão atualiza a cada 15 s.

    pip install locust
    docker compose run --rm api python -m app.scripts.semear_carga 150
    locust -f api/carga/locustfile.py --host http://localhost:8801 \
        -u 150 -r 10 -t 3m --headless --csv carga

Sem --headless abre a tela em http://localhost:8089. Os 150 usuários de
colaborador são distribuídos um por CARGA-0001..; o posto usa CARGA-REF.
Um almoço por pessoa por dia: para repetir o teste, rode --limpar e semeie de novo.
"""

import itertools
import os
import queue

import requests
from locust import HttpUser, between, events, task

SENHA = "carga-Teste-123"
_numeros = itertools.count(1)
_codigos_para_ler: queue.Queue[str] = queue.Queue()


# Preview da Vercel ligado a uma branch do Neon: CARGA_PREVIEW=https://<preview>.vercel.app
# e --host <preview>/api. O domínio de produção (grupo-f8-store*) é sempre recusado.
# Se o preview tem Vercel Authentication, passe CARGA_BYPASS=<segredo de bypass>.
PREVIEW = os.environ.get("CARGA_PREVIEW", "").rstrip("/")
BYPASS = os.environ.get("CARGA_BYPASS", "")


@events.test_start.add_listener
def _checar_host(environment, **_):
    host = (environment.host or "").rstrip("/")
    local = "localhost" in host or "127.0.0.1" in host
    preview = bool(PREVIEW) and host == f"{PREVIEW}/api"
    # Produção só com o banco trocado para a branch de homologação (ver o teste abaixo).
    producao = "grupo-f8-store" in host and os.environ.get("CARGA_PRODUCAO") == "SIM"
    if not (local or preview or producao):
        raise SystemExit(
            "Recusado: só localhost, o preview de CARGA_PREVIEW, ou produção com "
            "CARGA_PRODUCAO=SIM e o DATABASE_URL apontando para a branch de homologação."
        )
    if producao:
        # Os CARGA-* só existem na branch. Se este login falha, o servidor ainda lê o
        # banco real: abortar antes que 150 falhas bloqueiem o IP dos colaboradores.
        r = requests.post(
            f"{host}/auth/login", json={"codigo": "CARGA-0001", "senha": SENHA}, timeout=30
        )
        if r.status_code != 200:
            raise SystemExit(
                f"Abortado: login de CARGA-0001 deu {r.status_code}. O servidor não está "
                "lendo a branch de homologação (troque o DATABASE_URL e reimplante)."
            )


class _Logado(HttpUser):
    abstract = True

    def entrar(self, codigo: str) -> None:
        # x-forwarded-for único: o limite por IP conta só erros, mas assim o teste
        # se parece com aparelhos diferentes, não com uma rede só.
        self.client.headers["x-forwarded-for"] = f"198.51.100.{hash(codigo) % 250 + 1}"
        if BYPASS:
            self.client.headers["x-vercel-protection-bypass"] = BYPASS
        self.client.post("/auth/login", json={"codigo": codigo, "senha": SENHA}, name="/auth/login")


class Colaborador(_Logado):
    weight = 20
    wait_time = between(5, 5)  # o polling real da tela é de 5 s

    def on_start(self):
        self.entrar(f"CARGA-{next(_numeros):04d}")
        self.client.get("/auth/eu", name="/auth/eu")
        self.client.get("/almocos/meu-hoje", name="/almocos/meu-hoje")
        with self.client.post("/almocos/gerar", name="/almocos/gerar", catch_response=True) as r:
            if r.status_code in (200, 201):
                _codigos_para_ler.put(r.json()["codigo_barras"])
            else:
                r.failure(f"{r.status_code} {r.text[:120]}")

    @task
    def aguardar_leitura(self):
        self.client.get("/almocos/meu-hoje", name="/almocos/meu-hoje")


class Refeitorio(_Logado):
    weight = 1
    wait_time = between(0.5, 1.5)  # um posto lê cerca de um código por segundo

    def on_start(self):
        self.entrar("CARGA-REF")

    @task(10)
    def ler_codigo(self):
        try:
            codigo = _codigos_para_ler.get_nowait()
        except queue.Empty:
            return
        self.client.post(
            "/almocos/confirmar", json={"codigo_barras": codigo}, name="/almocos/confirmar"
        )

    @task(1)
    def painel(self):
        self.client.get("/almocos/hoje", name="/almocos/hoje")
