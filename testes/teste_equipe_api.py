"""Equipe (servidor): lista com situação, documentos e carga; ficha; documentos com certificado (ASO restrito); cargos e exigências;
exigência da atividade; checagem ao alocar com sugestões; histórico; vencimentos só no painel."""
import sys, io, json, base64, subprocess, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from dados_crono import criar
from PIL import Image
A = "http://127.0.0.1:8900/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
def img():
    b = io.BytesIO(); Image.new("RGB", (800, 600), (200, 200, 190)).save(b, "JPEG"); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
PDF = "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF").decode()
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
pid, ids = criar()
def sessao(e, s):
    x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026"); ana = sessao("ana@rawtech.com.br", "Ana-Ribeiro-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026"); car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
F = {x["nome"].split()[0]: x["id"] for x in adm.get(A+"/funcionarios").json()["funcionarios"]}
adm.patch(A+f"/funcionarios/{F['Carla']}", json={"encarregado_id": F["Bruno"]})
T = {t["nome"]: t for t in adm.get(A+"/tipos-documento").json()["tipos"]}
check("Catálogo da empresa com os 43 documentos e o prazo em texto", len(T) == 43 and T["NR-10 Básico"]["prazo"] == "validade 2 anos" and T["Trabalho em altura"]["nr"] == "NR-35")
nr10, nr35, aso, nr33 = T["NR-10 Básico"]["id"], T["Trabalho em altura"]["id"], T["ASO – periódico (exposto a riscos)"]["id"], T["Espaço confinado – trabalhador autorizado e vigia"]["id"]

# ── cargos ──
r = adm.put(A+"/cargos-documentos", json={"cargo": "Eletricista", "tipos": [nr10, nr35, aso]})
check("Gestor define documentos do cargo Eletricista", r.status_code == 200)
cg = {c["cargo"]: c for c in adm.get(A+"/cargos-documentos").json()["cargos"]}
check("Cargos: pessoas e documentos de cada um", cg["Eletricista"]["pessoas"] == 1 and sorted(cg["Eletricista"]["tipos"]) == sorted([nr10, nr35, aso]))
check("Encarregado não muda os exigidos do cargo", enc.put(A+"/cargos-documentos", json={"cargo": "Eletricista", "tipos": []}).status_code == 403)
check("Cargo com acento/maiúscula diferente vale igual", adm.put(A+"/cargos-documentos", json={"cargo": "ELETRICISTA", "tipos": [nr10, nr35, aso]}).status_code == 200 and len([c for c in adm.get(A+"/cargos-documentos").json()["cargos"] if c["cargo"].lower() == "eletricista"]) == 1)

# ── documentos ──
p = lambda s, fid, d: s.post(A+f"/funcionarios/{fid}/documentos", json=d)
r = p(adm, F["Carla"], {"tipo_documento_id": nr10, "emissao": D(-400), "instituicao": "SENAI", "arquivo": {"dados": PDF, "nome": "nr10.pdf"}})
check("Lança NR-10 com PDF: vencimento calculado pela norma (2 anos)", r.status_code == 200 and r.json()["vence"] == (hoje - dt.timedelta(days=400)).replace(year=(hoje - dt.timedelta(days=400)).year + 2).isoformat(), r.text)
r = p(enc, F["Carla"], {"tipo_documento_id": nr35, "emissao": D(-720), "arquivo": {"dados": img()}})
check("Encarregado lança NR-35 da equipe com foto do certificado", r.status_code == 200)
r = p(adm, F["Carla"], {"tipo_documento_id": aso, "emissao": D(-30), "apto": True, "arquivo": {"dados": img()}})
aso_id = r.json()["id"]
check("ASO lançado (arquivo de saúde fica restrito)", r.status_code == 200)
check("Emissão no futuro: recusada", p(adm, F["Carla"], {"tipo_documento_id": nr10, "emissao": D(5)}).status_code == 400)
check("Sem emissão: recusada", p(adm, F["Carla"], {"tipo_documento_id": nr10}).status_code == 400)
check("Arquivo que não é PDF nem imagem: recusado", p(adm, F["Carla"], {"tipo_documento_id": nr10, "emissao": D(-1), "arquivo": {"dados": "data:text/plain;base64,b2k="}}).status_code == 400)
check("Encarregado não lança para quem não é da equipe dele", p(enc, F["Ana"], {"tipo_documento_id": nr10, "emissao": D(-1)}).status_code == 404)
check("Funcionária não lança documento", p(car, F["Carla"], {"tipo_documento_id": nr10, "emissao": D(-1)}).status_code == 403)

# ── lista e ficha ──
L = {x["nome"].split()[0]: x for x in adm.get(A+"/equipe").json()["pessoas"]}
check("Lista traz situação, documentos, carga e obras", L["Carla"]["situacao"]["tipo"] == "trabalhando" and L["Carla"]["documentos"]["nivel"] == "vencendo" and "NR-35 vence em" in L["Carla"]["documentos"]["texto"] and "ELE-014" in L["Carla"]["obras"], L["Carla"])
check("Carga dos próximos 14 dias é calculada", isinstance(L["Carla"]["carga"], int) and L["Carla"]["carga"] > 0)
check("Gestor vê custo/hora; encarregado não", "custo_hora" in L["Carla"] and "custo_hora" not in enc.get(A+"/equipe").json()["pessoas"][0])
E = [x["nome"] for x in enc.get(A+"/equipe").json()["pessoas"]]
check("Encarregado vê só ele e a equipe dele", sorted(E) == ["Bruno Costa", "Carla Mendes"], E)
check("Funcionária não abre a Equipe", car.get(A+"/equipe").status_code == 403)
fi = adm.get(A+f"/equipe/{F['Carla']}").json()
docs = {d["nome"]: d for d in fi["documentos"]}
check("Ficha: os 3 exigidos pelo cargo, com situação e arquivo", set(docs) == {"NR-10 Básico", "NR-35 Trabalho em altura", "NR-07 ASO – periódico (exposto a riscos)"} and docs["NR-35 Trabalho em altura"]["situacao"] == "vencendo" and docs["NR-10 Básico"]["arquivo"] == "ver", list(docs))
check("Ficha: agenda e quem é o encarregado", fi["agenda"] and fi["pessoa"]["encarregado_nome"] == "Bruno Costa")
arq = adm.get(A+f"/documentos/{docs['NR-10 Básico']['documento_id']}/arquivo")
check("Certificado em PDF abre para o gestor", arq.status_code == 200 and arq.headers["Content-Type"] == "application/pdf")
check("ASO (saúde) só o administrador abre", ana.get(A+f"/documentos/{aso_id}/arquivo").status_code == 403 and adm.get(A+f"/documentos/{aso_id}/arquivo").status_code == 200)
check("Na ficha do gestor o ASO aparece como restrito", [d for d in ana.get(A+f"/equipe/{F['Carla']}").json()["documentos"] if "ASO" in d["nome"]][0]["arquivo"] == "restrito")

# ── ausência e situação ──
adm.put(A+f"/ausencias/funcionario/{F['Ana']}", json={"periodos": [{"inicio": D(-2), "fim": D(10), "tipo": "Férias"}]})
la = [x for x in adm.get(A+"/equipe").json()["pessoas"] if x["nome"] == "Ana Ribeiro"][0]
check("De férias: situação 'Férias até dd/mm'", la["situacao"]["tipo"] == "ferias" and la["situacao"]["texto"].startswith("Férias até"))

# ── exigência da atividade e checagem ao alocar ──
a23 = ids["a23"]
r = adm.put(A+f"/atividades/{a23}/exigencias", json={"tipos": [nr33]})
check("Atividade passa a exigir NR-33", r.status_code == 200 and r.json()["tipos"][0]["id"] == nr33)
check("Encarregado não muda exigências da atividade", enc.put(A+f"/atividades/{a23}/exigencias", json={"tipos": []}).status_code == 403)
ch = adm.get(A+f"/atividades/{a23}/checar-responsavel", params={"funcionario_id": F["Carla"]}).json()
txt = " | ".join(x["texto"] for x in ch["pendencias"])
check("Checar: falta NR-33 exigida pela atividade", "Falta NR-33 Espaço confinado" in txt and "exigida por esta atividade" in txt, txt)
p(adm, F["Bruno"], {"tipo_documento_id": nr33, "emissao": D(-10)})
check("Sugere quem pode fazer sem pendência (Bruno tem NR-33)", any(s["nome"] == "Bruno Costa" for s in ch["sugestoes"]) or any(s["nome"] == "Bruno Costa" for s in adm.get(A+f"/atividades/{a23}/checar-responsavel", params={"funcionario_id": F["Carla"]}).json()["sugestoes"]))
ch2 = adm.get(A+f"/atividades/{ids['a21']}/checar-responsavel", params={"funcionario_id": F["Ana"]}).json()
check("Checar: férias dentro do período da atividade", any(x["tipo"] == "ausencia" for x in ch2["pendencias"]), ch2["pendencias"])
r = adm.patch(A+f"/atividades/{ids['a21']}", json={"responsavel_id": F["Ana"], "alocacao_pendencias": "Férias de 13/11 a 25/11"})
h = adm.get(A+f"/atividades/{ids['a21']}/historico").json()["historico"][0]
check("Alocar mesmo assim fica no histórico", r.status_code == 200 and h["depois"].get("alocou_com_pendencias") == "Férias de 13/11 a 25/11", h)
check("Encarregado não usa a checagem (só gestão aloca)", enc.get(A+f"/atividades/{a23}/checar-responsavel", params={"funcionario_id": F["Carla"]}).status_code == 403)
ll = {x["nome"].split()[0]: x for x in adm.get(A+"/equipe").json()["pessoas"]}
check("Lista: a Carla agora tem pendência por causa da atividade", ll["Carla"]["documentos"]["nivel"] == "vencido" and "NR-33" in ll["Carla"]["documentos"]["texto"], ll["Carla"]["documentos"])

# ── afastamento longo invalida treinamento (NR-01) ──
adm.put(A+f"/ausencias/funcionario/{F['Carla']}", json={"periodos": [{"inicio": D(-300), "fim": D(-100), "tipo": "Afastamento – doença ou acidente"}]})
dd = {d["nome"]: d for d in adm.get(A+f"/equipe/{F['Carla']}").json()["documentos"]}
check("Afastamento > 180 dias depois da emissão invalida o treinamento", dd["NR-10 Básico"]["situacao"] == "vencido" and "afastamento" in dd["NR-10 Básico"]["situacao_texto"], dd["NR-10 Básico"])

print(f"RESULTADO: {ok} ok, {f} falhas")
