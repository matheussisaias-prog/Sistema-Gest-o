"""Tela Gráficos: indicadores SQDCP, PPC, avanço por obra e Ishikawa (6M). API e tela (computador e celular)."""
import sys, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_ind import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar()
def sessao(e, s): x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026")
# ── API ──
d = adm.get(A+"/indicadores").json()
check("API: 5 indicadores S, Q, D, C, P", [k["chave"] for k in d["kpis"]] == list("SQDCP"))
K = {k["chave"]: k for k in d["kpis"]}
check("Segurança: dias desde o último acidente (45) e farol de atenção", K["S"]["valor"] == 45 and K["S"]["farol"] == "amarelo", K["S"])
check("Pessoas: tempo médio para destravar dos Travou resolvidos (2,1 dias)", K["P"]["valor"] == 2.1 and "2 abertos" in K["P"]["detalhe"], K["P"])
check("Entrega: PPC das últimas 4 semanas com 6 semanas no gráfico", len(d["ppc_semanas"]) == 6 and K["D"]["formato"] == "%")
check("Custo: IDP com valor do contrato", K["C"]["valor"] is not None and "Agregado R$" in K["C"]["detalhe"])
ram = {r["chave"]: r for r in d["ishikawa"]["ramos"]}
check("Ishikawa com os 6M", list(ram) == ["mao", "maquina", "material", "metodo", "meio", "medida"])
check("Material: 2 Travou por falta de material", ram["material"]["qtd"] == 2 and "Cabo 25" in str(ram["material"]["grupos"]))
check("Meio ambiente: clima e pendência do cliente", {g["titulo"] for g in ram["meio"]["grupos"]} == {"Clima", "Pendência do cliente"})
check("Mão de obra: acidente aparece", any(g["titulo"] == "Acidentes" for g in ram["mao"]["grupos"]))
d2 = adm.get(A+f"/indicadores?obra={p2}").json()
check("Filtro por obra: outra obra não traz os Travou da primeira", d2["obra"] == p2 and sum(r["qtd"] for r in d2["ishikawa"]["ramos"] if r["chave"] in ("material", "meio")) == 0)
check("Encarregado e funcionário não acessam", sessao("bruno@rawtech.com.br", "Bruno-Costa-2026").get(A+"/indicadores").status_code == 403 and sessao("carla@rawtech.com.br", "Carla-Mendes-2026").get(A+"/indicadores").status_code == 403)
check("Obra de outra empresa não abre", adm.get(A+"/indicadores?obra=99999").status_code == 404)
# ── tela ──
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for nome, vp, mob in [("computador", {"width": 1440, "height": 900}, False), ("celular", {"width": 390, "height": 844}, True)]:
        c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); rotas(c); c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        pg = c.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
        pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(800)
        pg.evaluate("tfIndicadores.abrir()"); pg.wait_for_selector(".ind-kpi")
        check(f"[{nome}] 5 cartões com letra, valor e meta", pg.locator(".ind-kpi").count() == 5 and pg.locator(".ind-kpi .ind-letra").all_inner_texts() == list("SQDCP") and "Meta:" in pg.inner_text(".ind-kpi >> nth=0"))
        pg.locator(".ind-kpi >> nth=2").locator(".ind-info").click()
        check(f"[{nome}] (i) explica o indicador", "Last Planner" in pg.inner_text(".ind-kpi >> nth=2"))
        check(f"[{nome}] PPC e avanço por obra desenhados", pg.locator(".ind-svg rect.ind-barra").count() >= 1 and pg.locator(".ind-av-l").count() == 2)
        check(f"[{nome}] Ishikawa com 6 ramos e o efeito", pg.locator(".ind-ramo").count() == 6 and "Atrasos" in pg.text_content(".ind-ish"))
        pg.locator(".ind-ramo[data-ramo='material'] .ind-ramo-cx").click(); pg.wait_for_timeout(300)
        check(f"[{nome}] Clicar no ramo lista as causas", "Cabo 25 mm²" in pg.inner_text(".ind-det-ramo") and pg.locator(".ind-ramo.on").count() == 1)
        pg.reload(); pg.wait_for_selector(".ind-kpi"); pg.wait_for_timeout(800)
        check(f"[{nome}] F5 volta na tela com o mesmo ramo aberto", pg.locator(".ind-det-ramo").count() == 1 and "Material" in pg.inner_text(".ind-det-t"))
        pg.locator(".ind-det-ramo button.ind-item >> nth=0").click(); pg.wait_for_selector(".og-cab h1", timeout=10000)
        check(f"[{nome}] Clicar numa causa abre a obra", "Subestação" in pg.inner_text(".og-cab h1"))
        pg.evaluate("tfIndicadores.abrir()"); pg.wait_for_selector(".ind-kpi"); pg.select_option(".ind-sel-obra", str(p2)); pg.wait_for_timeout(1200)
        check(f"[{nome}] Escolher a obra filtra", pg.locator(".ind-av-l").count() <= 1)
        pg.select_option(".ind-sel-obra", ""); pg.wait_for_timeout(800)
        if mob: check("[celular] Sem rolagem lateral da página", pg.evaluate("document.documentElement.scrollWidth") <= 392, pg.evaluate("document.documentElement.scrollWidth"))
        check(f"[{nome}] Sem erro de tela", not erros, erros)
        c.close()
    c = nav.new_context(viewport={"width": 1440, "height": 900}); rotas(c); c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page()
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "bruno@rawtech.com.br"); pg.fill("#e-senha", "Bruno-Costa-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(800)
    pg.evaluate("switchView('graficos', null)"); pg.wait_for_timeout(1000)
    check("Encarregado na tela Gráficos vê só os gráficos antigos", pg.locator(".ind-kpi").count() == 0 and pg.locator("#chart-status-full").count() == 1)
    nav.close()
print(f"RESULTADO: {ok} ok, {f} falhas")
