"""Servidor do cronograma: calendário (dias úteis, feriados, sábado meio dia), dependências que empurram, simulação,
etapas, caminho crítico, encadear, linha de base com motivo, calendários do gestor e permissões."""
import sys, requests
sys.path.insert(0, "/home/claude/telas"); from comum import token
B = "http://127.0.0.1:8900/api"; ok = falhas = 0
def check(n, c, x=""):
    global ok, falhas
    if c: ok += 1; print("OK   ", n)
    else: falhas += 1; print("FALHA", n, x)
adm = requests.Session()
adm.post(B+"/cadastro", json={"empresa": {"nome": "Rawtech"}, "admin": {"nome": "Wendell Xavier", "email": "crono@rawtech.test", "senha": "senha-forte-1"},
    "equipe": [{"nome": "Paulo Melo", "cargo": "Engenheiro", "perfil": "gestor", "email": "paulo.crono@rawtech.test"},
               {"nome": "João Paulo", "cargo": "Encarregado", "perfil": "encarregado", "email": "jp.crono@rawtech.test"},
               {"nome": "David", "cargo": "Eletricista", "perfil": "funcionario", "email": "dv.crono@rawtech.test"}]})
adm.post(B+"/confirmar-email", json={"token": token("crono@rawtech.test", "confirmar")}); adm.post(B+"/entrar", json={"email": "crono@rawtech.test", "senha": "senha-forte-1"})
ses = {}
for nome, em in [("paulo", "paulo.crono@rawtech.test"), ("jp", "jp.crono@rawtech.test"), ("dv", "dv.crono@rawtech.test")]:
    s = requests.Session(); s.post(B+"/convites/aceitar", json={"token": token(em, "convite"), "senha": "senha-" + nome + "-123"}); ses[nome] = s
pid = adm.post(B+"/projetos", json={"codigo": "CR-1", "nome": "Cronograma", "situacao": "Em andamento", "inicio": "2027-03-01", "fim": "2027-06-30"}).json()["id"]
pcal = adm.post(B+"/projetos", json={"codigo": "CR-0", "nome": "Testes do calendário"}).json()["id"]
def nova(alvo=None, **k):
    r = adm.post(B+"/atividades", json={"projeto_id": alvo or pid, **k}); return r.json()
def A(id): return next(a for a in adm.get(B+f"/obras/{pid}/cronograma").json()["atividades"] if a["id"] == id)

# ── calendário padrão: dias úteis e feriados nacionais ──
r = nova(descricao="A", inicio="2027-03-01", duracao_dias=5); a = r["id"]
check("5 dias úteis: seg 01/03 → sex 05/03", r["fim"] == "2027-03-05", r)
check("6 dias úteis pula o fim de semana", nova(pcal, descricao="t1", inicio="2027-03-01", duracao_dias=6)["fim"] == "2027-03-08")
check("Pula Tiradentes (21/04/2027)", nova(pcal, descricao="t2", inicio="2027-04-19", duracao_dias=5)["fim"] == "2027-04-26")
check("Pula a Sexta-feira Santa (26/03/2027)", nova(pcal, descricao="t3", inicio="2027-03-25", duracao_dias=2)["fim"] == "2027-03-29")
check("Fim digitado calcula a duração", float(nova(pcal, descricao="t4", inicio="2027-03-01", fim="2027-03-12")["duracao_dias"]) == 10.0)
check("Marco (0 dia) fica no próprio dia útil", nova(pcal, descricao="t5", inicio="2027-03-06", duracao_dias=0)["fim"] == "2027-03-08")

# ── dependências empurram ──
b = nova(descricao="B", inicio="2027-03-01", duracao_dias=3)["id"]
r = adm.post(B+"/dependencias", json={"antes_id": a, "depois_id": b})
check("Ligar A → B empurra B para depois de A", r.status_code == 200 and A(b)["inicio"] == "2027-03-08" and A(b)["fim"] == "2027-03-10", (r.text, A(b)))
check("Resposta conta quem foi empurrado", [m["id"] for m in r.json()["movidas"]] == [b])
check("Ciclo recusado (B → A)", adm.post(B+"/dependencias", json={"antes_id": b, "depois_id": a}).status_code == 400)
check("Ligação repetida recusada", adm.post(B+"/dependencias", json={"antes_id": a, "depois_id": b}).status_code == 409)
r = adm.post(B+f"/obras/{pid}/simular", json={"atividade_id": a, "duracao_dias": 7}).json()
check("Simular: mostra que B iria para 10/03 sem salvar", r["movidas"] and r["movidas"][0]["inicio"] == "2027-03-10" and A(b)["inicio"] == "2027-03-08", r)
r = adm.patch(B+f"/atividades/{a}", json={"duracao_dias": 7}).json()
check("Mudar a duração de A salva e empurra B", r["fim"] == "2027-03-09" and A(b)["inicio"] == "2027-03-10" and r["movidas"][0]["id"] == b, r)
c = nova(descricao="C", inicio="2027-03-01", duracao_dias=2)["id"]
d = adm.post(B+"/dependencias", json={"antes_id": b, "depois_id": c, "folga_dias": 2}).json()
check("Folga de 2 dias úteis depois de B", A(c)["inicio"] == "2027-03-17", A(c))
e = nova(descricao="E", inicio="2027-03-01", duracao_dias=1)["id"]
adm.post(B+"/dependencias", json={"antes_id": a, "depois_id": e, "tipo": "CC", "folga_dias": 1})
check("Início→início com folga 1", A(e)["inicio"] == "2027-03-02")
cron = adm.get(B+f"/obras/{pid}/cronograma").json()
check("Predecessoras escritas (2+2d, 1CC+1d)", A(c)["predecessoras"].endswith("+2d") and "CC+1d" in A(e)["predecessoras"], (A(c)["predecessoras"], A(e)["predecessoras"]))
check("Caminho crítico: A, B e C; E não", A(a)["critica"] and A(b)["critica"] and A(c)["critica"] and not A(e)["critica"])
# atividade concluída não é empurrada
f = nova(descricao="F concluída", inicio="2027-03-01", duracao_dias=2, avanco=100, situacao="Concluído")["id"]
adm.post(B+"/dependencias", json={"antes_id": a, "depois_id": f}); check("Concluída não é empurrada", A(f)["inicio"] == "2027-03-01")

# ── etapas ──
et = nova(descricao="Etapa 1", inicio="2027-03-01", duracao_dias=1)["id"]
adm.patch(B+f"/atividades/{a}", json={"pai_id": et}); adm.patch(B+f"/atividades/{b}", json={"pai_id": et, "peso": 3}); adm.patch(B+f"/atividades/{a}", json={"avanco": 100})
x = A(et); check("Etapa vai do início da 1ª ao fim da última filha", x["etapa"] and x["inicio"] == "2027-03-01" and x["fim"] == "2027-03-12", x)
check("Avanço da etapa pela média ponderada (100×1 + 0×3)/4 = 25", x["avanco"] == 25, x["avanco"])
check("EAP numerada (1.1 dentro da etapa)", A(a)["eap"].endswith(".1") and A(a)["nivel"] == 1, A(a)["eap"])
check("Etapa não pode ser ela mesma", adm.patch(B+f"/atividades/{et}", json={"pai_id": et}).status_code == 400)

# ── encadear ──
i1, i2, i3 = [nova(descricao=f"Seq {k}", inicio="2027-05-03", duracao_dias=2)["id"] for k in (1, 2, 3)]
r = adm.post(B+f"/obras/{pid}/encadear", json={"ids": [i1, i2, i3]}).json()
check("Encadear cria 2 ligações em sequência", r["ligacoes"] == 2 and A(i2)["inicio"] == "2027-05-05" and A(i3)["inicio"] == "2027-05-07", (r, A(i2), A(i3)))

# ── linha de base ──
check("Primeira linha de base sem motivo (Original)", adm.post(B+f"/obras/{pid}/linhas-base", json={}).json().get("numero") == 0)
check("Reprogramação sem motivo é recusada", adm.post(B+f"/obras/{pid}/linhas-base", json={}).status_code == 400)
check("Reprogramação com motivo", adm.post(B+f"/obras/{pid}/linhas-base", json={"motivo": "Chuva atrasou a base"}).json().get("numero") == 1)
lb = adm.get(B+f"/obras/{pid}/linhas-base").json()["linhas_base"]
check("Lista as linhas de base com quem aprovou", len(lb) == 2 and lb[1]["motivo"] == "Chuva atrasou a base" and lb[1]["aprovada_por_nome"] == "Wendell Xavier")
check("Cronograma traz a linha de base atual", str(a) in {str(k) for k in adm.get(B+f"/obras/{pid}/cronograma").json()["linha_base"]["itens"]})

# ── calendários do gestor ──
r = adm.post(B+"/calendarios", json={"nome": "Com sábado", "horas_semana": [8, 8, 8, 8, 8, 4, 0], "feriados_nacionais": True,
                                     "dias": [{"inicio": "2027-03-03", "nome": "Chuva", "tipo": "parado"}]})
cal = r.json()["id"]; check("Gestor cria calendário", r.status_code == 200)
p2 = adm.post(B+"/projetos", json={"codigo": "CR-2", "nome": "Com sábado"}).json()["id"]
adm.patch(B+f"/projetos/{p2}", json={"calendario_id": cal})
r = adm.post(B+"/atividades", json={"projeto_id": p2, "descricao": "S", "inicio": "2027-03-01", "duracao_dias": 5.5}).json()
check("Sábado de 4 h conta meio dia e o dia parado não conta", r["fim"] == "2027-03-08", r)   # seg, ter, (qua parado), qui, sex, sáb ½, seg
s_id = r["id"]
adm.patch(B+f"/calendarios/{cal}", json={"dias": []})
A2 = next(x for x in adm.get(B+f"/obras/{p2}/cronograma").json()["atividades"] if x["id"] == s_id)
check("Mudar o calendário recalcula as obras que usam", A2["fim"] == "2027-03-06", A2)
check("Calendário em uso não pode ser apagado", adm.delete(B+f"/calendarios/{cal}").status_code == 409)
l = adm.get(B+"/calendarios").json()
check("Lista calendários com obras e feriados nacionais", l["calendarios"][0]["obras"][0]["codigo"] == "CR-2" and len(l["feriados_nacionais"]) >= 18)
check("Outro gestor não edita o calendário de quem criou", ses["paulo"].patch(B+f"/calendarios/{cal}", json={"nome": "x"}).status_code == 403)
check("Horas inválidas recusadas", adm.post(B+"/calendarios", json={"nome": "x", "horas_semana": [0, 0, 0, 0, 0, 0, 0]}).status_code == 400)

# ── permissões ──
check("Encarregado não liga atividades", ses["jp"].post(B+"/dependencias", json={"antes_id": i1, "depois_id": i3}).status_code == 403)
check("Encarregado não salva linha de base", ses["jp"].post(B+f"/obras/{pid}/linhas-base", json={"motivo": "x"}).status_code == 403)
check("Funcionário não abre o cronograma da obra", ses["dv"].get(B+f"/obras/{pid}/cronograma").status_code == 403)
check("Encarregado fora da obra não vê o cronograma", ses["jp"].get(B+f"/obras/{pid}/cronograma").status_code == 404)

# ── excluir leva subatividades e ligações ──
r = adm.delete(B+f"/atividades/{et}").json()
check("Excluir etapa leva as filhas", r["excluidas"] == 3, r)
ids = {x["id"] for x in adm.get(B+f"/obras/{pid}/cronograma").json()["atividades"]}
check("…e as ligações delas (C ficou sem predecessora)", a not in ids and A(c)["predecessoras"] == "", A(c))
# ── equipe da obra, membros e itens da linha de base ──
id_jp = next(x["id"] for x in adm.get(B+"/usuarios").json()["usuarios"] if x["nome"] == "João Paulo")
adm.post(B+f"/projetos/{pid}/membros", json={"usuario_id": id_jp, "papel": "encarregado"})
eq = adm.get(B+f"/obras/{pid}/equipe").json()
check("Equipe da obra traz membros e capacidade", any(m["nome"] == "João Paulo" for m in eq["membros"]) and eq["capacidade_14"] > 0)
mid = next(m["id"] for m in eq["membros"] if m["nome"] == "João Paulo")
check("Encarregado (agora membro) vê a equipe, mas não tira acesso", ses["jp"].get(B+f"/obras/{pid}/equipe").status_code == 200 and ses["jp"].delete(B+f"/membros/{mid}").status_code == 403)
check("Gestor tira o acesso", adm.delete(B+f"/membros/{mid}").status_code == 200 and ses["jp"].get(B+f"/obras/{pid}/equipe").status_code == 404)
lb0 = adm.get(B+f"/obras/{pid}/linhas-base").json()["linhas_base"][0]
check("Itens de uma linha de base para comparar", len(adm.get(B+f"/linhas-base/{lb0['id']}").json()["itens"]) > 0 and lb0["nome"] == "Original")
check("Histórico da obra", len(adm.get(B+f"/obras/{pid}/historico").json()["historico"]) > 10)
print(f"RESULTADO: {ok} ok, {falhas} falhas")
