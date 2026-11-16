"""Relatórios (servidor): prévia dos 4 tipos (obra: real × previsto, curva S pelo histórico, feito, atrasadas, Travou, fotos,
próximas, resumo sugerido; gerencial; Equipe e SST; Recursos e locação), emitir (número por obra/tipo, conteúdo congelado),
documento A4 (logo, escapa texto, CSP), Excel (.xlsx válido), lista, excluir, validações, permissões e isolamento."""
import sys, io, zipfile, datetime as dt, requests, openpyxl, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, "/home/claude/telas"); from dados_rel import montar
from dados_rdo import foto
from comum import token
A = "http://127.0.0.1:8900/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
pid, p2, ids, R, rd = montar()
def sessao(e, s):
    x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026"); ana = sessao("ana@rawtech.com.br", "Ana-Ribeiro-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026"); car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
mes = {"inicio": hoje.replace(day=1).isoformat(), "fim": D(0)}
# ── permissões ──
check("Encarregado e funcionário não acessam", enc.get(A+"/relatorios").status_code == 403 and car.post(A+"/relatorios/previa", json={"tipo": "gerencial", **mes}).status_code == 403)
L = ana.get(A+"/relatorios").json()
check("Lista: vazia, tipos e obras para escolher", L["emitidos"] == [] and len(L["tipos"]) == 4 and {o["codigo"] for o in L["obras"]} >= {"ELE-014", "NR12-007"} and L["pode_excluir"] is False)
# ── validações ──
v = lambda d: ana.post(A+"/relatorios/previa", json=d).status_code
check("Tipo inválido, sem período, fim antes do início, período enorme e futuro recusados",
      v({"tipo": "x", **mes}) == 400 and v({"tipo": "gerencial"}) == 400 and v({"tipo": "gerencial", "inicio": D(0), "fim": D(-3)}) == 400
      and v({"tipo": "gerencial", "inicio": D(-500), "fim": D(0)}) == 400 and v({"tipo": "gerencial", "inicio": D(3), "fim": D(9)}) == 400 and v({"tipo": "gerencial", "inicio": "2026-13-01", "fim": D(0)}) == 400)
check("Obra inexistente ou sem obra: 404", v({"tipo": "obra", "projeto_id": 99999, **mes}) == 404 and v({"tipo": "obra", **mes}) == 404)
# ── relatório da obra ──
C = ana.post(A+"/relatorios/previa", json={"tipo": "obra", "projeto_id": pid, **mes}).json()["conteudo"]; k = C["indicadores"]
check("Indicadores: real, previsto, desvio, término", k["real"] > 0 and k["previsto"] is not None and k["desvio"] == round(k["real"] - k["previsto"], 1) and k["termino"] >= D(0), k)
check("Avanço no período = real hoje − real antes do início", abs(k["avancou"] - (k["real"] - k["real_inicio"])) < 0.15 and k["real_inicio"] < k["real"])
cv = C["curva"]
check("Curva S: previsto do início ao fim, real só até hoje e crescente", cv[0]["data"] < D(0) and cv[-1]["previsto"] == 100 and all(c["real"] is None for c in cv if c["data"] > D(0))
      and [c["real"] for c in cv if c["real"] is not None] == sorted(c["real"] for c in cv if c["real"] is not None) and any(c["data"] == D(0) and c["real"] == k["real"] for c in cv))
F = {x["atividade"]: x for x in C["feito"]}
check("Feito no período pelo histórico (de → para, concluídas)", F["Base dos transformadores"]["para"] == 70 and F["Base dos transformadores"]["de"] < 70
      and any(x["situacao"] == "Concluída" for x in C["feito"]), C["feito"])
check("Atrasadas com dias de atraso", any(a["atividade"] == "Levantamento de campo e as-built" and a["dias"] > 0 for a in C["atrasadas"]))
check("Travou do período nos impedimentos", len(C["impedimentos"]) == 1 and C["impedimentos"][0]["tipo"] == "Clima" and C["impedimentos"][0]["liberada"] is None)
check("Fotos do período (3) e RDOs (4)", len(C["fotos"]) == 3 and len(C["rdos"]) == 4)
check("Próximas 2 semanas: só o que não acabou e começa até daqui a 14 dias", C["proximas"] and all(p["inicio"] <= D(14) and p["avanco"] < 100 for p in C["proximas"]))
check("Resumo sugerido com números, concluídas e próximos passos", "a obra avançou" in C["resumo_sugerido"] and "Concluímos" in C["resumo_sugerido"] and "Próximos passos" in C["resumo_sugerido"], C["resumo_sugerido"])
sem = ana.post(A+"/relatorios/previa", json={"tipo": "obra", "projeto_id": pid, "inicio": D(-30), "fim": D(-20)}).json()["conteudo"]
check("Período antigo: real reconstruído na época (menor que hoje) e sem as fotos de hoje", sem["indicadores"]["real"] < k["real"] and sem["fotos"] == [])
# ── emitir ──
r = ana.post(A+"/relatorios", json={"tipo": "obra", "projeto_id": pid, **mes, "secoes": ["curva", "feito", "fotos", "xss"], "resumo": "Semana <script>alert(1)</script> boa."})
rid = r.json().get("id")
check("Emitir: REL-ELE-014-01", r.status_code == 200 and r.json()["referencia"] == "REL-ELE-014-01", r.text)
r2 = ana.post(A+"/relatorios", json={"tipo": "obra", "projeto_id": pid, **mes}).json(); r3 = ana.post(A+"/relatorios", json={"tipo": "obra", "projeto_id": p2, **mes}).json()
check("Número por obra (ELE-014-02, NR12-007-01)", r2["referencia"] == "REL-ELE-014-02" and r3["referencia"] == "REL-NR12-007-01")
g1 = ana.post(A+"/relatorios", json={"tipo": "gerencial", **mes}).json(); s1 = adm.post(A+"/relatorios", json={"tipo": "sst", **mes}).json(); rc1 = adm.post(A+"/relatorios", json={"tipo": "recursos", **mes}).json()
check("Gerencial, SST e Recursos com numeração própria", (g1["referencia"], s1["referencia"], rc1["referencia"]) == ("REL-GER-001", "REL-SST-001", "REL-REC-001"))
doc = ana.get(A+f"/relatorios/{rid}/documento")
check("Documento: HTML A4 com CSP e sem cache", doc.status_code == 200 and "default-src 'none'" in doc.headers.get("Content-Security-Policy", "") and "no-store" in doc.headers.get("Cache-Control", ""))
check("Documento: logo, referência, código e assinatura do cliente", "data:image/png;base64" in doc.text and "REL-ELE-014-01" in doc.text and "Cliente · ciente" in doc.text and "PRÉVIA" not in doc.text)
check("Documento: texto do gestor escapado", "&lt;script&gt;alert(1)&lt;/script&gt;" in doc.text and "<script>alert(1)" not in doc.text)
check("Só as seções escolhidas (curva, feito, fotos)", "Curva S" in doc.text and "Feito no período" in doc.text and "Próximas 2 semanas" not in doc.text and "Atrasadas" not in doc.text and "../../fotos/" in doc.text)
check("Resumo vazio usa o sugerido", "a obra avançou" in ana.get(A+f"/relatorios/{r2['id']}/documento").text)
# congelado
antes = doc.text
car.post(A+f"/atividades/{ids['a22']}/avanco", json={"avanco": 90, "fotos": [{"dados": foto()}]}); adm.patch(A+f"/projetos/{pid}", json={"cliente": "Outro Cliente SA"})
check("Conteúdo congelado: mudanças depois não alteram o emitido", ana.get(A+f"/relatorios/{rid}/documento").text == antes)
check("Prévia nova já mostra a mudança", ana.post(A+"/relatorios/previa", json={"tipo": "obra", "projeto_id": pid, **mes}).json()["conteudo"]["indicadores"]["real"] > k["real"])
# Excel
x = ana.get(A+f"/relatorios/{rid}/excel")
wb = openpyxl.load_workbook(io.BytesIO(x.content)); ws = wb["Resumo"]
check("Excel: .xlsx válido com nome do relatório e abas", x.headers["Content-Type"].startswith("application/vnd.openxmlformats") and 'REL-ELE-014-01.xlsx' in x.headers["Content-Disposition"]
      and wb.sheetnames == ["Resumo", "Curva S", "Feito no período", "Atrasadas", "Impedimentos", "Próximas 2 semanas"])
check("Excel: números como número e texto escapado", isinstance(ws["B4"].value, (int, float)) and "<script>" in ws["B9"].value and ws["A1"].value == "Campo")
check("Excel: curva S com uma linha por ponto", wb["Curva S"].max_row == len(cv) + 1 or wb["Curva S"].max_row > 5)
for t, i in [("gerencial", g1["id"]), ("sst", s1["id"]), ("recursos", rc1["id"])]:
    z = zipfile.ZipFile(io.BytesIO(ana.get(A+f"/relatorios/{i}/excel").content)); check(f"Excel {t} abre", "xl/workbook.xml" in z.namelist() and openpyxl.load_workbook(io.BytesIO(ana.get(A+f"/relatorios/{i}/excel").content)) is not None)
# gerencial / sst / recursos
G = ana.post(A+"/relatorios/previa", json={"tipo": "gerencial", **mes}).json()["conteudo"]; O = {o["codigo"]: o for o in G["obras"]}
check("Gerencial: cada obra com real/previsto, farol, atrasadas, RDO pendente, equipe e conflitos", {"ELE-014", "NR12-007"} <= set(O) and O["ELE-014"]["atrasadas"] >= 1 and O["ELE-014"]["rascunhos"] == 1 and O["ELE-014"]["equipe"] >= 2 and O["ELE-014"]["farol"] in ("verde", "amarelo", "vermelho"))
check("Gerencial: pontos de atenção (atraso, dias sem RDO, conflito de recurso)", any("atrasada" in p for p in G["pontos"]) and any("sem RDO" in p for p in G["pontos"]) and any("ao mesmo tempo" in p for p in G["pontos"]), G["pontos"])
S = ana.post(A+"/relatorios/previa", json={"tipo": "sst", **mes}).json()["conteudo"]
check("SST: indicadores, vencidos/vencendo, ausências e carga", S["indicadores"]["pessoas"] >= 3 and isinstance(S["vencidos"], list) and isinstance(S["ausencias"], list) and any(c["carga"] > 100 for c in S["carga"]))
Rc = ana.post(A+"/relatorios/previa", json={"tipo": "recursos", **mes}).json()["conteudo"]
check("Recursos: locação com custo no período, uso e calibração", Rc["locacoes"] and Rc["locacoes"][0]["custo"] > 0 and Rc["indicadores"]["custo"] == round(sum(l["custo"] or 0 for l in Rc["locacoes"]), 2)
      and any(u["dias"] > 0 for u in Rc["uso"]) and isinstance(Rc["controles"], list))
pv = ana.post(A+"/relatorios/previa/documento", json={"tipo": "obra", "projeto_id": pid, **mes, "resumo": "<b>x</b>"})
check("Prévia em documento: marca PRÉVIA, sem barra, fotos pelo caminho da tela", pv.status_code == 200 and 'class="marca"' in pv.text and ".barra{display:none}" in pv.text and 'src="api/fotos/' in pv.text and "&lt;b&gt;x" in pv.text)
# lista e excluir
L = adm.get(A+"/relatorios").json()
check("Lista: mais novo primeiro, com período e quem emitiu", [e["referencia"] for e in L["emitidos"]][:3] == ["REL-REC-001", "REL-SST-001", "REL-GER-001"] and L["emitidos"][-1]["emitido_por"] == "Ana Ribeiro" and L["pode_excluir"])
check("Gestora não exclui; administrador exclui", ana.delete(A+f"/relatorios/{g1['id']}").status_code == 403 and adm.delete(A+f"/relatorios/{g1['id']}").status_code == 200
      and adm.get(A+f"/relatorios/{g1['id']}/documento").status_code == 404)
check("Número não é reaproveitado", ana.post(A+"/relatorios", json={"tipo": "gerencial", **mes}).json()["referencia"] == "REL-GER-002")
# isolamento
o = requests.Session()
o.post(A+"/cadastro", json={"empresa": {"nome": "Outra Relatórios", "telefone": "(81) 3000-2222"}, "admin": {"nome": "Outro Admin", "email": "rel@outra.test", "senha": "senha-forte-1"}, "equipe": []})
o.post(A+"/confirmar-email", json={"token": token("rel@outra.test", "confirmar")}); o.post(A+"/entrar", json={"email": "rel@outra.test", "senha": "senha-forte-1"})
check("Outra empresa: lista vazia, não abre, não baixa, não exclui, não gera da obra alheia", o.get(A+"/relatorios").json()["emitidos"] == [] and o.get(A+f"/relatorios/{rid}/documento").status_code == 404
      and o.get(A+f"/relatorios/{rid}/excel").status_code == 404 and o.delete(A+f"/relatorios/{rid}").status_code == 404 and o.post(A+"/relatorios/previa", json={"tipo": "obra", "projeto_id": pid, **mes}).status_code == 404)
check("Outra empresa: gerencial só com as obras dela (nenhuma)", o.post(A+"/relatorios/previa", json={"tipo": "gerencial", **mes}).json()["conteudo"]["obras"] == [])
print(f"RESULTADO: {ok} ok, {f} falhas"); sys.exit(1 if f else 0)
