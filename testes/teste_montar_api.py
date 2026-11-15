"""Montar o cronograma: modelos, salvar como modelo, copiar de outra obra, colar/CSV/Excel/MS Project e exportar."""
import sys, io, base64, zipfile, requests
sys.path.insert(0, "/home/claude/telas"); from comum import token
B = "http://127.0.0.1:8900/api"; ok = falhas = 0
def check(n, c, x=""):
    global ok, falhas
    if c: ok += 1; print("OK   ", n)
    else: falhas += 1; print("FALHA", n, x)
adm = requests.Session()
adm.post(B+"/cadastro", json={"empresa": {"nome": "Rawtech"}, "admin": {"nome": "Wendell Xavier", "email": "montar@rawtech.test", "senha": "senha-forte-1"},
    "equipe": [{"nome": "Ana Ribeiro", "cargo": "Engenheira eletricista", "perfil": "gestor", "email": "ana.m@rawtech.test"},
               {"nome": "Bruno Costa", "cargo": "Encarregado", "perfil": "encarregado", "email": "bruno.m@rawtech.test"},
               {"nome": "Carla Mendes", "cargo": "Eletricista", "perfil": "funcionario"}, {"nome": "Diego Alves", "cargo": "Eletricista", "perfil": "funcionario"}]})
adm.post(B+"/confirmar-email", json={"token": token("montar@rawtech.test", "confirmar")}); adm.post(B+"/entrar", json={"email": "montar@rawtech.test", "senha": "senha-forte-1"})
enc = requests.Session(); enc.post(B+"/convites/aceitar", json={"token": token("bruno.m@rawtech.test", "convite"), "senha": "senha-bruno-1"})
obra = lambda cod: adm.post(B+"/projetos", json={"codigo": cod, "nome": "Obra " + cod, "situacao": "Em andamento", "inicio": "2027-03-01", "fim": "2027-07-30"}).json()["id"]
cron = lambda pid: adm.get(B+f"/obras/{pid}/cronograma").json()
p1, p2, p3, p4 = obra("M-1"), obra("M-2"), obra("M-3"), obra("M-4")

# ── modelos ──
ms = adm.get(B+"/modelos").json()["modelos"]
check("5 modelos do Task Flow", len([m for m in ms if m["origem"] == "Modelo Task Flow"]) == 5)
r = adm.post(B+f"/obras/{p1}/aplicar-modelo", json={"modelo": "tf-subestacao", "previa": True}).json()
check("Prévia do modelo (17 linhas, 4 etapas, ligações)", r["atividades"] == 17 and sum(1 for x in r["previa"] if x["etapa"]) == 4 and r["ligacoes"] >= 12, r.get("atividades"))
r = adm.post(B+f"/obras/{p1}/aplicar-modelo", json={"modelo": "tf-subestacao", "inicio": "2027-03-01", "por_cargo": True}).json()
c = cron(p1); A = {a["descricao"]: a for a in c["atividades"]}
check("Aplica o modelo com etapas e ligações", r["atividades"] == 17 and len(c["dependencias"]) == r["ligacoes"] and A["Infraestrutura"]["etapa"])
check("Datas encadeadas pelas ligações", A["Integração e treinamentos (NR-10, NR-35)"]["inicio"] == "2027-03-04" and A["Energização"]["marco"], A["Integração e treinamentos (NR-10, NR-35)"]["inicio"])
check("Responsável pelo cargo quando só há uma pessoa (Encarregado → Bruno)", A["Mobilização de equipe e canteiro"]["responsavel_nome"] == "Bruno Costa")
check("Com dois eletricistas, não escolhe ninguém", A["Eletrodutos, eletrocalhas e caixas de passagem"]["responsavel_nome"] is None)
r = adm.post(B+f"/obras/{p1}/salvar-modelo", json={"nome": "Subestação Rawtech"}).json(); mid = r["id"]
mod = next(m for m in adm.get(B+"/modelos").json()["modelos"] if m["id"] == mid)
check("Obra vira modelo da empresa", mod["origem"] == "Criado da obra M-1" and mod["atividades"] == 13, mod["atividades"])
r = adm.post(B+f"/obras/{p2}/aplicar-modelo", json={"modelo": mid, "inicio": "2027-04-05"}).json()
check("Modelo da empresa aplica igual", r["atividades"] == 17 and r["ligacoes"] == len(cron(p1)["dependencias"]))
check("Encarregado não aplica modelo", enc.post(B+f"/obras/{p2}/aplicar-modelo", json={"modelo": "tf-spda"}).status_code == 403)

# ── copiar de outra obra ──
r = adm.post(B+f"/obras/{p3}/copiar", json={"origem_id": p1, "inicio": "2027-05-03"}).json()
c3 = cron(p3); c1 = cron(p1)
check("Copia a obra inteira", r["atividades"] == 17 and len(c3["dependencias"]) == len(c1["dependencias"]))
check("Datas deslocadas para o novo início", c3["atividades"][0]["inicio"] == "2027-05-03", c3["atividades"][0]["inicio"])
check("Copia sem o avanço (tudo pendente)", all(a["avanco"] == 0 for a in c3["atividades"]))
inf = next(a["id"] for a in c1["atividades"] if a["descricao"] == "Comissionamento")
r = adm.post(B+f"/obras/{p3}/copiar", json={"origem_id": p1, "etapas": [inf], "inicio": "2027-06-01"}).json()
check("Copia só uma etapa (acrescenta no fim)", r["atividades"] == 4 and len(cron(p3)["atividades"]) == 21)
check("Não copia de si mesma", adm.post(B+f"/obras/{p3}/copiar", json={"origem_id": p3}).status_code == 400)

# ── colar do Excel / CSV ──
tsv = "EAP\tAtividade\tDuração\tInício\tResponsável\tPredecessoras\n1\tPreparação\t\t\t\t\n1.1\tConferência de materiais\t2\t01/03/2027\tAna Ribeiro\t\n1.2\tIntegração\t1\t\t\t1.1\n2\tExecução\t\t\t\t\n2.1\tMontagem\t5\t\tBruno Costa\t1.2\n2.2\tTestes\t16h\t\t\t2.1CC+2"
r = adm.post(B+f"/obras/{p4}/importar", json={"formato": "linhas", "conteudo": tsv, "previa": True}).json()
check("Colar: prévia reconhece cabeçalho, níveis e ligações", r["atividades"] == 6 and r["ligacoes"] == 3 and [x["nivel"] for x in r["previa"]] == [0, 1, 1, 0, 1, 1], r)
r = adm.post(B+f"/obras/{p4}/importar", json={"formato": "linhas", "conteudo": tsv}).json(); A = {a["descricao"]: a for a in cron(p4)["atividades"]}
check("Colar cria com responsáveis pelo nome e horas viram dias", A["Montagem"]["responsavel_nome"] == "Bruno Costa" and A["Testes"]["duracao_dias"] == 2.0 and A["Montagem"]["inicio"] == "2027-03-04", (A["Montagem"]["inicio"], A["Testes"]["duracao_dias"]))
check("Ligação início→início com folga do texto", "CC+2d" in A["Testes"]["predecessoras"], A["Testes"]["predecessoras"])
csv = "Atividade;Duração;Predecessoras\nPintura;3;\nLimpeza;1;1"
r = adm.post(B+f"/obras/{p4}/importar", json={"formato": "csv", "conteudo": csv, "substituir": True}).json()
check("CSV com ; e substituir o cronograma", r["atividades"] == 2 and len(cron(p4)["atividades"]) == 2 and r["ligacoes"] == 1)

# ── exportar e importar de volta ──
x = adm.get(B+f"/obras/{p1}/exportar?formato=xlsx")
z = zipfile.ZipFile(io.BytesIO(x.content)); sh = z.read("xl/worksheets/sheet1.xml").decode()
check("Exporta .xlsx válido com as atividades", x.status_code == 200 and "spreadsheetml" in x.headers["Content-Type"] and "Malha de aterramento" in sh and "attachment" in x.headers["Content-Disposition"])
r = adm.post(B+f"/obras/{p4}/importar", json={"formato": "xlsx", "conteudo": base64.b64encode(x.content).decode(), "substituir": True, "previa": True}).json()
check("Importa o próprio .xlsx (17 linhas, ligações, níveis)", r["atividades"] == 17 and r["ligacoes"] == len(cron(p1)["dependencias"]) and r["previa"][1]["nivel"] == 1, (r.get("atividades"), r.get("ligacoes")))
x = adm.get(B+f"/obras/{p1}/exportar?formato=mspdi")
check("Exporta MS Project (.xml)", x.status_code == 200 and "<Project" in x.text and x.text.count("<Task>") == 17 and "<PredecessorLink>" in x.text)
r = adm.post(B+f"/obras/{p4}/importar", json={"formato": "mspdi", "conteudo": x.text, "substituir": True}).json(); c4 = cron(p4)
check("Importa do MS Project com datas, níveis e ligações", r["atividades"] == 17 and len(c4["dependencias"]) == len(cron(p1)["dependencias"]) and c4["atividades"][0]["inicio"] == cron(p1)["atividades"][0]["inicio"], (r, c4["atividades"][0]["inicio"]))
check("Arquivo que não é do Project é recusado", adm.post(B+f"/obras/{p4}/importar", json={"formato": "mspdi", "conteudo": "<x/>"}).status_code == 400)
adm.post(B+f"/projetos/{p1}/membros", json={"usuario_id": next(u["id"] for u in adm.get(B+"/usuarios").json()["usuarios"] if u["nome"] == "Bruno Costa"), "papel": "encarregado"})
check("Encarregado da obra pode exportar, não importar", enc.get(B+f"/obras/{p1}/exportar?formato=xlsx").status_code == 200 and enc.post(B+f"/obras/{p1}/importar", json={"formato": "csv", "conteudo": "A;1"}).status_code == 403)
check("Apaga modelo da empresa", adm.delete(B+f"/modelos/{mid}").status_code == 200 and not any(m["id"] == mid for m in adm.get(B+"/modelos").json()["modelos"]))
print(f"RESULTADO: {ok} ok, {falhas} falhas")
