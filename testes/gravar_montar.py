import sys, requests; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_crono import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid1, _ = criar()
s = requests.Session(); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
def obra(cod): return s.post(A+"/projetos", json={"codigo": cod, "nome": "Retrofit de iluminação · Galpão 1", "cliente": "Metalúrgica Nordeste", "tipo_servico": "Elétrica", "situacao": "Planejamento", "inicio": "2027-01-11", "fim": "2027-03-26"}).json()["id"]
pids = {False: obra("ELE-017"), True: obra("ELE-018")}
def roteiro(pg, g, cel):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1000); pg.mouse.move(700, 300)
    pg.evaluate(f"tfObra.abrir({pids[cel]})"); pg.wait_for_selector(".og-vazio-crono"); pg.wait_for_timeout(400)
    pg.locator(".og-vazio-crono").scroll_into_view_if_needed(); g.pausa(1500)
    g.clicar(".og-vazio-crono .ob-bt-pri", depois=1200)
    g.digitar(".om-busca input", "ilumina", 2); g.clicar(".om-mod >> text=Retrofit de iluminação industrial", depois=1200)
    if cel: pg.locator(".om-previa").scroll_into_view_if_needed(); pg.wait_for_timeout(200); g.pausa(1400)
    g.clicar(".om-pe .ob-bt-pri", depois=300); pg.wait_for_selector(".om-jan", state="detached"); pg.wait_for_timeout(800); g.pausa(2000)
    # colar do Excel
    if not cel: colar(pg, g)
    copiar(pg, g, cel)
def colar(pg, g):
    pg.locator(".og-nova-inp").scroll_into_view_if_needed(); g.clicar(".og-nova-inp", depois=400)
    pg.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'Atividade\\tDuração\\tResponsável\\nPintura das eletrocalhas\\t2\\tCarla Mendes\\nLimpeza final e entrega\\t1\\t');
       document.querySelector('.og-nova-inp').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
    pg.wait_for_selector(".om-previa"); pg.wait_for_timeout(400); g.pausa(2000)
    g.clicar(".om-pe .ob-bt-pri", depois=300); pg.wait_for_selector(".om-jan", state="detached"); pg.wait_for_timeout(700)
    pg.locator(".og-lin[data-id], .og-cel-card", has_text="Pintura").first.scroll_into_view_if_needed(); g.pausa(1800)
def copiar(pg, g, cel):
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200)
    g.clicar(".og-mais", depois=500); g.clicar(".ob-menu >> text=Montar / importar cronograma", depois=700)
    g.clicar(".om-op >> text=Copiar de outra obra", depois=600); pg.select_option(".om-corpo select", str(pid1)); pg.wait_for_selector(".om-etapas input"); pg.wait_for_timeout(500); g.pausa(1300)
    for i in range(3): pg.locator(".om-etapas input").nth(i).uncheck(); pg.wait_for_timeout(250); g.pausa(350)
    pg.wait_for_timeout(500); g.pausa(1300)
    g.clicar(".om-pe .ob-bt-pri", depois=300); pg.wait_for_selector(".om-jan", state="detached"); pg.wait_for_timeout(700)
    pg.locator(".og-lin[data-id], .og-cel-etapa", has_text="Comissionamento").first.scroll_into_view_if_needed(); g.pausa(1800)
    # exportar
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200)
    if not cel:
        g.clicar(".og-acoes .ob-bt >> text=Exportar", depois=1800); pg.keyboard.press("Escape"); pg.mouse.click(700, 600); pg.wait_for_timeout(300)
        with pg.expect_popup() as pp:
            pg.click(".og-acoes .ob-bt >> text=Exportar"); pg.click(".om-exp >> text=PDF para imprimir")
        w = pp.value; w.wait_for_load_state(); w.set_viewport_size({"width": 1440, "height": 900}); w.wait_for_timeout(400)
        g2 = Gravador(w, g.w); g2.pausa(2600); g.quadros += g2.quadros; w.close()
    else:
        g.clicar(".og-mais", depois=500); g.clicar(".ob-menu >> text=Exportar", depois=1800)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    for cel, nome, larg, vp, esc in [(False, "obra-montar-computador", 1100, {"width": 1440, "height": 900}, 1), (True, "obra-montar-celular", 488, {"width": 390, "height": 844}, 1.25)]:
        c = nav.new_context(viewport=vp, locale="pt-BR", device_scale_factor=esc, is_mobile=cel, has_touch=cel, accept_downloads=True); pg = c.new_page(); rotas(pg)
        pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        g = Gravador(pg, larg); roteiro(pg, g, cel); g.salvar(f"/home/claude/gifs/{nome}.gif"); print(nome, len(g.quadros)); c.close()
    nav.close()
