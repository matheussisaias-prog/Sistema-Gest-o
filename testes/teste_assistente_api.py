"""Assistente Mercronos (servidor): busca por frases, perfis de acesso e montar obra por perguntas."""
import sys, requests
sys.path.insert(0, "/home/claude/telas"); from dados_crono import criar
A = "http://127.0.0.1:8900/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
pid, ids = criar()
def sessao(email, senha):
    s = requests.Session(); s.post(A+"/entrar", json={"email": email, "senha": senha}); return s
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026")
fun = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
# segunda obra, onde o encarregado não está
p2 = adm.post(A+"/projetos", json={"codigo": "NR12-007", "nome": "Adequação NR-12 · Prensas", "cliente": "Metalúrgica Sul", "situacao": "Em andamento", "inicio": "2026-10-01", "fim": "2026-12-20"}).json()["id"]
adm.post(A+"/atividades", json={"projeto_id": p2, "descricao": "Apreciação de riscos das prensas", "inicio": "2026-10-01", "duracao_dias": 5, "avanco": 10, "situacao": "Em andamento"})
B = lambda s, q: s.get(A+"/assistente/buscar", params={"q": q})
rot = lambda j: [c["rotulo"] for c in j["entendi"]]

# ── busca ──
j = B(adm, "atividades atrasadas da ELE-014").json()
check("Entende atividades + atrasadas + obra pelo código", rot(j) == ["atividades", "atrasadas", "obra ELE-014"], rot(j))
check("Responde com as atrasadas da obra, com atraso em dias", j["resposta"]["tipo"] == "atividades" and j["resposta"]["total"] >= 1 and all(i["selo_cor"] == "verm" for i in j["resposta"]["itens"]))
check("Oferece abrir o cronograma filtrado", j["resposta"]["acao"]["link"] == {"tipo": "obra", "id": pid, "filtro": "atrasadas", "resp": None}, j["resposta"].get("acao"))
check("Também encontrei: a obra com o farol", j["tambem"] and j["tambem"][0]["link"] == {"tipo": "obra", "id": pid} and "Farol" in j["tambem"][0]["info"])
check("Cada parte entendida diz quais palavras tirar", [c["termos"] for c in j["entendi"]] == [["atividades"], ["atrasadas"], ["ele-014"]], [c["termos"] for c in j["entendi"]])
j = B(adm, "atividads atrasdas").json()
check("Aceita erro de digitação", rot(j) == ["atividades", "atrasadas"] and j["resposta"]["total"] >= 1, rot(j))
j = B(adm, "o que a Carla tem essa semana").json()
check("Pessoa + semana: atividades da Carla nos próximos 7 dias", "Carla Mendes" in rot(j) and "de Carla" in j["resposta"]["titulo"] and "7 dias" in j["resposta"]["titulo"], j["resposta"]["titulo"])
check("Todas as atividades listadas são da Carla", j["resposta"]["itens"] and all("Carla" in i["info"] for i in j["resposta"]["itens"]))
j = B(adm, "014").json()
check("Só o número da obra: resumo da obra", j["resposta"]["tipo"] == "obra" and "ELE-014" in j["resposta"]["titulo"])
j = B(adm, "subestacao").json()
check("Nome da obra sem acento também acha", "obra ELE-014" in rot(j))
j = B(adm, "malha").json()
check("Palavra livre busca na descrição das atividades", j["resposta"]["itens"] and "Malha" in j["resposta"]["itens"][0]["titulo"])
j = B(adm, "obras em andamento").json()
check("Obras em andamento: NR12-007 e ELE-014", j["resposta"]["tipo"] == "obras" and j["resposta"]["total"] == 2, j["resposta"]["titulo"])
j = B(adm, "obras no vermelho").json()
check("Filtro de farol nas obras", j["resposta"]["tipo"] == "obras" and all(i["selo_cor"] == "verm" for i in j["resposta"]["itens"]))
j = B(adm, "equipe da ele-014").json()
check("Pessoas da obra", j["resposta"]["tipo"] == "pessoas" and j["resposta"]["total"] == 3, j["resposta"]["titulo"])
j = B(adm, "sem responsavel").json()
check("Atividades sem responsável", j["resposta"]["tipo"] == "atividades" and "sem responsável" in j["resposta"]["titulo"])
j = B(adm, "quem esta sem nr-10").json()
check("Sem NR-10: pessoas de campo sem o documento", j["resposta"]["tipo"] == "documentos" and "sem NR-10" in j["resposta"]["titulo"] and j["resposta"]["total"] >= 1, j["resposta"]["titulo"])
j = B(adm, "como salvo a linha de base?").json()
check("Pergunta de uso: marca ajuda e não inventa dados", j["ajuda"] is True and j["resposta"] is None)
j = B(adm, "").json()
check("Busca vazia não quebra", j["resposta"] is None and j["entendi"] == [])
j = B(adm, "rdo de hoje").json()
check("RDO: responde mesmo sem RDOs lançados", j["resposta"]["tipo"] == "rdos" and j["resposta"]["total"] == 0)
# perfis
j = B(enc, "obras em andamento").json()
check("Encarregado só vê a obra em que está", j["resposta"]["total"] == 1 and "ELE-014" in j["resposta"]["itens"][0]["titulo"], j["resposta"])
j = B(enc, "prensas").json()
check("Encarregado não acha atividade de obra que não é dele", not (j["resposta"] and j["resposta"]["total"]), j["resposta"])
j = B(fun, "atividades").json()
check("Funcionária só vê as próprias atividades", j["resposta"]["total"] >= 1 and all("Carla" in i["info"] for i in j["resposta"]["itens"]))
j = B(fun, "obras no vermelho").json()
check("Funcionária não recebe lista de obras", not j["resposta"] or j["resposta"]["tipo"] != "obras")
j = B(fun, "documentos vencidos").json()
check("Funcionária não vê documentos de NR dos outros", j["resposta"]["total"] == 0)
check("Sem login: 401", requests.get(A+"/assistente/buscar", params={"q": "obras"}).status_code == 401)

# ── tipos e prévia ──
check("Encarregado não monta obra (403)", enc.get(A+"/assistente/tipos").status_code == 403 and enc.post(A+"/assistente/previa", json={"tipo": "spda"}).status_code == 403)
T = adm.get(A+"/assistente/tipos").json()["tipos"]
check("6 tipos: 5 do Mercronos + genérica", [t["id"] for t in T] == ["subestacao", "iluminacao", "nr12", "spda", "qgbt", "generica"])
check("Perguntas com escolha (fator) e com número", any(p["escolha"] for t in T if "perguntas" in t for p in t["perguntas"]) and T[0]["perguntas"][0]["opcoes"] == [1, 2, 3, 4])
P = lambda d: adm.post(A+"/assistente/previa", json=d)
base = {"tipo": "subestacao", "qtd": {"n_trafos": 2, "kva": 1000, "m_cabo_mt": 350, "m_malha": 200}, "equipe": 4, "inicio": "2027-01-11"}
r = P(base).json()
check("Subestação: 12 atividades, 13 ligações, título com a potência", r["atividades"] == 12 and r["ligacoes"] == 13 and r["titulo"] == "Subestação 2 × 1.000 kVA", (r["atividades"], r["ligacoes"], r["titulo"]))
cab = [l for l in r["linhas"] if l["descricao"].startswith("Cabos de média")][0]
check("Duração pela quantidade e explicação", cab["dur"] == 5 and cab["explica"] == "350 m ÷ 70 m por dia com 4 pessoas = 5 dias", cab["explica"])
check("Começa no início pedido e tem caminho crítico", r["inicio"] == "2027-01-11" and any(l["critica"] for l in r["linhas"]))
check("Ninguém começa antes da predecessora terminar (TC)", all(l["inicio"] >= "2027-01-11" for l in r["linhas"]))
r2 = P({**base, "qtd": {**base["qtd"], "m_cabo_mt": 700}}).json()
check("Dobrar o cabo aumenta a duração e o fim", [l for l in r2["linhas"] if l["descricao"].startswith("Cabos de média")][0]["dur"] == 10 and r2["fim"] > r["fim"])
r3 = P({**base, "equipe": 8}).json()
check("Equipe maior termina antes", r3["fim"] < r["fim"])
r4 = P({**base, "escopo": ["trafo", "comiss"]}).json()
check("Tirar itens do escopo tira as atividades e mantém as ligações válidas", r4["atividades"] == 7 and all(int(x.split("CC")[0].split("+")[0] or 0) <= len(r4["linhas"]) for l in r4["linhas"] for x in l["pred"].split(";") if x), [l["pred"] for l in r4["linhas"]])
check("Sem obra civil: transformadores ligam no levantamento", [l for l in r4["linhas"] if l["descricao"].startswith("Instalação")][0]["pred"] == "4")
rp = adm.post(A+"/assistente/previa", json={**base, "prazo": "2027-02-26"}).json()
check("Prazo que não cabe: diz quantos dias úteis passou", rp["prazo"]["cabe"] is False and rp["prazo"]["dias"] == 3, rp["prazo"])
check("Sugere equipe maior e etapas em paralelo, com o ganho", [s["id"] for s in rp["sugestoes"]] == ["equipe", "paralelo"] and rp["sugestoes"][0]["ganho"] > 0 and rp["sugestoes"][0]["cabe"])
ra = P({**base, "prazo": "2027-02-26", **rp["sugestoes"][1]["aplicar"]}).json()
check("Aplicar 'em paralelo' adianta o fim pelo ganho anunciado", ra["fim"] < rp["fim"] and ra["dias_uteis"] == rp["dias_uteis"] - rp["sugestoes"][1]["ganho"], (ra["dias_uteis"], rp["dias_uteis"], rp["sugestoes"][1]["ganho"]))
rc = P({**base, "prazo": "2027-06-30"}).json()
check("Prazo folgado: cabe, com dias de folga e sem sugestões", rc["prazo"]["cabe"] and rc["prazo"]["dias"] > 0 and rc["sugestoes"] == [])
for tp, n in [("iluminacao", 9), ("nr12", 11), ("spda", 8), ("qgbt", 7)]:
    x = P({"tipo": tp, "equipe": 4, "inicio": "2027-01-11"}).json()
    check(f"{tp}: monta com as respostas padrão ({n} atividades)", x.get("atividades") == n and x["fim"] > "2027-01-11", x.get("erro") or x.get("atividades"))
il = P({"tipo": "iluminacao", "equipe": 4, "inicio": "2027-01-11", "qtd": {"altura": "Acima de 10 m"}}).json()
il0 = P({"tipo": "iluminacao", "equipe": 4, "inicio": "2027-01-11", "qtd": {"altura": "Até 6 m"}}).json()
check("Iluminação: luminária mais alta leva mais tempo", il["fim"] > il0["fim"])
ilm = [l for l in il["linhas"] if l["descricao"].startswith("Medição")][0]
check("Medição só depois da montagem e dos circuitos (sem ligação perdida)", "9" in ilm["pred"].split(";") and "8" in ilm["pred"].split(";"), ilm["pred"])
g = P({"tipo": "generica", "inicio": "2027-01-11", "etapas": [{"nome": "Levantamento", "dias": 3}, {"nome": "Compras", "dias": 10}, {"nome": "Execução", "dias": 15}]}).json()
check("Genérica: etapas encadeadas com os dias informados", g["atividades"] == 3 and [l["pred"] for l in g["linhas"]] == ["", "1", "2"] and g["dias_uteis"] == 28, (g["atividades"], g["dias_uteis"]))
check("Tipo inválido: 400 com mensagem", P({"tipo": "x"}).status_code == 400 and P({"tipo": "subestacao", "escopo": []}).status_code == 400)
check("Prazo com data inválida: 400", P({**base, "prazo": "31/02/2027"}).status_code == 400)

# ── criar ──
nova = adm.post(A+"/projetos", json={"codigo": "ELE-019", "nome": "Subestação 2 × 1.000 kVA", "cliente": "Metalúrgica Nordeste", "situacao": "Planejamento", "inicio": "2027-01-11", "fim": "2027-02-26"}).json()["id"]
f_id = {x["nome"].split()[0]: x["id"] for x in adm.get(A+"/funcionarios").json()["funcionarios"]}
m = adm.post(A+f"/obras/{nova}/assistente-montar", json={**base, "prazo": "2027-02-26", "encarregado_id": f_id["Bruno"]}).json()
check("Cria o cronograma: 4 etapas + 12 atividades, 13 ligações", m.get("atividades") == 16 and m.get("ligacoes") == 13, m)
cr = adm.get(A+f"/obras/{nova}/cronograma").json()
fim = max(a["fim"] for a in cr["atividades"])
check("Datas no cronograma iguais às da prévia", fim == rp["fim"], (fim, rp["fim"]))
check("Encarregado como responsável (engenharia fica sem)", any(a["responsavel_nome"] == "Bruno Costa" for a in cr["atividades"]) and all(a["responsavel_nome"] != "Bruno Costa" for a in cr["atividades"] if "ART" in a["descricao"]))
ob = [o for o in adm.get(A+"/obras/resumo").json()["obras"] if o["id"] == nova][0]
check("A obra fica com o fim do cronograma e o tipo de serviço", ob["fim"] == rp["fim"] and ob["tipo_servico"] == "Elétrica", (ob["fim"], ob["tipo_servico"]))
m2 = adm.post(A+f"/obras/{nova}/assistente-montar", json={"tipo": "qgbt", "equipe": 4, "inicio": "2027-01-11", "substituir": True}).json()
cr2 = adm.get(A+f"/obras/{nova}/cronograma").json()
check("Substituir troca o cronograma inteiro", len(cr2["atividades"]) == m2["atividades"] and not any("Transformadores" in a["descricao"] for a in cr2["atividades"]))
check("Encarregado não cria pelo assistente (403)", enc.post(A+f"/obras/{pid}/assistente-montar", json={"tipo": "spda"}).status_code == 403)
print(f"RESULTADO: {ok} ok, {f} falhas")
