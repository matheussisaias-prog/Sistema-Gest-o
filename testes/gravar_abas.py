import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_crono import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, _ = criar()
def topo(pg): pg.evaluate("window.scrollTo(0, document.querySelector('.og-abas').getBoundingClientRect().top + window.scrollY - 70)"); pg.wait_for_timeout(250)
def roteiro(pg, g, cel):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1000); pg.mouse.move(700, 300)
    pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-lin[data-id], .og-cel-card"); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('.og-abas').scrollIntoView({block:'start'})"); pg.wait_for_timeout(300); g.pausa(900)
    g.clicar(".og-aba >> text=Quadro", depois=300); topo(pg); g.pausa(1500)
    if cel:
        pg.locator(".oq-col[data-sit='Pendente'] .oq-card", has_text="Transformadores").locator(".oq-mover").select_option("Em andamento"); pg.wait_for_timeout(900); g.pausa(1600)
    else:
        pg.locator(".oq-col[data-sit='Pendente'] .oq-card", has_text="Malha").drag_to(pg.locator(".oq-col[data-sit='Em andamento']")); pg.wait_for_timeout(900); g.pausa(2000)
    g.clicar(".og-aba >> text=Equipe", depois=300); pg.wait_for_timeout(700); topo(pg); g.pausa(2000)
    if cel: pg.mouse.wheel(0, 500); pg.wait_for_timeout(300); g.pausa(1400)
    pg.evaluate("document.querySelector('.og-abas').scrollIntoView({block:'start'})"); pg.wait_for_timeout(200)
    g.clicar(".og-aba >> text=Linha de base", depois=300); pg.wait_for_timeout(700); topo(pg); g.pausa(1400)
    g.clicar(".ol-lin .og-link", depois=600); pg.locator(".ol-cmp").scroll_into_view_if_needed(); pg.wait_for_timeout(300); g.pausa(2000)
    if not cel:
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200); g.clicar(".og-aba >> text=Cronograma", depois=500)
        g.clicar(".og-dado .og-link", depois=1500); g.clicar(".oc-jan .ob-bt >> text=Novo calendário", depois=900)
        g.digitar(".oc-jan .ob-campo input", "Padrão Recife/PE", 3); pg.locator(".oc-sw").nth(5).click(); pg.locator(".oc-dia").nth(5).locator("input").fill("4"); pg.wait_for_timeout(200); g.pausa(1400)
        g.clicar(".oc-jan .ob-bt-pri", depois=1500); g.clicar(".oc-jan .ob-bt >> text=Cancelar", depois=2200)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for cel, nome, larg, vp, esc in [(False, "obra-abas-computador", 1100, {"width": 1440, "height": 900}, 1), (True, "obra-abas-celular", 488, {"width": 390, "height": 844}, 1.25)]:
        c = nav.new_context(viewport=vp, device_scale_factor=esc, is_mobile=cel, has_touch=cel); pg = c.new_page(); rotas(pg)
        pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        g = Gravador(pg, larg); roteiro(pg, g, cel); g.salvar(f"/home/claude/gifs/{nome}.gif"); print(nome, len(g.quadros)); c.close()
    nav.close()
