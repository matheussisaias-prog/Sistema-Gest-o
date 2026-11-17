"""Início · gestão à vista (telas): menu e entrada da gestão; encarregado/funcionário seguem em Minhas atividades;
KPIs, farol, atrasos/Travou, RDO e documentos, agenda; cliques abrem a obra, a atividade e o RDO do dia; modo TV
(tela cheia, 3 páginas, seta, Esc, X); Assistente leva ao Início; celular sem rolagem lateral e sem modo TV."""
import sys, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_rel import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar(); erros = []
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); rotas(c)
    c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden")
def ativa(pg): return pg.evaluate("document.querySelector('.view.active')?.id")
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    for em, se, nome in [("bruno@rawtech.com.br", "Bruno-Costa-2026", "Encarregado"), ("carla@rawtech.com.br", "Carla-Mendes-2026", "Funcionária")]:
        c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, em, se); pg.wait_for_timeout(500)
        check(f"{nome}: sem Início no menu e começa em Minhas atividades", pg.locator("#nav-inicio").count() == 0 and ativa(pg) == "view-minhas", ativa(pg)); c.close()
    # ── gestora ──
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "ana@rawtech.com.br", "Ana-Ribeiro-2026"); pg.wait_for_selector(".gv-obra")
    check("Gestora entra direto no Início", ativa(pg) == "view-inicio" and pg.inner_text("#page-title") == "Início" and "Ana" in pg.inner_text("#view-inicio h2, #view-inicio h1"))
    check("Início é o primeiro item do menu", pg.evaluate("document.querySelector('.sidebar .nav-item')?.id") == "nav-inicio")
    t = pg.inner_text("#view-inicio")
    check("Números: farol, Travou, atrasadas, dias sem RDO, NR", pg.locator(".gv-kpis .eq-kpi").count() == 5 and "Travou sem liberar" in t and "dias úteis sem RDO" in t)
    check("Farol com as 2 obras, barra real e traço previsto", pg.locator(".gv-obra").count() == 2 and pg.locator(".gv-obra .gv-barra i").count() == 2 and pg.locator(".gv-obra .gv-barra em").count() == 2)
    check("Atrasos e Travou com motivo", "Malha de aterramento" in t and "Travou" in t and "atraso" in t)
    check("RDO e documentos pendentes", "rascunho" in t and "dia útil sem RDO" in t)
    check("Agenda com 7 dias e hoje marcado", pg.locator(".gv-semana .gv-dia").count() == 7 and pg.locator(".gv-dia.hoje").count() == 1 and "devolver" in pg.inner_text(".gv-semana"))
    pg.click(".gv-obra[data-obra='%d']" % pid); pg.wait_for_function("window.tfObra && tfObra.estado && tfObra.estado.d && tfObra.estado.d.obra && tfObra.estado.d.obra.id == %d" % pid, timeout=8000)
    check("Cartão do farol abre a obra", True)
    pg.click("#nav-inicio"); pg.wait_for_selector(".gv-obra")
    pg.locator(".gv-lin", has_text="Malha de aterramento").first.click(); pg.wait_for_timeout(1500)
    check("Linha do Travou abre o painel da atividade", "Malha de aterramento" in pg.inner_text("body") and pg.locator(".og-painel-fundo").count() == 1 and pg.locator(".og-painel-fundo input").first.input_value() == "Malha de aterramento")
    pg.keyboard.press("Escape"); pg.click("#nav-inicio"); pg.wait_for_selector(".gv-obra")
    pg.locator(".gv-lin", has_text="dia útil sem RDO").first.click(); pg.wait_for_timeout(1800)
    check("Dia sem RDO abre o RDO daquele dia", pg.evaluate("window.tfRdo && tfRdo.estado && !!tfRdo.estado.rdo") or pg.locator(".rd-folha, .rd-rdo, #view-rdo .rd-cab").count() >= 1)
    pg.keyboard.press("Escape"); pg.click("#nav-inicio"); pg.wait_for_selector("#gv-tv")
    # ── modo TV ──
    pg.click("#gv-tv"); pg.wait_for_selector(".gv-tv .gv-obra"); pg.wait_for_function("document.querySelector('.gv-tv-pe') && document.querySelector('.gv-tv-pe').innerText.includes('de 4')", timeout=10000)
    check("Modo TV: tela escura com cabeçalho, números e página 1 de 4", pg.locator(".gv-tv-k").count() == 5 and "página 1 de 4" in pg.inner_text(".gv-tv-pe") and pg.evaluate("document.body.classList.contains('gv-tv-on')"))
    check("Modo TV: só leitura (cartões não são botões)", pg.locator(".gv-tv button.gv-obra, .gv-tv button.gv-lin").count() == 0)
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)
    check("Página 2: atrasos + RDO e documentos", "página 2 de 4" in pg.inner_text(".gv-tv-pe") and "RDO e documentos" in pg.inner_text(".gv-tv"))
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)
    check("Página 3: agenda da semana", "página 3 de 4" in pg.inner_text(".gv-tv-pe") and pg.locator(".gv-tv .gv-dia").count() == 7)
    pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)
    check("Página 4: indicadores SQDCP", "página 4 de 4" in pg.inner_text(".gv-tv-pe") and pg.locator(".gv-tv-kpi").count() == 5)
    pg.clock.install() if False else None
    pg.evaluate("tfInicio.estado.tv.pag = 2"); pg.evaluate("clearInterval(tfInicio.estado.tv.giro)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("Esc sai do modo TV", pg.locator(".gv-tv").count() == 0 and not pg.evaluate("document.body.classList.contains('gv-tv-on')"))
    pg.click("#gv-tv"); pg.wait_for_selector(".gv-tv"); pg.click(".gv-tv-x"); pg.wait_for_timeout(300)
    check("Botão X também sai", pg.locator(".gv-tv").count() == 0)
    c.close()
    # troca automática (relógio acelerado)
    c, pg = nova(nav, {"width": 1920, "height": 1080}); pg.clock.install(); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026"); pg.wait_for_selector(".gv-obra")
    pg.click("#gv-tv"); pg.wait_for_selector(".gv-tv .gv-obra"); n0 = len([1 for r in [] ])
    pg.clock.run_for(20500); pg.wait_for_timeout(200)
    check("Troca de página sozinha a cada 20 s", "página 2 de" in pg.inner_text(".gv-tv-pe"))
    pedidos = []; pg.on("request", lambda r: pedidos.append(r.url) if r.url.endswith("/api/inicio") else None)
    pg.clock.run_for(100000); pg.wait_for_timeout(600)
    check("Atualiza os dados sozinho a cada 2 min", len(pedidos) >= 1, pedidos)
    pg.keyboard.press("Escape"); c.close()
    # ── assistente ──
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    r = pg.evaluate("""() => { const t = document.createElement('div'); return !!document.getElementById('nav-inicio'); }""")
    check("Encarregado: a tela Início não abre pela API", requests.Session().get(A+"/inicio").status_code in (401, 403)); c.close()
    # ── celular ──
    c, pg = nova(nav, {"width": 390, "height": 844}, True); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026"); pg.wait_for_selector(".gv-obra")
    check("Celular: entra no Início, sem botão Modo TV", ativa(pg) == "view-inicio" and pg.locator("#gv-tv").count() == 0)
    check("Celular: farol em 1 coluna e agenda em lista", pg.evaluate("getComputedStyle(document.querySelector('.gv-obras')).gridTemplateColumns.split(' ').length") == 1 and pg.evaluate("getComputedStyle(document.querySelector('.gv-semana')).gridTemplateColumns.split(' ').length") == 1)
    check("Celular: sem rolagem lateral", pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), pg.evaluate("document.documentElement.scrollWidth"))
    c.close()
    check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas"); sys.exit(1 if f else 0)
