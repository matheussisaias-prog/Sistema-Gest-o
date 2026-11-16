import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_rdo import montar
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
B = "http://127.0.0.1:8900"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
im = Image.new("RGB", (1000, 1400), (248, 247, 242)); d = ImageDraw.Draw(im)      # "foto" da folha assinada
d.rectangle([60, 60, 940, 200], outline=(15, 61, 110), width=6)
for y in range(260, 1150, 60): d.line([80, y, 920, y], fill=(170, 170, 175), width=6)
d.line([560, 1290, 900, 1290], fill=(20, 20, 20), width=4); d.line([600, 1270, 700, 1230, 760, 1280, 840, 1240], fill=(20, 40, 120), width=5)
im.save("/tmp/folha-assinada.jpg", "JPEG", quality=85)
pid, p2, ids, R, rd = montar()
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=1.25 if mob else 1, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden"); pg.wait_for_timeout(600)
def cel(nav):
    c, pg = nova(nav, {"width": 390, "height": 844}, True); entrar(pg, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    g = Gravador(pg, 488); pg.wait_for_selector(".mi-rdo"); g.pausa(1800)
    g.clicar(".mi-rdo", depois=300); pg.wait_for_selector(".rd-serv"); pg.wait_for_timeout(400); g.pausa(2000)
    pg.locator(".rd-clima").first.scroll_into_view_if_needed(); g.pausa(600)
    g.clicar(".rd-clima >> nth=0 >> button >> text=Bom", depois=500); g.clicar(".rd-clima >> nth=1 >> button >> text=Chuva", depois=700)
    pg.locator(".rd-pes").first.scroll_into_view_if_needed(); pg.wait_for_timeout(200); g.pausa(900)
    g.clicar(".rd-pes:has-text('Carla Mendes') input", depois=900)
    g.digitar(".rd-terc input[type=number]", "4", 1); pg.locator(".rd-terc input[type=number]").dispatch_event("change"); pg.wait_for_timeout(500); g.pausa(500)
    g.digitar(".rd-terc input[type=text]", "Elétrica Silva", 4); pg.locator(".rd-terc input[type=text]").dispatch_event("change"); pg.wait_for_timeout(500); g.pausa(900)
    pg.locator(".rd-serv").first.scroll_into_view_if_needed(); g.pausa(1800)
    pg.locator(".rd-pad textarea").scroll_into_view_if_needed(); g.digitar(".rd-pad textarea", "Visita do fiscal às 10h.", 4); pg.locator(".rd-pad textarea").dispatch_event("change"); pg.wait_for_timeout(500)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200); g.pausa(700)
    g.clicar("button >> text=Enviar para o gestor", depois=300); pg.wait_for_selector(".rd-aviso.ok"); pg.wait_for_timeout(400); g.pausa(2400)
    g.salvar("/home/claude/gifs/rdo-celular.gif"); print("celular", len(g.quadros)); c.close()
def pc(nav):
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g = Gravador(pg, 1100); pg.mouse.move(700, 400); g.pausa(800)
    pg.evaluate("tfRdo.abrir()"); pg.wait_for_selector(".rd-dia"); pg.wait_for_timeout(500); g.pausa(2600)
    g.clicar(".rd-pend button:has-text('enviado')", depois=300); pg.wait_for_selector(".rd-serv"); pg.wait_for_timeout(500); g.pausa(2800)
    g.clicar("button >> text=Fechar e gerar PDF", depois=1300)
    with pg.context.expect_page() as pop: pg.click(".eq-jan .eq-bt.pri")
    doc = pop.value; doc.set_viewport_size({"width": 1440, "height": 900}); doc.wait_for_load_state(); doc.evaluate("window.print = () => {}"); doc.wait_for_timeout(900)
    gd = Gravador(doc, 1100); gd.pausa(2600); doc.mouse.wheel(0, 500); doc.wait_for_timeout(400); gd.pausa(2200); doc.mouse.wheel(0, 700); doc.wait_for_timeout(400); gd.pausa(2200); doc.close()
    g.quadros += gd.quadros
    pg.wait_for_selector("button >> text=Marcar como entregue"); pg.wait_for_timeout(300); g.pausa(1400)
    g.clicar("button >> text=Marcar como entregue", depois=900); g.clicar(".eq-jan .eq-bt.pri", depois=300); pg.wait_for_selector(".rd-step .atual >> text=Entregue"); g.pausa(1200)
    g.clicar("button >> text=Anexar folha assinada", depois=800)
    pg.set_input_files(".eq-jan input[type=file]", "/tmp/folha-assinada.jpg"); pg.wait_for_selector(".rd-prev img"); pg.wait_for_timeout(300); g.pausa(900)
    g.digitar(".eq-jan input[aria-label='Quem assinou']", "Eng. Paulo Andrade", 4); g.pausa(500)
    g.clicar(".eq-jan .eq-bt.pri", depois=300); pg.wait_for_selector(".rd-aviso.ok >> text=ver folha assinada"); pg.wait_for_timeout(400); g.pausa(2400)
    g.clicar(".eq-voltar", depois=300); pg.wait_for_selector(".rd-dia"); pg.wait_for_timeout(400); g.pausa(1600)
    g.clicar("button >> text=Logo da empresa", depois=300); pg.wait_for_selector(".rd-logo-prev img"); pg.wait_for_timeout(500); g.pausa(2600)
    g.salvar("/home/claude/gifs/rdo-computador.gif"); print("computador", len(g.quadros)); c.close()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    cel(nav); pc(nav); nav.close()
