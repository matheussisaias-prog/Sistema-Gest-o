import sys; sys.path.insert(0, "/home/claude/telas")
import datetime as dt, requests
from comum import rotas
from gravar import Gravador
from dados_rel import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar()
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); mes = {"inicio": hoje.replace(day=1).isoformat(), "fim": hoje.isoformat()}
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
for t in ["recursos", "sst", "gerencial"]: adm.post(A+"/relatorios", json={"tipo": t, **mes})
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=1.25 if mob else 1, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden"); pg.wait_for_timeout(600)
def rolar_doc(g, doc, passos, dy, ms=650):
    for _ in range(passos): doc.mouse.wheel(0, dy); doc.wait_for_timeout(250); g.pausa(ms)
def pc(nav):
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "ana@rawtech.com.br", "Ana-Ribeiro-2026")
    g = Gravador(pg, 1100); pg.mouse.move(700, 400); g.pausa(700)
    g.clicar("#nav-relatorios", depois=300); pg.wait_for_selector(".rl-lin:not(.rl-th)"); pg.wait_for_timeout(300); g.pausa(2600)
    g.clicar(".rl-tipo[data-tipo=obra]", depois=300); pg.wait_for_selector(".rl-frame"); pg.wait_for_function("document.getElementById('rl-resumo').value.length > 50"); pg.wait_for_timeout(900); g.pausa(2600)
    g.clicar(".rl-chips button >> text=Este mês", depois=200); pg.wait_for_timeout(1800); g.pausa(2200)
    pg.mouse.move(1150, 600)
    for _ in range(4): pg.mouse.wheel(0, 420); pg.wait_for_timeout(300); g.pausa(700)
    for _ in range(4): pg.mouse.wheel(0, -420); pg.wait_for_timeout(200)
    g.pausa(300)
    g.clicar(".rl-chk:has-text('RDOs do período') input", depois=200); pg.wait_for_timeout(1400); g.pausa(900)
    pg.click("#rl-resumo"); pg.keyboard.press("Control+End"); g.pausa(300)
    for parte in [" Na próxima", " semana o cliente", " libera o acesso", " à cabine."]: pg.keyboard.type(parte); g.foto(90)
    pg.wait_for_timeout(1800); g.pausa(1600)
    pg.hover("#rl-emitir"); g.pausa(500)
    with pg.context.expect_page() as nova_aba: pg.click("#rl-emitir")
    doc = nova_aba.value; doc.set_viewport_size({"width": 1440, "height": 900}); doc.wait_for_load_state(); doc.wait_for_timeout(700)
    g.pg = doc; g.pausa(2400); doc.mouse.move(720, 500); rolar_doc(g, doc, 6, 380, 800); g.pausa(900)
    doc.close(); g.pg = pg; pg.wait_for_selector(".rl-lin:not(.rl-th) >> nth=3"); pg.wait_for_timeout(500); g.pausa(2400)
    g.clicar(".rl-tipo[data-tipo=gerencial]", depois=300); pg.wait_for_selector(".rl-frame"); pg.wait_for_timeout(2500); g.pausa(3000)
    g.clicar(".eq-voltar", depois=1600)
    g.salvar("/home/claude/gifs/relatorios-computador.gif"); print("computador", len(g.quadros)); c.close()
def cel(nav):
    c, pg = nova(nav, {"width": 390, "height": 844}, True); entrar(pg, "ana@rawtech.com.br", "Ana-Ribeiro-2026")
    g = Gravador(pg, 488); pg.evaluate("tfRelatorios.abrir()"); pg.wait_for_selector(".rl-card"); pg.wait_for_timeout(400); g.pausa(2000)
    pg.locator(".rl-card").first.scroll_into_view_if_needed(); pg.wait_for_timeout(200); g.pausa(1500)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200); g.pausa(400)
    g.clicar(".rl-tipo[data-tipo=obra]", depois=300); pg.wait_for_function("document.getElementById('rl-resumo') && document.getElementById('rl-resumo').value.length > 50"); pg.wait_for_timeout(500); g.pausa(1800)
    g.clicar(".rl-chips button >> text=Este mês", depois=200); pg.wait_for_timeout(1500); g.pausa(1200)
    for y in (300, 650, 1000): pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(250); g.pausa(900)
    g.clicar("button >> text=Ver prévia", depois=300); pg.wait_for_selector(".rl-tela .rl-frame"); pg.wait_for_timeout(1200); g.pausa(1800)
    fr = pg.frame_locator(".rl-tela .rl-frame")
    for _ in range(5): fr.locator("body").evaluate("b => b.ownerDocument.defaultView.scrollBy(0, 520)"); pg.wait_for_timeout(250); g.pausa(800)
    g.clicar(".rl-tela button >> text=Fechar", depois=500)
    pg.locator("#rl-emitir").scroll_into_view_if_needed(); pg.wait_for_timeout(200); g.pausa(700)
    with pg.context.expect_page() as nova_aba: pg.click("#rl-emitir")
    doc = nova_aba.value; doc.wait_for_load_state(); doc.set_viewport_size({"width": 390, "height": 844}); doc.wait_for_timeout(600)
    g.pg = doc; g.pausa(1800)
    for _ in range(4): doc.evaluate("window.scrollBy(0, 500)"); doc.wait_for_timeout(250); g.pausa(800)
    doc.close(); g.pg = pg; pg.wait_for_selector(".rl-card >> nth=3"); pg.wait_for_timeout(400); pg.evaluate("window.scrollTo(0,0)"); g.pausa(1200)
    pg.locator(".rl-card").first.scroll_into_view_if_needed(); pg.wait_for_timeout(200); g.pausa(2200)
    g.salvar("/home/claude/gifs/relatorios-celular.gif"); print("celular", len(g.quadros)); c.close()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    pc(nav); cel(nav)
