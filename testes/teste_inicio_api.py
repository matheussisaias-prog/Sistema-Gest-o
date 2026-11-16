"""Início · gestão à vista (servidor): só a gestão; números do dia; farol de cada obra (real, previsto, desvio, término,
cor); atrasos e Travou abertos; RDO pendente; NR vencida/faltando de quem está alocado; agenda dos 7 dias (começa,
termina, ausência, conflito de recurso, devolução de locação); liberado em todos os planos; isolamento."""
import sys, json, subprocess, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from dados_rel import montar
from comum import token
A = "http://127.0.0.1:8900/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
SQL = ["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-N", "-e"]
def q(s): return subprocess.run(SQL + [s], capture_output=True, text=True, check=True).stdout.strip()
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
pid, p2, ids, R, rd = montar()
def sessao(e, s):
    x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026"); ana = sessao("ana@rawtech.com.br", "Ana-Ribeiro-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026"); car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
check("Encarregado e funcionário não abrem o Início", enc.get(A+"/inicio").status_code == 403 and car.get(A+"/inicio").status_code == 403)
# dados extras: atividade que começa e termina na semana, ausência, NR exigida, conflito de recurso
d0 = D(1) if hoje.weekday() < 4 else D(7 - hoje.weekday())
adm.patch(A+f"/atividades/{ids['e1']}", json={"inicio": d0, "duracao_dias": 1})
fc = int(q("SELECT id FROM funcionarios WHERE nome = 'Carla Mendes'"))
q(f"INSERT INTO ausencias (empresa_id, funcionario_id, tipo, inicio, fim) VALUES (1, {fc}, 'Folga', '{D(2)}', '{D(2)}')")
T = {t["nome"]: t["id"] for t in adm.get(A+"/tipos-documento").json()["tipos"]}
adm.put(A+"/cargos-documentos", json={"cargo": "Eletricista", "tipos": [T["Trabalho em altura"]]})
I = ana.get(A+"/inicio").json(); k = I["indicadores"]
check("Gestora abre: saudação, empresa e números", I["usuario"] == "Ana" and I["empresa"] == "Rawtech Engenharia" and k["obras"] == 2 and k["verde"] + k["amarelo"] + k["vermelho"] <= 2)
O = {o["codigo"]: o for o in I["obras"]}
check("Farol: cada obra com real, previsto, desvio, término e cor", set(O) == {"ELE-014", "NR12-007"} and all(o["farol"] in ("verde", "amarelo", "vermelho", "cinza") and o["termino"] and o["real"] is not None for o in O.values()))
check("Atrasadas e vermelhas primeiro no farol", [o["farol"] for o in I["obras"]] == sorted([o["farol"] for o in I["obras"]], key=["vermelho", "amarelo", "verde", "cinza"].index))
tv = [a for a in I["atrasos"] if a["tipo"] == "travou"]; at = [a for a in I["atrasos"] if a["tipo"] == "atraso"]
check("Travou aberto com motivo, responsável e obra", len(tv) == k["travou"] == 1 and tv[0]["atividade"] == "Malha de aterramento" and tv[0]["responsavel"] == "Carla Mendes" and tv[0]["obra"] == "ELE-014")
check("Atrasada com dias de atraso e responsável", len(at) == k["atrasadas"] and any(a["atividade"] == "Levantamento de campo e as-built" and a["dias"] > 0 and a["responsavel"] for a in at))
check("Atividade travada não aparece duas vezes", not any(a["atividade_id"] == tv[0]["atividade_id"] for a in at))
check("RDO pendente (rascunho, fechado, entregue sem folha, dias sem RDO)", {"rasc", "fech", "entr", "sem"} <= {p["tipo"] for p in I["pendencias"]} and k["sem_rdo"] == len([p for p in I["pendencias"] if p["tipo"] == "sem"]))
check("NR faltando de quem está alocado", any(v["pessoa"] == "Carla Mendes" and "ELE-014" in v["obras"] for v in I["documentos"]) and k["nr_vencida"] >= 1, I["documentos"])
G = {x["data"]: x["itens"] for x in I["agenda"]}
check("Agenda: 7 dias a partir de hoje", list(G)[0] == D(0) and len(G) == 7)
check("Agenda: começa e termina", any(i["tipo"] == "comeca" and i["atividade_id"] == ids["e1"] for i in G.get(d0, [])) and any(i["tipo"] == "termina" for L in G.values() for i in L))
check("Agenda: ausência", any(i["tipo"] == "ausencia" and "Carla Mendes" in i["texto"] for i in G[D(2)]))
check("Agenda: devolução de locação", any(i["tipo"] == "devolver" and "PLT-02" in i["texto"] for L in G.values() for i in L))
m1 = int(R["MUN-01"]); nr = adm.post(A+"/atividades", json={"projeto_id": p2, "descricao": "Içamento extra", "inicio": d0, "duracao_dias": 1}).json()
nid = nr.get("id") or nr.get("atividade", {}).get("id")
adm.put(A+f"/atividades/{nid}/recursos", json={"recursos": [m1]})
G = {x["data"]: x["itens"] for x in adm.get(A+"/inicio").json()["agenda"]}
check("Agenda: conflito de recurso no dia", any(i["tipo"] == "conflito" and "MUN-01" in i["texto"] for L in G.values() for i in L), json.dumps(G, ensure_ascii=False)[:400])
q("UPDATE empresas SET plano = 'essencial' WHERE id = 1")
check("Liberado também no plano Essencial", adm.get(A+"/inicio").status_code == 200 and adm.get(A+"/empresa/plano").json()["plano"]["gestao_vista"] is True)
q("UPDATE projetos SET situacao = 'Pausado' WHERE id = %d" % p2)
I2 = adm.get(A+"/inicio").json()
check("Obra pausada aparece no farol mas não conta como em andamento", any(o["codigo"] == "NR12-007" and o["situacao"] == "Pausado" for o in I2["obras"]) and I2["indicadores"]["obras"] == 1)
o = requests.Session()
o.post(A+"/cadastro", json={"empresa": {"nome": "Outra Início"}, "admin": {"nome": "Outro Admin", "email": "ini@outra.test", "senha": "senha-forte-1"}, "equipe": []})
o.post(A+"/confirmar-email", json={"token": token("ini@outra.test", "confirmar")}); o.post(A+"/entrar", json={"email": "ini@outra.test", "senha": "senha-forte-1"})
Io = o.get(A+"/inicio").json()
check("Outra empresa: só o que é dela (vazio)", Io["obras"] == [] and Io["atrasos"] == [] and Io["pendencias"] == [] and all(not x["itens"] for x in Io["agenda"]))
print(f"RESULTADO: {ok} ok, {f} falhas"); sys.exit(1 if f else 0)
