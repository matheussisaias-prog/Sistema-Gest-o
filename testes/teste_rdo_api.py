"""RDO (servidor): calendário e pendências; abrir (um por dia, nº sequencial); montagem com avanços, fotos, Travou, recursos e
presentes; completar (clima, presentes, terceiros, observações); enviar; fechar (congela); reabrir; documento A4 com logo
(escapa texto, CSP); entregar; folha assinada; excluir; logo da empresa (cor, SVG recusado, cadastro); permissões e isolamento."""
import sys, json, base64, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from dados_rdo import montar, foto, logo
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
L = adm.get(A+f"/rdos?obra={pid}").json()
k = L["indicadores"]
check("Calendário do mês com indicadores (rascunho, fechado, entregue, assinado)", k["rasc"] == 1 and k["fech"] == 1 and k["entr"] == 1 and k["ass"] == 1, k)
dd = {x["data"]: x for x in L["dias"]}
check("Fim de semana sem expediente; dias úteis passados sem RDO cobrados", all(x["estado"] == "nao" for x in L["dias"] if dt.date.fromisoformat(x["data"]).weekday() >= 5 and not x["rdo"] and x["data"] < hoje.isoformat())
      and any(x["estado"] == "sem" for x in L["dias"]))
check("Pendências de todas as obras (ELE-014 e NR12-007)", {p["obra"] for p in L["pendencias"]} == {"ELE-014", "NR12-007"} and {p["tipo"] for p in L["pendencias"]} >= {"sem", "rasc", "fech", "entr"})
check("Encarregado vê só a obra dele; funcionário não entra", [o["codigo"] for o in enc.get(A+"/rdos").json()["obras"]] == ["ELE-014"] and car.get(A+"/rdos").status_code == 403)
# abrir
r = enc.post(A+f"/obras/{pid}/rdos", json={}); rid = r.json()["id"]
check("Encarregado abre o RDO de hoje (nº 5 da obra)", r.status_code == 200 and r.json()["novo"] and adm.get(A+f"/rdos/{rid}").json()["rdo"]["numero"] == 5)
check("Abrir de novo devolve o mesmo (um por dia)", enc.post(A+f"/obras/{pid}/rdos", json={}).json()["id"] == rid)
check("Dia futuro recusado", adm.post(A+f"/obras/{pid}/rdos", json={"data": D(1)}).status_code == 400)
check("Encarregado não abre RDO de obra que não é dele; funcionário não abre", enc.post(A+f"/obras/{p2}/rdos", json={}).status_code == 404 and car.post(A+f"/obras/{pid}/rdos", json={}).status_code == 403)
g = enc.get(A+f"/rdos/{rid}").json(); C = g["conteudo"]; S = {s["descricao"]: s for s in C["servicos"]}
check("Serviços do dia vêm dos avanços (de → para, quem, comentário)", S["Base dos transformadores"]["de"] == 60 and S["Base dos transformadores"]["para"] == 70 and S["Eletrodutos e caixas de passagem"]["comentarios"] == ["Trecho A concluído"], S)
check("Fotos ligadas aos serviços", len(S["Base dos transformadores"]["fotos"]) == 2 and len(S["Eletrodutos e caixas de passagem"]["fotos"]) == 1)
check("Travou do dia nas ocorrências", len(C["ocorrencias"]) == 1 and "Chuva forte" in C["ocorrencias"][0]["descricao"] and C["ocorrencias"][0]["atividade"] == "Malha de aterramento")
check("Equipamentos reservados nas atividades do dia", {e["codigo"] for e in C["equipamentos"]} == {"MUN-01", "PLT-02"})
check("Presentes já marcados: quem tem atividade hoje", {p["nome"]: p["presente"] for p in C["presencas"]} == {"Bruno Costa": True, "Carla Mendes": True} and C["total"] == 2, C["presencas"])
check("Pode: encarregado edita e envia, não fecha", g["pode"]["editar"] and g["pode"]["enviar"] and not g["pode"]["fechar"])
# completar
check("Clima inválido recusado", enc.patch(A+f"/rdos/{rid}", json={"clima_manha": "Sol"}).status_code == 400)
F = {p["nome"]: p["id"] for p in C["presencas"]}
r = enc.patch(A+f"/rdos/{rid}", json={"clima_manha": "Bom", "clima_tarde": "Chuva", "terceiros": 4, "terceiros_desc": "Elétrica Silva", "presencas": [{"funcionario_id": F["Carla Mendes"], "presente": False}], "observacoes": "Visita do fiscal às 10h. <script>alert(1)</script>"})
check("Completar: clima, terceiros, presença e observações; total recalculado", r.status_code == 200 and r.json()["presentes"] == 1 and r.json()["total"] == 5, r.text)
check("Terceiros fora do limite recusado", enc.patch(A+f"/rdos/{rid}", json={"terceiros": 9999}).status_code == 400)
check("Pessoa de outra empresa/inexistente recusada", enc.patch(A+f"/rdos/{rid}", json={"presencas": [{"funcionario_id": 99999, "presente": True}]}).status_code == 400)
g = enc.get(A+f"/rdos/{rid}").json()
check("Presença salva vale mais que a sugestão", [p for p in g["conteudo"]["presencas"] if p["nome"] == "Carla Mendes"][0]["presente"] is False)
# ausência: quem está de férias vem desmarcado
adm.put(A+f"/ausencias/funcionario/{F['Carla Mendes']}", json={"periodos": [{"inicio": D(0), "fim": D(3), "tipo": "Férias"}]})
rid2 = adm.post(A+f"/obras/{pid}/rdos", json={"data": rd and adm.get(A+f"/rdos/{rd['rasc']}").json()["rdo"]["data"]}).json()["id"]
check("Abrir dia que já tem RDO devolve o existente", rid2 == rd["rasc"])
g2 = adm.get(A+f"/rdos/{rid}").json()
check("Quem está de férias aparece com o aviso", [p for p in g2["conteudo"]["presencas"] if p["nome"] == "Carla Mendes"][0]["ausencia"].startswith("Férias"))
adm.put(A+f"/ausencias/funcionario/{F['Carla Mendes']}", json={"periodos": []})
# enviar / fechar
r = enc.post(A+f"/rdos/{rid}/enviar")
check("Encarregado envia ao gestor", r.status_code == 200 and adm.get(A+f"/rdos/{rid}").json()["rdo"]["enviado_por"] == "Bruno Costa")
check("Encarregado não fecha", enc.post(A+f"/rdos/{rid}/fechar").status_code == 403)
r = ana.post(A+f"/rdos/{rid}/fechar")
check("Gestora fecha: código de conferência", r.status_code == 200 and len(r.json()["codigo"]) == 9)
check("Fechado não muda (409)", enc.patch(A+f"/rdos/{rid}", json={"observacoes": "x"}).status_code == 409 and ana.post(A+f"/rdos/{rid}/fechar").status_code == 409)
antes = adm.get(A+f"/rdos/{rid}").json()["conteudo"]
car.post(A+f"/atividades/{ids['a22']}/avanco", json={"avanco": 50, "fotos": [{"dados": foto()}]})
depois = adm.get(A+f"/rdos/{rid}").json()["conteudo"]
check("Conteúdo congelado: avanço depois de fechar não entra", antes == depois and [s for s in depois["servicos"] if s["descricao"] == "Eletrodutos e caixas de passagem"][0]["para"] == 40)
doc = adm.get(A+f"/rdos/{rid}/documento")
t = doc.text
check("Documento A4: HTML com logo embutida, cor da logo e código", doc.status_code == 200 and "data:image/png;base64," in t and "#0f3d6e" in t and r.json()["codigo"] in t and "RASCUNHO" not in t)
check("Documento escapa texto (sem script injetado) e tem CSP", "<script>alert(1)</script>" not in t and "&lt;script&gt;" in t and "default-src 'none'" in doc.headers.get("Content-Security-Policy", ""))
check("Documento traz mão de obra com terceiros e quem faltou", "Elétrica Silva" in t and "Faltou" in t and "Mão de obra (5)" in t, t[t.find("Mão de obra"):t.find("Mão de obra") + 30])
check("Rascunho sai com marca d'água", "RASCUNHO" in adm.get(A+f"/rdos/{rd['rasc']}/documento").text)
check("Funcionário não abre documento", car.get(A+f"/rdos/{rid}/documento").status_code == 403)
# reabrir e fechar de novo
check("Reabrir (gestor) volta a rascunho; encarregado não reabre", enc.post(A+f"/rdos/{rid}/reabrir").status_code == 403 and adm.post(A+f"/rdos/{rid}/reabrir").status_code == 200
      and adm.get(A+f"/rdos/{rid}").json()["rdo"]["situacao"] == "Rascunho")
adm.post(A+f"/rdos/{rid}/fechar")
check("Ao fechar de novo pega o que mudou (avanço 50%)", [s for s in adm.get(A+f"/rdos/{rid}").json()["conteudo"]["servicos"] if s["descricao"] == "Eletrodutos e caixas de passagem"][0]["para"] == 50)
# entregar e assinar
check("Entrega antes da data do RDO recusada", enc.post(A+f"/rdos/{rid}/entregue", json={"data": D(-5)}).status_code == 400)
check("Encarregado marca entregue", enc.post(A+f"/rdos/{rid}/entregue", json={"data": D(0)}).status_code == 200)
check("Anexar sem foto ou sem assinante recusado", enc.post(A+f"/rdos/{rid}/assinado", json={"assinante": "X", "data": D(0)}).status_code == 400
      and enc.post(A+f"/rdos/{rid}/assinado", json={"foto": {"dados": foto()}, "data": D(0)}).status_code == 400)
r = enc.post(A+f"/rdos/{rid}/assinado", json={"foto": {"dados": foto((240, 240, 230))}, "assinante": "Eng. Paulo Andrade", "data": D(0)})
g = adm.get(A+f"/rdos/{rid}").json()["rdo"]
check("Folha assinada anexada: RDO assinado", r.status_code == 200 and g["situacao"] == "Assinado" and g["cliente_assinante"] == "Eng. Paulo Andrade" and g["tem_folha"])
fo = adm.get(A+f"/rdos/{rid}/folha")
check("Folha abre como imagem privada; funcionário não abre", fo.status_code == 200 and fo.headers["Content-Type"] == "image/jpeg" and "no-store" in fo.headers.get("Cache-Control", "") and car.get(A+f"/rdos/{rid}/folha").status_code == 403)
check("Fechado direto para assinado também vale (entrega no mesmo dia)", adm.post(A+f"/rdos/{rd['fech']}/assinado", json={"foto": {"dados": foto()}, "assinante": "Cliente", "data": adm.get(A+f"/rdos/{rd['fech']}").json()["rdo"]["data"]}).status_code == 200
      and adm.get(A+f"/rdos/{rd['fech']}").json()["rdo"]["entregue_em"] is not None)
check("Assinado não volta, não reabre, não exclui", adm.post(A+f"/rdos/{rid}/reabrir").status_code == 409 and adm.delete(A+f"/rdos/{rid}").status_code == 409)
check("Excluir rascunho (gestor); encarregado não exclui", enc.delete(A+f"/rdos/{rd['rasc']}").status_code == 403 and adm.delete(A+f"/rdos/{rd['rasc']}").status_code == 200 and adm.get(A+f"/rdos/{rd['rasc']}").status_code == 404)
L = adm.get(A+f"/rdos?obra={pid}").json()
check("Calendário atualizado (assinados e pendências)", L["indicadores"]["ass"] == 3 and not any(p.get("id") == rid for p in L["pendencias"]), L["indicadores"])
# logo
cab = adm.get(A+"/empresa/cabecalho").json()
check("Cabeçalho da empresa: cor da logo e indicação de logo", cab["tem_logo"] and cab["cor"] == "#0f3d6e" and cab["pode_logo"])
check("Logo servida como PNG para quem está logado", adm.get(A+"/empresa/logo").headers.get("Content-Type") == "image/png" and car.get(A+"/empresa/logo").status_code == 200)
check("Só o administrador troca a logo", ana.post(A+"/empresa/logo", json={"dados": logo()}).status_code == 403 and ana.get(A+"/empresa/cabecalho").json()["pode_logo"] is False)
check("SVG e arquivo que não é imagem recusados", adm.post(A+"/empresa/logo", json={"dados": "data:image/svg+xml;base64," + base64.b64encode(b"<svg onload=alert(1)/>").decode()}).status_code == 400
      and adm.post(A+"/empresa/logo", json={"dados": "data:image/png;base64," + base64.b64encode(b"nao e imagem").decode()}).status_code == 400)
check("/eu informa se a empresa tem logo (barra lateral)", adm.get(A+"/eu").json()["usuario"]["empresa_logo"] == 1)
check("Tirar a logo", adm.delete(A+"/empresa/logo").status_code == 200 and adm.get(A+"/empresa/logo").status_code == 404 and adm.get(A+"/eu").json()["usuario"]["empresa_logo"] == 0)
livre = [p["data"] for p in adm.get(A+f"/rdos?obra={pid}").json()["pendencias"] if p["tipo"] == "sem" and p["projeto_id"] == pid][0]
rid3 = adm.post(A+f"/obras/{pid}/rdos", json={"data": livre}).json()["id"]
check("RDO já fechado guarda a logo da época; um novo, sem logo, sai com o nome da empresa", "data:image/png" in adm.get(A+f"/rdos/{rid}/documento").text and 'class="logo-txt"' in adm.get(A+f"/rdos/{rid3}/documento").text)
# cadastro com logo + isolamento
o = requests.Session()
r = o.post(A+"/cadastro", json={"empresa": {"nome": "Outra Engenharia", "telefone": "(81) 3000-1111", "logo": {"dados": logo()}}, "admin": {"nome": "Outro Admin", "email": "rdo@outra.test", "senha": "senha-forte-1"}, "equipe": []})
o.post(A+"/confirmar-email", json={"token": token("rdo@outra.test", "confirmar")}); o.post(A+"/entrar", json={"email": "rdo@outra.test", "senha": "senha-forte-1"})
check("Cadastro da empresa já com a logo", r.status_code == 200 and o.get(A+"/empresa/logo").status_code == 200 and o.get(A+"/empresa/cabecalho").json()["telefone"] == "(81) 3000-1111", r.text)
check("Outra empresa não vê nem mexe no RDO", o.get(A+f"/rdos/{rid}").status_code == 404 and o.get(A+f"/rdos/{rid}/documento").status_code == 404 and o.get(A+f"/rdos/{rid}/folha").status_code == 404
      and o.patch(A+f"/rdos/{rid3}", json={"clima_manha": "Bom"}).status_code == 404 and o.post(A+f"/obras/{pid}/rdos", json={}).status_code == 404)
print(f"RESULTADO: {ok} ok, {f} falhas")
