import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_crono import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
criar()
def roteiro(pg, g, cel):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1200)
    pg.mouse.move(700, 300); pg.evaluate("switchView('obras', document.getElementById('nav-obras'))"); pg.wait_for_selector(".ob-card"); pg.wait_for_timeout(400); g.pausa(1200)
    g.clicar(".ob-card .ob-abrir", depois=300); pg.wait_for_selector(".og-cab"); pg.wait_for_timeout(700); g.pausa(2600)
    if cel:
        for _ in range(2): pg.mouse.wheel(0, 420); pg.wait_for_timeout(350); g.pausa(900)
        g.clicar(".og-cel-card:has-text('Eletrodutos') button[aria-label='Aumentar 10%']", depois=1600)
        g.clicar(".og-cel-card:has-text('Eletrodutos') button[aria-label='Aumentar 10%']", depois=1600)
        pg.evaluate("window.scrollTo(0, 450)"); pg.wait_for_timeout(300)
        g.clicar(".og-chips .ob-chip >> text=Atrasadas", depois=1600); g.clicar(".og-chips .ob-chip >> text=Todas", depois=400)
        g.clicar(".og-cel-card:has-text('Base dos') .og-cel-topo", depois=1800)
        pg.locator(".og-preds").scroll_into_view_if_needed(); pg.wait_for_timeout(300); g.pausa(1800)
        return
    pg.mouse.wheel(0, 300); pg.wait_for_timeout(300); g.pausa(1500)
    g.clicar(".og-lin.etapa .og-tog >> nth=0", depois=1100); g.clicar(".og-lin.etapa .og-tog >> nth=0", depois=600)
    pg.locator(".og-lin[data-id]:has-text('Base dos transformadores') .c-dur").click(); pg.wait_for_timeout(200); g.pausa(500)
    pg.fill(".og-inp", ""); g.digitar(".og-inp", "13", 1); pg.keyboard.press("Enter"); pg.wait_for_selector(".og-modal"); pg.wait_for_timeout(300); g.pausa(2600)
    g.clicar(".og-modal .ob-bt-pri", depois=300); pg.wait_for_selector(".og-modal", state="detached"); pg.wait_for_timeout(900); g.pausa(2000)
    pg.click(".og-nova-inp"); g.digitar(".og-nova-inp", "Limpeza final", 3); pg.keyboard.press("Enter"); pg.wait_for_timeout(900); g.pausa(1200)
    pg.keyboard.press("Tab"); pg.wait_for_timeout(300); g.digitar(".og-nova-inp", "Retirada de entulho", 3); pg.keyboard.press("Enter"); pg.wait_for_timeout(900); g.pausa(1500)
    pg.locator(".og-lin[data-id]:has-text('Malha de aterramento') .og-abre").click(force=True); pg.wait_for_selector(".og-painel"); pg.wait_for_timeout(500); g.pausa(1800)
    pg.fill(".og-painel input[placeholder='ex.: 5d']", ""); g.digitar(".og-painel input[placeholder='ex.: 5d']", "14d", 1); pg.wait_for_selector(".og-aviso:not([hidden])"); pg.wait_for_timeout(300); g.pausa(2800)
    g.clicar(".og-p-pe .ob-bt >> text=Cancelar", depois=900)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for cel, nome, larg, vp, esc in [(False, "obra-aberta-computador", 1100, {"width": 1440, "height": 900}, 1), (True, "obra-aberta-celular", 488, {"width": 390, "height": 844}, 1.25)]:
        c = nav.new_context(viewport=vp, device_scale_factor=esc, is_mobile=cel, has_touch=cel); pg = c.new_page(); rotas(pg)
        pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        g = Gravador(pg, larg); roteiro(pg, g, cel); g.salvar(f"/home/claude/gifs/{nome}.gif"); print(nome, len(g.quadros)); c.close()
    nav.close()
