"""Dados para a tela Relatórios: os do RDO (ELE-014 + NR12-007, avanços, fotos, Travou, recursos, RDOs) + histórico de avanço
das semanas anteriores (para a curva S e o "feito no período" terem o que mostrar)."""
import sys, subprocess, datetime as dt
sys.path.insert(0, "/home/claude/telas"); from dados_rdo import montar as montar_rdo
SQL = ["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-N", "-e"]
def q(s): return subprocess.run(SQL + [s], capture_output=True, text=True, check=True).stdout.strip()
def montar():
    pid, p2, ids, R, rd = montar_rdo()
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
    folhas = q(f"SELECT a.id, a.inicio, a.avanco, (SELECT MIN(de_avanco) FROM avancos v WHERE v.atividade_id = a.id) FROM atividades a WHERE a.projeto_id = {pid} AND a.excluido_em IS NULL "
               f"AND NOT EXISTS (SELECT 1 FROM atividades x WHERE x.pai_id = a.id AND x.excluido_em IS NULL) AND a.inicio < '{hoje}'")
    for l in folhas.splitlines():
        aid, ini, av, de = l.split("\t"); alvo = int(de) if de != "NULL" else int(av)
        if alvo <= 0: continue
        d0 = max(dt.date.fromisoformat(ini), hoje - dt.timedelta(days=40)); dias = [d0 + dt.timedelta(days=k) for k in range((hoje - d0).days) if (d0 + dt.timedelta(days=k)).weekday() < 5]
        if not dias: continue
        passos = dias[::max(1, len(dias) // 4)][:4]; ant = 0
        for i, d in enumerate(passos):
            para = round(alvo * (i + 1) / len(passos))
            q(f"INSERT INTO avancos (empresa_id, atividade_id, usuario_id, de_avanco, para_avanco, comentario, criado_em) SELECT empresa_id, id, 1, {ant}, {para}, NULL, '{d} 18:30:00' FROM atividades WHERE id = {aid}"); ant = para
    return pid, p2, ids, R, rd
if __name__ == "__main__": print(montar())
