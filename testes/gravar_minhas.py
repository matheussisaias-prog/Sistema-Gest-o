import sys, requests; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_crono import criar
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
B = "http://127.0.0.1:8900"; A = B + "/api"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
for nome, cor in [("foto1", (96, 110, 124)), ("foto2", (120, 98, 80))]:   # "fotos" de obra para a gravação
    im = Image.new("RGB", (1600, 1200), cor); d = ImageDraw.Draw(im)
    for k in range(0, 1600, 160): d.rectangle([k, 700, k + 90, 1200], fill=(70, 75, 80)); d.line([k, 0, k + 400, 700], fill=(150, 150, 140), width=14)
    im.save(f"/tmp/{nome}.jpg", "JPEG", quality=85)
pid, ids = criar()
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]"); pg.wait_for_url("**/index.html"); pg.wait_for_selector(".mi-card, .tf-user"); pg.wait_for_selector("#loader", state="hidden", timeout=8000); pg.wait_for_timeout(600)
card = lambda pg, t: pg.locator(".mi-card", has_text=t).first
def cel(nav):
    c = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1.25, is_mobile=True, has_touch=True, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    g = Gravador(pg, 488); entrar(pg, "carla@rawtech.com.br", "Carla-Mendes-2026"); g.pausa(2200)
    g.clicar(".mi-card:has-text('Eletrodutos') .mi-bt[aria-label='Aumentar 10%']", depois=1400)
    pg.set_input_files(".mi-folha input[type=file]", "/tmp/foto1.jpg"); pg.wait_for_selector(".mi-mini"); pg.wait_for_timeout(300); g.pausa(1300)
    g.digitar(".mi-folha textarea", "Trecho A pronto", 3); g.clicar(".mi-folha .mi-bt-pri", depois=300)
    pg.wait_for_function("[...document.querySelectorAll('.mi-card')].some(c => c.innerText.includes('Eletrodutos') && c.innerText.includes('com foto'))"); pg.wait_for_timeout(400); g.pausa(1800)
    card(pg, "Malha").scroll_into_view_if_needed(); g.clicar(".mi-card:has-text('Malha') .mi-travou", depois=1000)
    g.clicar(".mi-motivos button >> text=Falta material", depois=500); g.digitar(".mi-folha textarea", "Faltam 40 caixas 4x4", 4); g.pausa(500)
    g.clicar(".mi-folha .mi-bt-pri", depois=300); pg.wait_for_function("[...document.querySelectorAll('.mi-trav')].some(t => t.innerText.includes('avisado às'))"); pg.wait_for_timeout(300)
    card(pg, "Malha").scroll_into_view_if_needed(); g.pausa(2000)
    c.set_offline(True); pg.wait_for_selector(".mi-aviso"); pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300); g.pausa(1500)
    card(pg, "Malha").scroll_into_view_if_needed(); g.clicar(".mi-card:has-text('Malha') .mi-bt[aria-label='Aumentar 10%']", depois=900)
    pg.set_input_files(".mi-folha input[type=file]", "/tmp/foto2.jpg"); pg.wait_for_selector(".mi-mini"); pg.wait_for_timeout(300); g.pausa(1200)
    g.clicar(".mi-folha .mi-bt-pri", depois=300); pg.wait_for_function("document.querySelector('.mi-aviso') && document.querySelector('.mi-aviso').innerText.includes('guardada')")
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300); g.pausa(1600); card(pg, "Malha").scroll_into_view_if_needed(); pg.wait_for_timeout(200); g.pausa(1600)
    c.set_offline(False); pg.wait_for_function("!document.querySelector('.mi-aviso')", timeout=20000); pg.wait_for_timeout(600)
    pg.evaluate("window.scrollTo(0,0)"); g.pausa(2400)
    g.salvar("/home/claude/gifs/minhas-celular.gif"); print("celular", len(g.quadros)); c.close()
def pc(nav):
    c = nav.new_context(viewport={"width": 1440, "height": 900}, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    g = Gravador(pg, 1100); entrar(pg, "bruno@rawtech.com.br", "Bruno-Costa-2026"); pg.mouse.move(700, 400); g.pausa(1800)
    g.clicar(".mi-seg button >> text=Da minha equipe", depois=1800)
    g.clicar(".mi-card:has-text('Base dos transformadores') .mi-bt[aria-label='Aumentar 10%']", depois=1500)
    g.clicar(".mi-card:has-text('Malha') .mi-trav button", depois=1800)
    c.close()
    c = nav.new_context(viewport={"width": 1440, "height": 900}, locale="pt-BR"); pg2 = c.new_page(); rotas(pg2)
    pg2.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    s = requests.Session(); s.post(A+"/entrar", json={"email": "carla@rawtech.com.br", "senha": "Carla-Mendes-2026"}); s.post(A+f"/atividades/{ids['a23']}/impedimento", json={"motivo": "clima", "descricao": "Chuva forte desde as 7h"})
    entrar(pg2, "wendell@rawtech.com.br", "Obra-Segura-2026"); pg2.evaluate(f"tfObra.abrir({pid})"); pg2.wait_for_selector(".og-lin[data-id]"); pg2.wait_for_timeout(600)
    g2 = Gravador(pg2, 1100); g2.pausa(1600)
    g2.clicar(".og-esq .og-lin:has-text('Malha de aterramento') .og-abre", depois=300); pg2.wait_for_selector(".og-fotos img"); pg2.wait_for_timeout(800); g2.pausa(2600)
    g2.clicar(".og-p-trav button", depois=1800)
    g.quadros += g2.quadros; g.salvar("/home/claude/gifs/minhas-computador.gif"); print("computador", len(g.quadros)); c.close()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    cel(nav)
    s = requests.Session(); s.post(A+"/entrar", json={"email": "carla@rawtech.com.br", "senha": "Carla-Mendes-2026"})
    pc(nav); nav.close()
