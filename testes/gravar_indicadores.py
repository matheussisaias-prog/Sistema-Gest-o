import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_ind import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
montar()
def roteiro(pg, g, cel):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1000); pg.mouse.move(700, 300)
    pg.evaluate("tfIndicadores.abrir()"); pg.wait_for_selector(".ind-kpi"); pg.wait_for_timeout(700); g.pausa(2200)
    g.clicar(".ind-kpi >> nth=2 >> .ind-info", depois=1600)
    if cel:
        for _ in range(4): pg.mouse.wheel(0, 420); pg.wait_for_timeout(250); g.pausa(700)
    else:
        pg.mouse.wheel(0, 330); pg.wait_for_timeout(300); g.pausa(1600)
        pg.mouse.wheel(0, 380); pg.wait_for_timeout(300); g.pausa(1200)
    g.clicar(".ind-ramo[data-ramo='material'] .ind-ramo-cx", depois=600); pg.locator(".ind-det-ramo").scroll_into_view_if_needed(); pg.wait_for_timeout(300); g.pausa(1800)
    if cel: pg.locator(".ind-ish-box").scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    g.clicar(".ind-ramo[data-ramo='medida'] .ind-ramo-cx", depois=600); pg.locator(".ind-det-ramo").scroll_into_view_if_needed(); pg.wait_for_timeout(300); g.pausa(2000)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for cel, nome, larg, vp, esc in [(False, "indicadores-computador", 1100, {"width": 1440, "height": 900}, 1), (True, "indicadores-celular", 488, {"width": 390, "height": 844}, 1.25)]:
        c = nav.new_context(viewport=vp, device_scale_factor=esc, is_mobile=cel, has_touch=cel, locale="pt-BR"); rotas(c)
        c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page()
        g = Gravador(pg, larg); roteiro(pg, g, cel); g.salvar(f"/home/claude/gifs/{nome}.gif"); print(nome, len(g.quadros)); c.close()
    nav.close()
