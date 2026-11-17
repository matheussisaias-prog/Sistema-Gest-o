"""Dados para a tela de indicadores: obra do dados_rel + Travou de vários tipos (resolvidos e abertos) e um acidente antigo."""
import sys, subprocess, datetime as dt
sys.path.insert(0, "/home/claude/telas"); from dados_rel import montar as montar_rel
SQL = ["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-N", "-e"]
def q(s): return subprocess.run(SQL + [s], capture_output=True, text=True, check=True).stdout.strip()
def montar():
    pid, p2, ids, R, rd = montar_rel()
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
    ativ = q(f"SELECT id FROM atividades WHERE projeto_id = {pid} AND excluido_em IS NULL ORDER BY id LIMIT 6").split()
    L = [("Falta de material", "Cabo 25 mm² não chegou", 20, 3), ("Falta de material", "Eletroduto 2\" em falta no fornecedor", 12, 2), ("Equipamento", "Munck quebrado", 9, 1),
         ("Clima", "Chuva forte, área alagada", 6, 1), ("Pendência do cliente", "Cliente não liberou a área", 4, None), ("Outro", "Projeto sem revisão aprovada", 15, 4), ("Acidente", "Corte leve na mão, sem afastamento", 45, 0)]
    for i, (tipo, desc, dias, resolvido) in enumerate(L):
        d = hoje - dt.timedelta(days=dias); cri = f"'{d} 09:00:00'"
        res = "NULL" if resolvido is None else f"'{d + dt.timedelta(days=resolvido)} 15:00:00'"
        q(f"INSERT INTO ocorrencias (empresa_id, projeto_id, atividade_id, data, tipo, gravidade, descricao, registrada_por, resolvida_em, criado_em) VALUES (1, {pid}, {ativ[i % len(ativ)]}, '{d}', '{tipo}', 'Média', '{desc}', 1, {res}, {cri})")
    return pid, p2, ids, R, rd
