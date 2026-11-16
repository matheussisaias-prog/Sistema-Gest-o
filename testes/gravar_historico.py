import sys; sys.path.insert(0, "/home/claude/telas")
import requests
from comum import rotas
from gravar import Gravador
from dados_rdo import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar()
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
ana = requests.Session(); ana.post(A+"/entrar", json={"email": "ana@rawtech.com.br", "senha": "Ana-Ribeiro-2026"})
import subprocess; fb = subprocess.run(["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-N", "-e", "SELECT id FROM funcionarios WHERE nome='Bruno Costa'"], capture_output=True, text=True).stdout.strip()
ana.patch(A+f"/atividades/{ids['e2']}", json={"duracao_dias": 4, "responsavel_id": int(fb)})
adm.post(A+"/convites", json={"nome": "Marcos Silva", "perfil": "encarregado", "canal": "whatsapp", "telefone": "81998765432"})
xml = adm.get(A+f"/obras/{pid}/exportar?formato=mspdi").text.replace("ELE-014 · Subestação 13,8 kV · Galpão 3", "Subestação 13,8 kV - Galpão 5")
open("/tmp/Subestacao-Galpao5.xml", "w").write(xml)
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=1.25 if mob else 1, locale="pt-BR"); rotas(c)
    c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); return c, c.new_page()
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden"); pg.wait_for_timeout(600)
def pc(nav):
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g = Gravador(pg, 1100); pg.mouse.move(700, 400); g.pausa(500)
    g.clicar("#nav-historico", depois=300); pg.wait_for_selector(".hi-item"); pg.wait_for_timeout(400); g.pausa(2800)
    pg.mouse.move(600, 500)
    for _ in range(3): pg.mouse.wheel(0, 380); pg.wait_for_timeout(250); g.pausa(800)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200)
    g.clicar(".hi-tipos button[data-tipo=av]", depois=300); pg.wait_for_timeout(700); g.pausa(1600)
    g.clicar(".hi-tipos button[data-tipo=crono]", depois=300); pg.wait_for_timeout(700); g.pausa(1800)
    g.clicar(".hi-tipos button[data-tipo='']", depois=300); pg.wait_for_timeout(600)
    g.digitar("#hi-busca", "Malha", 2); pg.wait_for_timeout(1000); g.pausa(1600)
    pg.fill("#hi-busca", ""); pg.wait_for_timeout(900)
    pg.mouse.move(900, 300); g.clicar(".hi-item:has-text('mudou “Montagem do transformador 1”') .hi-abrir", depois=300); pg.wait_for_selector(".og-painel"); pg.wait_for_timeout(600); g.pausa(2200)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    if pg.locator(".og-painel-fundo").count(): pg.mouse.click(5, 450); pg.wait_for_timeout(300)
    g.clicar("#nav-importar", depois=300); pg.wait_for_selector("#im-drop"); pg.mouse.move(900, 300); pg.wait_for_timeout(400); g.pausa(1600)
    pg.set_input_files("#im-arq", "/tmp/Subestacao-Galpao5.xml"); pg.wait_for_selector(".im-kpis"); pg.wait_for_timeout(500); g.pausa(2600)
    g.digitar("#im-codigo", "SUB-015", 2); g.digitar("#im-cliente", "Metalúrgica Nordeste", 4); g.pausa(600)
    pg.locator(".im-tab").evaluate("e => e.scrollBy(0, 200)"); pg.wait_for_timeout(200); g.pausa(1400)
    pg.mouse.move(900, 300); pg.locator("#im-importar").scroll_into_view_if_needed(); pg.wait_for_timeout(300); g.clicar("#im-importar", depois=300); pg.wait_for_selector(".og-lin[data-id]", timeout=15000); pg.wait_for_timeout(900); g.pausa(2800)
    g.salvar("/home/claude/gifs/historico-importar-computador.gif"); print("computador", len(g.quadros)); c.close()
def cel(nav):
    c, pg = nova(nav, {"width": 390, "height": 844}, True); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g = Gravador(pg, 488); pg.evaluate("tfHistorico.abrir()"); pg.wait_for_selector(".hi-item"); pg.wait_for_timeout(400); g.pausa(2000)
    for y in (350, 750, 1150): pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(250); g.pausa(900)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200)
    g.clicar(".hi-tipos button[data-tipo=rdo]", depois=300); pg.wait_for_timeout(700); g.pausa(1600)
    pg.evaluate("tfImportar.abrir()"); pg.wait_for_selector("#im-drop"); pg.wait_for_timeout(300); g.pausa(1500)
    pg.set_input_files("#im-arq", "/tmp/Subestacao-Galpao5.xml"); pg.wait_for_selector(".im-kpis"); pg.wait_for_timeout(500); g.pausa(1600)
    for sel in [".im-ops", "#im-nome", ".im-kpis", ".im-tab"]:
        pg.locator(sel).first.scroll_into_view_if_needed(); pg.wait_for_timeout(250); g.pausa(1000)
    g.salvar("/home/claude/gifs/historico-importar-celular.gif"); print("celular", len(g.quadros)); c.close()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    pc(nav); cel(nav)
