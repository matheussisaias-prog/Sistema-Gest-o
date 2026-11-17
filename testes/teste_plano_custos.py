"""Plano da semana (Last Planner), custos realizados (IDC), ocorrência avulsa pelo RDO e avisos do sininho: API e telas."""
import sys, subprocess, requests, datetime as dt
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_ind import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
SQL = ["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-N", "-e"]
def q(s): return subprocess.run(SQL + [s], capture_output=True, text=True, check=True).stdout.strip()
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar()
def sessao(e, s): x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026"); ana = sessao("ana@rawtech.com.br", "Ana-Ribeiro-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026"); fun = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); seg = hoje - dt.timedelta(days=hoje.weekday())
# ── plano da semana ──
pl = adm.get(A+f"/obras/{pid}/plano").json()
check("Plano: semana começa na segunda e traz candidatas (atrasadas primeiro)", pl["semana"] == str(seg) and pl["candidatas"] and pl["candidatas"][0]["atrasada"])
c0, c1 = pl["candidatas"][0], pl["candidatas"][1]
r = enc.post(A+f"/obras/{pid}/plano", json={"semana": pl["semana"], "itens": [{"atividade_id": c0["atividade_id"], "meta": c0["sugestao"]}, {"atividade_id": c1["atividade_id"], "meta": 5}]})
check("Encarregado da obra se compromete com atividades", r.status_code == 200 and r.json()["salvos"] == 2, r.text)
pl = adm.get(A+f"/obras/{pid}/plano").json(); L = {x["atividade_id"]: x for x in pl["compromissos"]}
check("Meta abaixo do avanço atual sobe para avanço+1", L[c1["atividade_id"]]["meta"] == c1["avanco"] + 1)
check("Semana em andamento não tem PPC fechado", all(x["situacao"] in ("andamento", "cumprido") for x in pl["compromissos"]) and pl["historico"][-1]["ppc"] is None)
check("Funcionário não monta plano", fun.post(A+f"/obras/{pid}/plano", json={"semana": pl["semana"], "itens": [{"atividade_id": c0["atividade_id"]}]}).status_code in (403, 404))
x0 = L[c0["atividade_id"]]
check("Ajustar meta e tirar do plano (semana aberta)", adm.patch(A+f"/plano/{x0['id']}", json={"meta": 100}).status_code == 200 and adm.delete(A+f"/plano/{L[c1['atividade_id']]['id']}").status_code == 200)
# semana passada: compromisso não cumprido + motivo
ant = seg - dt.timedelta(days=7)
q(f"INSERT INTO plano_semanal (empresa_id, projeto_id, atividade_id, semana, meta_avanco, avanco_inicio, criado_por) VALUES (1, {pid}, {c0['atividade_id']}, '{ant}', 100, 0, 1)")
pa = adm.get(A+f"/obras/{pid}/plano?semana={ant}").json(); xa = pa["compromissos"][0]
check("Semana passada fechada: não cumprido e sem edição", pa["fechada"] and not pa["pode_editar"] and xa["situacao"] == "nao_cumprido" and pa["ppc"] == 0)
check("Não muda plano de semana encerrada", adm.post(A+f"/obras/{pid}/plano", json={"semana": str(ant), "itens": [{"atividade_id": c1["atividade_id"]}]}).status_code == 400)
check("Registrar o motivo do não cumprimento", adm.patch(A+f"/plano/{xa['id']}", json={"motivo": "material"}).status_code == 200 and adm.get(A+f"/obras/{pid}/plano?semana={ant}").json()["compromissos"][0]["motivo"] == "material")
d = adm.get(A+"/indicadores").json(); K = {k["chave"]: k for k in d["kpis"]}
check("Indicador P mostra o PPC (0%) e o motivo entra nas causas", K["P"]["valor"] == 0 and any("compromisso não cumprido" in it["texto"] for r in d["causas"]["ramos"] for g in r["grupos"] for it in g["itens"]))
# ── custos ──
check("Encarregado não vê custos", enc.get(A+f"/obras/{pid}/custos").status_code == 403)
check("Custo com data futura é recusado", adm.post(A+f"/obras/{pid}/custos", json={"data": str(hoje + dt.timedelta(days=2)), "categoria": "Material", "descricao": "x", "valor": 10}).status_code == 400)
check("Custo sem categoria é recusado", adm.post(A+f"/obras/{pid}/custos", json={"categoria": "", "descricao": "x", "valor": 10}).status_code == 400)
adm.patch(A+f"/projetos/{pid}", json={"orcamento": 300000})
cid = adm.post(A+f"/obras/{pid}/custos", json={"data": str(hoje), "categoria": "Material", "descricao": "Cabos", "valor": 120000}).json()["id"]
cu = adm.get(A+f"/obras/{pid}/custos").json()["resumo"]
check("IDC = valor agregado ÷ gasto; estimativa no término", cu["idc"] == round(cu["valor_agregado"] / 120000, 2) and abs(cu["estimativa_termino"] - 300000 / cu["idc"]) < 1, cu)
d = adm.get(A+"/indicadores").json(); K = {k["chave"]: k for k in d["kpis"]}
check("Indicador C passa a ter IDC", K["C"]["valor"] == cu["idc"] and "×" in K["C"]["secundario"]["valor"])
check("Apagar lançamento", adm.delete(A+f"/custos/{cid}").status_code == 200 and adm.get(A+f"/obras/{pid}/custos").json()["resumo"]["custo_real"] == 0)
# ── ocorrência avulsa e avisos ──
r = enc.post(A+f"/obras/{pid}/ocorrencias", json={"tipo": "Acidente", "gravidade": "Baixa", "descricao": "Corte leve na mão, sem afastamento"})
check("Encarregado registra acidente pelo RDO", r.status_code == 200, r.text)
d = adm.get(A+"/indicadores").json(); K = {k["chave"]: k for k in d["kpis"]}
check("Segurança volta a 0 dias e fica vermelha", K["S"]["valor"] == 0 and K["S"]["farol"] == "vermelho")
av = ana.get(A+"/avisos").json()
check("Acidente avisa a gestão (sininho da gestora)", av["nao_lidos"] >= 1 and any("Acidente" in a["titulo"] for a in av["avisos"]))
check("Marcar avisos como lidos", ana.post(A+"/avisos/lidos", json={}).status_code == 200 and ana.get(A+"/avisos").json()["nao_lidos"] == 0)
a_id = c1["atividade_id"]
r = adm.post(A+f"/obras/{pid}/ocorrencias", json={"tipo": "Retrabalho", "descricao": "Refazer emenda", "atividade_id": a_id, "parou": True})
check("Ocorrência que parou o serviço fica aberta (vira Travou)", r.status_code == 200 and q(f"SELECT resolvida_em IS NULL FROM ocorrencias WHERE id = {r.json()['id']}") == "1")
check("Funcionário não registra ocorrência avulsa", fun.post(A+f"/obras/{pid}/ocorrencias", json={"tipo": "Clima", "descricao": "chuva"}).status_code == 403)
check("Tipo inválido é recusado", adm.post(A+f"/obras/{pid}/ocorrencias", json={"tipo": "Xyz", "descricao": "x"}).status_code == 400)
# ── telas ──
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    def entrar(email, senha, vp={"width": 1440, "height": 900}, mob=False):
        c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); rotas(c); c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        pg = c.new_page(); pg.erros = []; pg.on("pageerror", lambda e: pg.erros.append(str(e)))
        pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
        pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1000); return c, pg
    c, pg = entrar("wendell@rawtech.com.br", "Obra-Segura-2026")
    pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-abas")
    check("Gestão vê as abas Plano da semana e Custos", pg.locator(".og-aba >> text=Plano da semana").count() == 1 and pg.locator(".og-aba >> text=Custos").count() == 1)
    pg.click(".og-aba >> text=Plano da semana"); pg.wait_for_selector(".op-cab")
    n0 = pg.locator(".op-lin").count(); pg.locator(".op-cand input[type=checkbox]").first.check(); pg.click(".op-pe .ob-bt"); pg.wait_for_timeout(1500)
    check("Tela: comprometer atividade entra na lista da semana", pg.locator(".op-lin").count() == n0 + 1)
    pg.click(".op-sem button >> nth=0"); pg.wait_for_timeout(1200)
    check("Tela: semana anterior mostra PPC e pede o motivo", "PPC 0%" in pg.inner_text(".op-cab") and pg.locator(".op-lin.vc").count() == 1 and pg.locator(".op-cand").count() == 0)
    pg.reload(); pg.wait_for_selector(".op-cab"); pg.wait_for_timeout(800)
    check("F5 volta na aba Plano da semana", pg.locator(".og-aba.on").inner_text() == "Plano da semana")
    pg.click(".og-aba >> text=Custos"); pg.wait_for_selector(".op-ks")
    pg.fill(".op-form input[placeholder*='NF']", "NF 77 · eletrodutos"); pg.fill(".op-form input[placeholder='Valor R$']", "15000"); pg.click(".op-form button[type=submit]"); pg.wait_for_timeout(1500)
    check("Tela: lançar custo aparece na lista e no gasto", pg.locator(".op-lc").count() == 1 and "15.000,00" in pg.inner_text(".op-ks"))
    pg.evaluate(f"tfRdo.abrirRdo({rd['rasc']})"); pg.wait_for_timeout(1500); pg.click(".eq-painel-cab .eq-bt >> text=Registrar"); pg.wait_for_selector(".eq-form textarea")
    pg.select_option(".eq-form select >> nth=0", "Clima"); pg.fill(".eq-form textarea", "Chuva forte à tarde"); pg.click(".eq-fundo button >> text=Registrar"); pg.wait_for_timeout(1500)
    check("Tela: RDO registra ocorrência avulsa", "Chuva forte à tarde" in pg.inner_text("#view-rdo"))
    check("Sem erro de tela (gestão)", not pg.erros, pg.erros); c.close()
    c, pg = entrar("bruno@rawtech.com.br", "Bruno-Costa-2026")
    pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-abas")
    check("Encarregado vê Plano da semana mas não Custos", pg.locator(".og-aba >> text=Plano da semana").count() == 1 and pg.locator(".og-aba >> text=Custos").count() == 0)
    c.close()
    adm.post(A+f"/obras/{pid}/ocorrencias", json={"tipo": "Acidente", "descricao": "Torção no tornozelo"})
    c, pg = entrar("ana@rawtech.com.br", "Ana-Ribeiro-2026"); pg.wait_for_timeout(1500)
    n = pg.inner_text("#notif-dot"); pg.click("#notif-btn"); pg.wait_for_timeout(1200)
    check("Sininho mostra a novidade do acidente e o contador", "novidades" in pg.inner_text(".tf-sino").lower() and "Acidente" in pg.inner_text(".tf-sino") and n not in ("", "0"), n)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    check("Abrir o sininho marca as novidades como lidas", ana.get(A+"/avisos").json()["nao_lidos"] == 0)
    c.close(); nav.close()
print(f"RESULTADO: {ok} ok, {f} falhas")
