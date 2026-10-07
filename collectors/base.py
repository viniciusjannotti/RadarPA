"""Infraestrutura comum: HTTP educado (UA, rate limit, retry), conexão e log de coleta."""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
import psycopg2

import config

log = logging.getLogger("radarpa")

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class HttpClient:
    """Cliente HTTP com user-agent identificado, intervalo mínimo e retry com backoff."""

    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | None = None,
        min_interval: float = config.MIN_INTERVAL_SECONDS,
        max_retries: int = config.MAX_RETRIES,
        backoff_base: float = config.BACKOFF_BASE_SECONDS,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
        allowed_hosts: set[str] | None = None,
    ):
        hosts = config.ALLOWED_HOSTS if allowed_hosts is None else allowed_hosts

        def check_host(request: httpx.Request) -> None:
            # Também vale para redirects: não seguimos para fora das fontes conhecidas.
            if hosts and request.url.host not in hosts:
                raise httpx.UnsupportedProtocol(f"host não permitido: {request.url.host}")

        self._client = httpx.Client(
            transport=transport,
            headers={"User-Agent": config.USER_AGENT},
            timeout=config.TIMEOUT_SECONDS,
            follow_redirects=True,
            event_hooks={"request": [check_host]},
        )
        self._min_interval = min_interval
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        self._sleep = sleep
        self._monotonic = monotonic
        self._last_request: float | None = None

    def _wait_turn(self) -> None:
        if self._last_request is not None:
            elapsed = self._monotonic() - self._last_request
            if elapsed < self._min_interval:
                self._sleep(self._min_interval - elapsed)

    def get(self, url: str) -> httpx.Response:
        attempt = 0
        while True:
            self._wait_turn()
            try:
                try:
                    resp = self._client.get(url)
                finally:
                    # Intervalo contado a partir do fim da requisição (servidor lento não encurta a pausa).
                    self._last_request = self._monotonic()
                if resp.status_code in RETRYABLE_STATUS and attempt < self._max_retries:
                    raise _Retryable(f"HTTP {resp.status_code}", _retry_after(resp))
                resp.raise_for_status()
                return resp
            except (_Retryable, httpx.TransportError) as exc:
                if attempt >= self._max_retries or isinstance(exc, httpx.UnsupportedProtocol):
                    raise
                delay = self._backoff_base * (2**attempt)
                if isinstance(exc, _Retryable) and exc.retry_after is not None:
                    delay = max(delay, exc.retry_after)
                log.warning("falha em %s (%s); nova tentativa em %.0fs", url, exc, delay)
                self._sleep(delay)
                attempt += 1

    def close(self) -> None:
        self._client.close()


class _Retryable(Exception):
    def __init__(self, msg: str, retry_after: float | None = None):
        super().__init__(msg)
        self.retry_after = retry_after


MAX_RETRY_AFTER_SECONDS = 300.0


def _retry_after(resp: httpx.Response) -> float | None:
    value = resp.headers.get("Retry-After", "")
    if value.isdigit():
        return min(float(value), MAX_RETRY_AFTER_SECONDS)
    return None


def normalize_database_url(url: str) -> str:
    """Remove o parâmetro `schema` (específico do Prisma), que o libpq rejeita."""
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != "schema"]
    return urlunsplit(parts._replace(query=urlencode(query)))


def connect(url: str | None = None):
    return psycopg2.connect(normalize_database_url(url or config.database_url()))


class Collector(ABC):
    """Um coletor: busca uma fonte, faz upsert e registra a execução em `coleta_logs`."""

    name: str
    # Preenchidos por `collect` quando parte da coleta falhou mas dados foram gravados.
    parcial: bool = False
    detalhes: str | None = None

    @abstractmethod
    def collect(self, conn, http: HttpClient) -> int:
        """Executa a coleta e devolve o número de registros gravados."""

    def run(self, conn, http: HttpClient | None) -> int:
        inicio = datetime.now(timezone.utc)
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO coleta_logs (coletor, inicio, status) "
                "VALUES (%s, %s, 'executando') RETURNING id",
                (self.name, inicio),
            )
            (log_id,) = cur.fetchone()
        conn.commit()

        try:
            registros = self.collect(conn, http)
            conn.commit()
        except Exception as exc:
            conn.rollback()
            self._finish(conn, log_id, "erro", 0, erro=f"{type(exc).__name__}: {exc}")
            log.exception("coletor %s falhou", self.name)
            raise

        status = "parcial" if self.parcial else "sucesso"
        self._finish(conn, log_id, status, registros, detalhes=self.detalhes)
        log.info("coletor %s: %d registros (%s)", self.name, registros, status)
        return registros

    @staticmethod
    def _finish(
        conn,
        log_id: int,
        status: str,
        registros: int,
        erro: str | None = None,
        detalhes: str | None = None,
    ):
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE coleta_logs SET fim = %s, status = %s, registros = %s, erro = %s, "
                "detalhes = %s WHERE id = %s",
                (datetime.now(timezone.utc), status, registros, erro, detalhes, log_id),
            )
        conn.commit()
