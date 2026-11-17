import sys, requests, datetime as dt; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_ind import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar()
s = requests.Session(); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
s.patch(A+f"/projetos/{pid}", json={"orcamento": 360000})
for v, cat in [(42000, 'Mão de obra'), (65000, 'Material'), (9000, 'Equipamento')]: s.post(A+f"/obras/{pid}/custos", json={"data": str(dt.date.today()-dt.timedelta(days=3)), "categoria": cat, "descricao": "NF " + cat, "valor": v})
def entrar(pg):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1800); pg.mouse.move(700, 300)
def r_ind(pg, g, cel):
    entrar(pg); pg.evaluate("tfIndicadores.abrir()"); pg.wait_for_selector(".ind-kpi"); pg.wait_for_timeout(800); g.pausa(2200)
    g.clicar(".ind-kpi >> nth=2", depois=1800); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    for _ in range(3 if not cel else 6): pg.mouse.wheel(0, 420); pg.wait_for_timeout(250); g.pausa(900)
    if not cel: g.clicar(".ind-ramo[data-ramo='material'] .ind-ramo-cx", depois=600); pg.locator(".ind-det-ramo").scroll_into_view_if_needed(); g.pausa(1600)
    for _ in range(3): pg.mouse.wheel(0, 500); pg.wait_for_timeout(250); g.pausa(900)
def r_plano(pg, g, cel):
    entrar(pg); pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-abas")
    pg.evaluate("document.querySelector('.og-abas').scrollIntoView({block:'start'})"); g.clicar(".og-aba >> text=Plano", depois=900); g.pausa(1200)
    pg.locator(".op-cand input[type=checkbox]").nth(0).check(); pg.locator(".op-cand input[type=checkbox]").nth(1).check(); pg.locator(".op-pe").scroll_into_view_if_needed(); g.pausa(900)
    g.clicar(".op-pe .ob-bt", depois=1500); pg.evaluate("document.querySelector('.og-abas').scrollIntoView({block:'start'})"); g.pausa(1200)
    g.clicar(".og-aba >> text=Custos", depois=1200); g.pausa(1400)
    pg.locator(".op-form").scroll_into_view_if_needed(); pg.fill(".op-form input[placeholder*='NF']", "NF 88 · eletrocalhas"); pg.fill(".op-form input[placeholder='Valor R$']", "18000"); g.pausa(900)
    g.clicar(".op-form button[type=submit]", depois=1500); pg.evaluate("window.scrollTo(0, document.querySelector('.op-ks').getBoundingClientRect().top + scrollY - 80)"); g.pausa(1800)
def r_topo(pg, g, cel):
    entrar(pg); g.pausa(1000)
    g.clicar("#notif-btn", depois=1500); g.pausa(1200); pg.keyboard.press("Escape")
    if not cel:
        pg.click(".header > .header-search input"); pg.keyboard.type("malha", delay=120); pg.wait_for_timeout(500); g.pausa(1400)
        pg.keyboard.press("Enter"); pg.wait_for_timeout(1800); g.pausa(1400); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.mouse.move(25, 400); pg.wait_for_timeout(500); g.pausa(1500); pg.mouse.move(800, 400)
    if not cel: g.clicar(".theme-toggle", depois=800)
    else: pg.evaluate("toggleTheme()"); pg.wait_for_timeout(500)
    pg.evaluate("tfIndicadores.abrir()"); pg.wait_for_selector(".ind-kpi"); pg.wait_for_timeout(800); g.pausa(1800)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for nome, rot in [x for x in [("indicadores", r_ind), ("plano-custos", r_plano), ("topo-sino-tema", r_topo)] if len(sys.argv) < 2 or x[0] == sys.argv[1]]:
        for cel, suf, larg, vp, esc in [(False, "computador", 1100, {"width": 1440, "height": 900}, 1), (True, "celular", 488, {"width": 390, "height": 844}, 1.25)]:
            c = nav.new_context(viewport=vp, device_scale_factor=esc, is_mobile=cel, has_touch=cel, locale="pt-BR"); rotas(c)
            c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page()
            g = Gravador(pg, larg); rot(pg, g, cel); g.salvar(f"/home/claude/gifs/{nome}-{suf}.gif"); print(nome, suf, len(g.quadros)); c.close()
    nav.close()
