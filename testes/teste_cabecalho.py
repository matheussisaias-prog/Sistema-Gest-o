"""Topo e barra lateral: busca de atividades e obras, sininho com avisos, tema escuro lembrado, calendário, Sair e barra lateral."""
import sys
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_ind import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, *_ = montar()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    def entrar(email, senha, vp={"width": 1440, "height": 900}, mob=False):
        c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); rotas(c); c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        pg = c.new_page(); pg.erros = []; pg.on("pageerror", lambda e: pg.erros.append(str(e)))
        pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
        pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(2000); return c, pg
    c, pg = entrar("wendell@rawtech.com.br", "Obra-Segura-2026")
    busca = ".header > .header-search input"
    pg.fill(busca, "malha"); pg.wait_for_timeout(400)
    check("Busca do topo acha a atividade em qualquer obra", pg.locator(".tf-busca .tf-pop-item").count() >= 1 and "Malha de aterramento" in pg.inner_text(".tf-busca"))
    pg.keyboard.press("Enter"); pg.wait_for_selector(".og-painel-fundo, .og-painel", timeout=8000); pg.wait_for_timeout(500)
    check("Enter abre a obra com a atividade aberta", pg.inner_text("#page-title") == "Obra" and pg.locator(".og-painel").count() == 1)
    pg.keyboard.press("Escape"); pg.evaluate("document.querySelector('.og-painel-fundo')?.click()"); pg.wait_for_timeout(300)
    pg.fill(busca, "ELE-014"); pg.wait_for_timeout(400)
    check("Busca também acha obras pelo código", "Obra" in pg.inner_text(".tf-busca") and "ELE-014" in pg.inner_text(".tf-busca"))
    pg.fill(busca, "zzzz"); pg.wait_for_timeout(300)
    check("Busca sem resultado avisa", "Nada encontrado" in pg.inner_text(".tf-busca"))
    pg.fill(busca, ""); pg.evaluate("document.activeElement.blur()"); pg.keyboard.press("/"); pg.wait_for_timeout(200)
    check("Atalho / leva para a busca", pg.evaluate("document.activeElement === document.querySelector('.header > .header-search input')"))
    pg.keyboard.press("Escape"); pg.evaluate("document.activeElement.blur()")
    n = pg.inner_text("#notif-dot")
    check("Sininho com contador de avisos", n.isdigit() and int(n) > 0, n)
    pg.click("#notif-btn"); pg.wait_for_selector(".tf-sino")
    check("Sininho lista Travou, atrasos e RDO, com Ver tudo no Início", "Travou" in pg.inner_text(".tf-sino") and "RDO" in pg.inner_text(".tf-sino") and pg.locator(".tf-pop-pe").count() == 1)
    pg.locator(".tf-sino .tf-pop-item", has_text="Travou").first.click(); pg.wait_for_timeout(1500)
    check("Clicar no aviso abre a obra", pg.inner_text("#page-title") == "Obra")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelectorAll('.og-painel-fundo').forEach(e => e.remove())")
    pg.click(".hdr-cal"); pg.wait_for_timeout(1500)
    check("Botão do calendário abre Empresa › Calendário", pg.inner_text("#page-title") == "Empresa e usuários" and pg.evaluate("tfEmpresa.estado.aba") == "calendario")
    pg.click(".theme-toggle"); pg.reload(); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(500)
    check("Tema escuro continua depois de atualizar", pg.evaluate("document.documentElement.dataset.theme") == "dark" and "claro" in pg.get_attribute(".theme-toggle", "aria-label"))
    pg.click(".theme-toggle")
    pg.hover(".sidebar"); pg.wait_for_timeout(400)
    check("Barra lateral: nomes em português, sem dica sobreposta e quem está logado visível", "acompanhamento" in pg.inner_text(".sidebar").lower() and "Calendário de atividades" in pg.inner_text(".sidebar")
          and pg.evaluate("getComputedStyle(document.querySelector('.sidebar .nav-item'), '::after').display") == "none" and pg.is_visible(".sidebar .user-name") and "Wendell" in pg.inner_text(".sidebar .user-name"))
    check("Ícones diferentes para Atividades/Minhas e Obras/Empresa", pg.evaluate("[...document.querySelectorAll('.sidebar .nav-item:not([hidden]) .nav-icon i')].map(i => i.className).length === new Set([...document.querySelectorAll('.sidebar .nav-item:not([hidden]) .nav-icon i')].map(i => i.className)).size"))
    pg.mouse.move(900, 500)
    pg.evaluate("sessionStorage.setItem('tf-e-teste', '1')"); pg.click("#tf-sair"); pg.wait_for_url("**/entrar.html")
    check("Sair limpa o que estava guardado para o F5", pg.evaluate("Object.keys(sessionStorage).filter(k => k.startsWith('tf-')).length") == 0)
    check("Sem erro de tela (gestão)", not pg.erros, pg.erros); c.close()
    c, pg = entrar("bruno@rawtech.com.br", "Bruno-Costa-2026")
    check("Encarregado não vê o botão de calendário", not pg.is_visible(".hdr-cal"))
    pg.click("#notif-btn"); pg.wait_for_selector(".tf-sino")
    check("Sininho do encarregado sem o atalho da gestão", pg.locator(".tf-pop-pe").count() == 0)
    c.close()
    c, pg = entrar("wendell@rawtech.com.br", "Obra-Segura-2026", {"width": 390, "height": 844}, True)
    pg.click("#notif-btn"); pg.wait_for_selector(".tf-sino")
    check("Celular: sininho cabe na tela", pg.evaluate("(() => { const r = document.querySelector('.tf-sino').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()"))
    c.close(); nav.close()
print(f"RESULTADO: {ok} ok, {f} falhas")
