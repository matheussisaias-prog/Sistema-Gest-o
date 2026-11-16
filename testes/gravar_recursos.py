import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_recursos import montar
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
B = "http://127.0.0.1:8900"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
open("/tmp/calib.pdf", "wb").write(b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF")
im = Image.new("RGB", (1600, 1130), (246, 244, 236)); d = ImageDraw.Draw(im)   # "foto" de um certificado de calibração
d.rectangle([60, 60, 1540, 1070], outline=(30, 90, 60), width=18)
for y in range(300, 900, 90): d.line([220, y, 1380, y], fill=(150, 150, 160), width=10)
im.save("/tmp/certificado-cal.jpg", "JPEG", quality=85)
pid, p2, ids, R = montar()
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=1.25 if mob else 1, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden"); pg.wait_for_timeout(500)
def pc(nav):
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g = Gravador(pg, 1100); pg.mouse.move(700, 400); g.pausa(900)
    pg.evaluate("tfRecursos.abrir()"); pg.wait_for_selector(".rc-card"); pg.wait_for_timeout(400); g.pausa(2400)
    g.clicar(".eq-kpi.verm", depois=1500); g.clicar(".eq-kpi.verm", depois=400)
    g.clicar(".rc-modo button >> text=Mapa de reservas", depois=300); pg.wait_for_selector(".rc-m-b"); pg.wait_for_timeout(400); g.pausa(3200)
    g.clicar(".rc-m-nome >> text=PLT-02", depois=300); pg.wait_for_selector(".rc-loc"); pg.wait_for_timeout(300); g.pausa(2800)
    g.clicar("button >> text=Estender locação", depois=1300); g.clicar(".eq-jan .eq-bt.pri", depois=300)
    pg.wait_for_selector(".eq-jan", state="detached"); pg.wait_for_function("!document.querySelector('.rc-geral .eq-nota')"); pg.wait_for_timeout(300); g.pausa(1800)
    g.clicar(".eq-voltar", depois=300); pg.wait_for_selector(".rc-mapa"); g.clicar(".rc-modo button >> text=Cartões", depois=300); pg.wait_for_selector(".rc-card")
    g.clicar(".rc-card >> text=Megômetro", depois=300); pg.wait_for_selector(".rc-alerta"); pg.wait_for_timeout(300); g.pausa(1800)
    g.clicar(".rc-ctrl .eq-bt >> text=Renovar", depois=900)
    pg.fill(".eq-jan input[aria-label='Feito em']", pg.evaluate("tfRecursos.estado.f.hoje")); g.pausa(400)
    g.digitar(".eq-jan input[aria-label=Instituição]", "Lab. Metrologia PE", 4)
    pg.set_input_files(".eq-jan input[type=file]", "/tmp/calib.pdf"); pg.wait_for_timeout(300); g.pausa(900)
    g.clicar(".eq-jan .eq-bt.pri", depois=300); pg.wait_for_selector(".rc-ctrl.ok"); pg.wait_for_timeout(300); g.pausa(2200)
    pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-lin[data-id]"); pg.wait_for_timeout(600); g.pausa(1000)
    g.clicar(".og-esq .og-lin:has-text('Montagem do transformador 1') .og-abre", depois=300); pg.wait_for_selector(".og-rec-sel"); pg.wait_for_timeout(400)
    pg.locator(".og-rec-sel").scroll_into_view_if_needed(); g.pausa(1400)
    pg.locator(".og-rec-sel").select_option(str(R["MUN-01"])); pg.wait_for_selector("#og-rec-t"); pg.wait_for_timeout(300); g.pausa(3400)
    g.clicar(".og-rec-sug", depois=300); pg.wait_for_selector(".og-rec .og-exig-chip"); pg.wait_for_timeout(500); g.pausa(2600)
    g.salvar("/home/claude/gifs/recursos-computador.gif"); print("computador", len(g.quadros)); c.close()
def cel(nav):
    c, pg = nova(nav, {"width": 390, "height": 844}, True); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g = Gravador(pg, 488); pg.evaluate("tfRecursos.abrir()"); pg.wait_for_selector(".rc-card"); pg.wait_for_timeout(400); g.pausa(2200)
    g.clicar(".rc-chips button >> text=Vencidos", depois=1600)
    g.clicar(".rc-chips button >> text=Todos", depois=500)
    pg.locator(".rc-card", has_text="Terrômetro").scroll_into_view_if_needed(); g.pausa(900)
    g.clicar(".rc-card >> text=Terrômetro", depois=300); pg.wait_for_selector(".eq-ficha-cab"); pg.wait_for_timeout(300); g.pausa(2000)
    g.clicar(".eq-abas button >> text=Calibração", depois=1500)
    g.clicar(".rc-ctrl .eq-bt >> text=Renovar", depois=900)
    pg.fill(".eq-jan input[aria-label='Feito em']", pg.evaluate("tfRecursos.estado.f.hoje")); g.pausa(500)
    pg.set_input_files(".eq-jan input[type=file]", "/tmp/certificado-cal.jpg"); pg.wait_for_timeout(500)
    pg.locator(".eq-jan .eq-bt.pri").scroll_into_view_if_needed(); g.pausa(1200)
    g.clicar(".eq-jan .eq-bt.pri", depois=300); pg.wait_for_selector(".rc-ctrl.ok"); pg.wait_for_timeout(400); pg.evaluate("window.scrollTo(0,0)"); g.pausa(2200)
    pg.locator(".rc-ctrl.ok").first.scroll_into_view_if_needed(); g.pausa(2000)
    g.clicar(".eq-voltar", depois=300); pg.wait_for_selector(".rc-card"); pg.wait_for_timeout(300); g.pausa(2000)
    g.salvar("/home/claude/gifs/recursos-celular.gif"); print("celular", len(g.quadros)); c.close()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    cel(nav); pc(nav); nav.close()
