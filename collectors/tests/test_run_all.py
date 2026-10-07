from base import Collector
from run_all import run_collectors


class Ok(Collector):
    name = "ok"

    def collect(self, conn, http):
        return 1


class Boom(Collector):
    name = "boom"

    def collect(self, conn, http):
        raise RuntimeError("x")


def test_falha_de_um_coletor_nao_impede_os_demais(db_conn):
    failures = run_collectors([Boom(), Ok()], conn=db_conn, http=object())
    assert failures == 1
    with db_conn.cursor() as cur:
        cur.execute("SELECT coletor, status FROM coleta_logs ORDER BY id")
        assert cur.fetchall() == [("boom", "erro"), ("ok", "sucesso")]
