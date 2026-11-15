"""Servidor da tela Obras: campos novos, resumo (avanço real × previsto, farol, atrasos, equipe, NR) e permissões."""
import sys, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from comum import token
B = "http://127.0.0.1:8900/api"; ok = falhas = 0
def check(n, c, x=""):
    global ok, falhas
    if c: ok += 1; print("OK   ", n)
    else: falhas += 1; print("FALHA", n, x)
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
adm = requests.Session()
adm.post(B+"/cadastro", json={"empresa": {"nome": "Rawtech"}, "admin": {"nome": "Wendell Xavier", "email": "obras@rawtech.test", "senha": "senha-forte-1"},
    "equipe": [{"nome": "João Paulo", "cargo": "Encarregado", "perfil": "encarregado", "email": "jp.obras@rawtech.test"},
               {"nome": "David", "cargo": "Eletricista", "perfil": "funcionario", "email": "david.obras@rawtech.test"},
               {"nome": "Paulo Melo", "cargo": "Engenheiro eletricista", "perfil": "funcionario"}]})
adm.post(B+"/confirmar-email", json={"token": token("obras@rawtech.test", "confirmar")}); adm.post(B+"/entrar", json={"email": "obras@rawtech.test", "senha": "senha-forte-1"})
jp = requests.Session(); jp.post(B+"/convites/aceitar", json={"token": token("jp.obras@rawtech.test", "convite"), "senha": "senha-do-jp-1"})
dv = requests.Session(); dv.post(B+"/convites/aceitar", json={"token": token("david.obras@rawtech.test", "convite"), "senha": "senha-do-dv-1"})
f = {x["nome"]: x["id"] for x in adm.get(B+"/funcionarios").json()["funcionarios"]}
eu = adm.get(B+"/eu").json()["usuario"]

# ── campos novos ──
novo = {"codigo": "ELE-014", "nome": "Subestação 13,8 kV", "cliente": "Metalúrgica Nordeste", "numero_contrato": "PC 4500123", "tipo_servico": "Elétrica",
        "local_obra": "Recife/PE", "gestor_id": eu["id"], "rt_funcionario_id": f["Paulo Melo"], "art_numero": "PE2026001", "situacao": "Em andamento",
        "inicio": D(-20), "fim": D(60), "valor_contrato": 480000, "cor": "#2563eb"}
r = adm.post(B+"/projetos", json=novo); p1 = r.json().get("id"); check("Cria obra com os campos novos", r.status_code == 200, r.text)
r = adm.post(B+"/projetos", json={**novo, "nome": "Outra"}); check("Código repetido recusado", r.status_code == 409)
r = adm.post(B+"/projetos", json={**novo, "codigo": "X-1", "inicio": D(10), "fim": D(5)}); check("Fim antes do início recusado", r.status_code == 400)
r = adm.post(B+"/projetos", json={**novo, "codigo": "X-2", "rt_funcionario_id": 999999}); check("Responsável técnico de fora recusado", r.status_code == 404)
lista = {p["id"]: p for p in adm.get(B+"/projetos").json()["projetos"]}
check("Campos gravados (contrato, tipo, RT, ART) e nome do gestor preenchido", lista[p1]["numero_contrato"] == "PC 4500123" and lista[p1]["tipo_servico"] == "Elétrica"
      and lista[p1]["rt_funcionario_id"] == f["Paulo Melo"] and lista[p1]["art_numero"] == "PE2026001" and lista[p1]["gestor_nome"] == "Wendell Xavier", lista[p1])

# atividades: 3 folhas com pesos; uma vencida
for d, resp, i, fi, av, sit, peso in [("Levantamento", "David", D(-20), D(-10), 100, "Concluído", 1), ("Montagem de painéis", "David", D(-9), D(-1), 20, "Em andamento", 2),
                                      ("Comissionamento", "João Paulo", D(30), D(60), 0, "Pendente", 1)]:
    adm.post(B+"/atividades", json={"projeto_id": p1, "descricao": d, "responsavel_id": f[resp], "inicio": i, "fim": fi, "avanco": av, "situacao": sit, "peso": peso})
p2 = adm.post(B+"/projetos", json={"codigo": "SPDA-3", "nome": "SPDA", "situacao": "Pausado", "inicio": D(-40), "fim": D(-5)}).json()["id"]
p3 = adm.post(B+"/projetos", json={"codigo": "ATR-1", "nome": "Obra vencida", "situacao": "Em andamento", "inicio": D(-60), "fim": D(-2)}).json()["id"]
adm.post(B+"/atividades", json={"projeto_id": p3, "descricao": "Única", "inicio": D(-60), "fim": D(-2), "avanco": 90, "situacao": "Em andamento"})

r = adm.get(B+"/obras/resumo"); R = {o["id"]: o for o in r.json()["obras"]}
o = R[p1]
check("Avanço real ponderado pelo peso", o["avanco_real"] == 35.0, o["avanco_real"])          # (100*1 + 20*2 + 0*1)/4
check("Avanço previsto pelas datas", o["avanco_previsto"] == 75.0, o["avanco_previsto"])      # (1*1 + 1*2 + 0*1)/4
check("Farol vermelho com 40 pontos de diferença", o["farol"] == "vermelho" and o["desvio"] == 40.0, (o["farol"], o["desvio"]))
check("Conta atividades atrasadas", o["atrasadas"] == 1, o["atrasadas"])
check("Conta pessoas na obra", o["pessoas"] == 2, o["pessoas"])
check("Traz RT, ART, contrato e gestor", o["rt_nome"] == "Paulo Melo" and o["gestor"] == "Wendell Xavier" and o["valor_contrato"] is not None)
check("Obra pausada sem farol", R[p2]["farol"] is None)
check("Prazo final vencido = vermelho", R[p3]["farol"] == "vermelho")

# linha de base: previsto segue a linha de base quando existe
import subprocess
ids = {a["descricao"]: a["id"] for a in adm.get(B+"/atividades").json()["atividades"]}
sql = (f"INSERT INTO linhas_base (empresa_id, projeto_id, numero, nome) SELECT empresa_id, id, 0, 'Original' FROM projetos WHERE id={p1};"
       f"INSERT INTO linha_base_itens (linha_base_id, atividade_id, inicio, fim, peso) SELECT LAST_INSERT_ID(), id, '{D(-20)}', '{D(100)}', 1 FROM atividades WHERE projeto_id={p1};")
subprocess.run(["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-e", sql], check=True)
o = {x["id"]: x for x in adm.get(B+"/obras/resumo").json()["obras"]}[p1]
check("Com linha de base, previsto usa as datas e pesos dela", o["avanco_previsto"] == 17.4 and o["farol"] == "verde", (o["avanco_previsto"], o["farol"]))  # 21/121 dias

# NR: documento vencido de quem trabalha na obra
subprocess.run(["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-e",
    f"INSERT INTO documentos_funcionario (empresa_id, funcionario_id, tipo_documento_id, emissao, validade) SELECT empresa_id, {f['David']}, (SELECT id FROM tipos_documento WHERE prazo_origem='validade_no_documento' LIMIT 1), '{D(-400)}', '{D(-3)}' FROM funcionarios WHERE id={f['David']};"], check=True)
o = {x["id"]: x for x in adm.get(B+"/obras/resumo").json()["obras"]}[p1]
check("Pessoa com NR vencida aparece na obra", o["nr_vencidos"] == 1, (o["nr_vencidos"], o["nr_vencendo"]))

# permissões
r = jp.get(B+"/obras/resumo"); check("Encarregado sem obra vinculada não vê nenhuma", r.status_code == 200 and r.json()["obras"] == [], r.text)
id_jp = next(x["id"] for x in adm.get(B+"/usuarios").json()["usuarios"] if x["nome"] == "João Paulo")
adm.post(B+f"/projetos/{p1}/membros", json={"usuario_id": id_jp, "papel": "encarregado"})
r = jp.get(B+"/obras/resumo"); obs = r.json()["obras"]
check("Encarregado vê só a obra dele, sem valores", len(obs) == 1 and "valor_contrato" not in obs[0] and "numero_contrato" not in obs[0], obs)
check("Funcionário não usa a tela Obras", dv.get(B+"/obras/resumo").status_code == 403)
check("Encarregado não cria obra", jp.post(B+"/projetos", json={"nome": "x"}).status_code == 403)
check("Lista de usuários só para gestão", jp.get(B+"/usuarios").status_code == 403 and len(adm.get(B+"/usuarios").json()["usuarios"]) == 3)
print(f"RESULTADO: {ok} ok, {falhas} falhas")
