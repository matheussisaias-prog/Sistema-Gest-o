import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_equipe import montar
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
B = "http://127.0.0.1:8900"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
open("/tmp/nr33.pdf", "wb").write(b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF")
im = Image.new("RGB", (1600, 1130), (245, 242, 232)); d = ImageDraw.Draw(im)   # "foto" de um certificado
d.rectangle([60, 60, 1540, 1070], outline=(40, 70, 120), width=18)
for y in range(320, 900, 90): d.line([220, y, 1380, y], fill=(150, 150, 160), width=10)
im.save("/tmp/certificado.jpg", "JPEG", quality=85)
pid, ids, F = montar()
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=1.25 if mob else 1, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden"); pg.wait_for_timeout(500)
def pc(nav):
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g = Gravador(pg, 1100); pg.mouse.move(700, 400); g.pausa(1000)
    g.clicar("#nav-pessoas", depois=300); pg.wait_for_selector(".eq-card"); pg.wait_for_timeout(400); g.pausa(2200)
    g.clicar(".eq-kpi.verm", depois=1800); g.clicar(".eq-kpi.verm", depois=500)
    g.clicar(".eq-card >> text=Carla Mendes", depois=300); pg.wait_for_selector(".eq-doc"); pg.wait_for_timeout(300); g.pausa(2200)
    g.clicar(".eq-doc.falta .eq-bt", depois=1200)
    pg.fill(".eq-jan input[type=date]", "2026-11-02"); g.pausa(500); g.digitar(".eq-jan input[placeholder='Ex.: SENAI']", "SENAI", 2)
    pg.set_input_files(".eq-jan input[type=file]", "/tmp/nr33.pdf"); pg.wait_for_timeout(300); g.pausa(1200)
    g.clicar(".eq-jan .eq-bt.pri", depois=300); pg.wait_for_function("!document.querySelector('.eq-doc.falta')"); pg.wait_for_timeout(300); g.pausa(2200)
    g.clicar(".eq-abas button >> text=Agenda", depois=2000)
    g.clicar(".eq-abas button >> text=Ausências", depois=1600)
    g.clicar(".eq-voltar", depois=300); pg.wait_for_selector(".eq-card"); g.pausa(700)
    g.clicar("button >> text=Cargos e documentos exigidos", depois=1500)
    g.clicar(".eq-cg >> text=Ajudante", depois=900); g.digitar(".eq-cg-docs > input", "nr-10", 2); g.pausa(500)
    g.clicar(".eq-cg-item:has-text('NR-10 Básico') input", depois=900); g.clicar(".eq-jan .eq-acoes .eq-bt.pri", depois=1300)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-lin[data-id]"); pg.wait_for_timeout(600); g.pausa(1400)
    g.clicar(".og-esq .og-lin:has-text('Base dos transformadores') .og-abre", depois=300); pg.wait_for_selector(".og-exig-sel"); pg.wait_for_timeout(300); g.pausa(1200)
    pg.locator(".og-exig-sel").select_option(label="NR-35 · Trabalho em altura"); pg.wait_for_selector(".og-exig-chip"); pg.wait_for_timeout(300); g.pausa(1500)
    pg.locator(".og-painel label", has_text="Responsável").locator("select").select_option(str(F["Marcos"])); pg.wait_for_timeout(200); g.pausa(900)
    g.clicar(".og-p-pe .ob-bt-pri", depois=300); pg.wait_for_selector(".og-aloc"); pg.wait_for_timeout(300); g.pausa(3200)
    g.clicar(".og-aloc-pess >> nth=0", depois=300); pg.wait_for_selector(".og-painel", state="detached"); pg.wait_for_timeout(700); g.pausa(2400)
    g.salvar("/home/claude/gifs/equipe-computador.gif"); print("computador", len(g.quadros)); c.close()
def cel(nav):
    c, pg = nova(nav, {"width": 390, "height": 844}, True); entrar(pg, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    g = Gravador(pg, 488); pg.evaluate("tfEquipe.abrir()"); pg.wait_for_selector(".eq-card"); pg.wait_for_timeout(400); g.pausa(2200)
    pg.locator(".eq-card", has_text="Diego").scroll_into_view_if_needed(); g.pausa(1200)
    g.clicar(".eq-card >> text=Diego", depois=300); pg.wait_for_selector(".eq-doc"); pg.wait_for_timeout(300); g.pausa(2400)
    pg.locator(".eq-doc", has_text="ASO").scroll_into_view_if_needed(); g.pausa(900)
    g.clicar(".eq-doc:has-text('ASO') .eq-bt", depois=1200)
    pg.fill(".eq-jan input[type=date] >> nth=0", "2026-11-10"); g.pausa(600)
    pg.set_input_files(".eq-jan input[type=file]", "/tmp/certificado.jpg"); pg.wait_for_timeout(500); g.pausa(1300)
    pg.locator(".eq-jan .eq-bt.pri").scroll_into_view_if_needed(); g.clicar(".eq-jan .eq-bt.pri", depois=300)
    pg.wait_for_selector(".eq-jan", state="detached"); pg.wait_for_timeout(500); pg.evaluate("window.scrollTo(0,0)"); g.pausa(1800)
    pg.locator(".eq-doc", has_text="ASO").scroll_into_view_if_needed(); g.pausa(2000)
    g.clicar(".eq-abas button >> text=Agenda", depois=2000)
    g.clicar(".eq-voltar", depois=300); pg.wait_for_selector(".eq-card"); pg.wait_for_timeout(300); g.pausa(2200)
    g.salvar("/home/claude/gifs/equipe-celular.gif"); print("celular", len(g.quadros)); c.close()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    pc(nav); cel(nav); nav.close()
