"""F5 em todo o site: atualizar a página volta na mesma tela, com o mesmo registro aberto, aba e filtros."""
import sys
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_rel import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar(); rd = rd["fech"]
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    c = nav.new_context(viewport={"width": 1440, "height": 900}, locale="pt-BR"); rotas(c)
    c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page(); erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1200)
    def f5(): pg.reload(); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1800)
    tela = lambda: pg.inner_text("#page-title")
    # obra: aba Equipe da obra
    pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-cab h1"); pg.click(".og-aba >> text=Equipe"); pg.wait_for_timeout(800); f5()
    check("Obra: volta na mesma obra e na aba Equipe", tela() == "Obra" and pg.evaluate("tfObra.estado.id") == pid and pg.evaluate("tfObra.estado.aba") == "equipe", pg.evaluate("tfObra.estado.aba"))
    # equipe: filtro de cargo e ficha aberta
    pg.evaluate("tfEquipe.abrir()"); pg.wait_for_timeout(1200)
    pg.evaluate("tfEquipe.estado.filtro.cargo = 'Eletricista'; tfEquipe.abrir()"); pg.wait_for_timeout(1000); f5()
    check("Equipe: filtro de cargo continua", tela() == "Equipe" and pg.evaluate("tfEquipe.estado.filtro.cargo") == "Eletricista")
    fid = pg.evaluate("tfEquipe.estado.d.pessoas ? tfEquipe.estado.d.pessoas[0].id : tfEquipe.estado.d.funcionarios[0].id")
    pg.evaluate(f"tfEquipe.abrirFicha({fid})"); pg.wait_for_timeout(1200); f5()
    check("Equipe: a ficha aberta continua aberta", pg.evaluate("tfEquipe.estado.ficha") == fid, pg.evaluate("tfEquipe.estado.ficha"))
    # recursos: mapa de reservas e filtro
    pg.evaluate("tfRecursos.abrir()"); pg.wait_for_timeout(1000); pg.evaluate("tfRecursos.estado.filtro.tipo = 'Veículo'; tfRecursos.estado.modo = 'mapa'; tfRecursos.abrir()"); pg.wait_for_timeout(1500); f5()
    check("Recursos: mapa de reservas e filtro continuam", tela() == "Recursos" and pg.evaluate("tfRecursos.estado.modo") == "mapa" and pg.evaluate("tfRecursos.estado.filtro.tipo") == "Veículo")
    # RDO aberto
    pg.evaluate(f"tfRdo.abrirRdo({rd})"); pg.wait_for_timeout(1500); f5()
    check("RDO: o mesmo RDO continua aberto", tela() == "RDO" and pg.evaluate("document.querySelector('#view-rdo').innerText.length") > 50 and pg.evaluate("JSON.parse(sessionStorage.getItem('tf-e-rdo')).id") == rd)
    # empresa: aba
    pg.evaluate("tfEmpresa.abrir('calendario')"); pg.wait_for_timeout(1200); aba = pg.evaluate("tfEmpresa.estado.aba"); f5()
    check("Empresa: mesma aba", pg.evaluate("tfEmpresa.estado.aba") == aba and aba != "usuarios", aba)
    # histórico: período
    pg.evaluate("tfHistorico.abrir()"); pg.wait_for_timeout(1000); pg.evaluate("tfHistorico.estado.f.per = '30'; tfHistorico.abrir()"); pg.wait_for_timeout(1000); f5()
    check("Histórico: filtro de período continua", tela() == "Histórico" and pg.evaluate("tfHistorico.estado.f.per") == "30")
    # gantt (tela antiga): filtro de situação
    pg.evaluate("switchView('gantt', document.querySelector(`.sidebar [onclick*=\"'gantt'\"]`))"); pg.wait_for_timeout(800)
    pg.select_option("#gantt-f-status", index=1); val = pg.input_value("#gantt-f-status"); pg.wait_for_timeout(300); f5()
    check("Gantt: filtro de situação continua", tela() == "Gantt" and pg.input_value("#gantt-f-status") == val and val != "", val)
    # calendário: mesmo mês
    pg.evaluate("switchView('cal-atividades', document.querySelector(`.sidebar [onclick*=\"'cal-atividades'\"]`))"); pg.wait_for_timeout(600)
    pg.locator("#cal-ativ-wrap .cal-header button").last.click(); pg.locator("#cal-ativ-wrap .cal-header button").last.click(); pg.wait_for_timeout(300)
    mes = pg.inner_text("#cal-ativ-wrap .cal-title"); f5()
    check("Calendário: volta no mesmo mês", pg.inner_text("#cal-ativ-wrap .cal-title") == mes, mes + " → " + pg.inner_text("#cal-ativ-wrap .cal-title"))
    check("Sem erro de tela", not [e for e in erros if "Chart" not in e], erros)
    c.close()
    # aba nova não herda nada
    n = nav.new_context(viewport={"width": 1440, "height": 900}); rotas(n); q = n.new_page()
    q.goto(B+"/entrar.html"); q.fill("#e-email", "wendell@rawtech.com.br"); q.fill("#e-senha", "Obra-Segura-2026"); q.click("#f-entrar button[type=submit]")
    q.wait_for_url("**/index.html"); q.wait_for_selector(".tf-user"); q.wait_for_timeout(1500)
    check("Aba nova começa pelo Início", q.locator("#view-inicio.active").count() == 1); n.close()
    nav.close()
print(f"RESULTADO: {ok} ok, {f} falhas")
