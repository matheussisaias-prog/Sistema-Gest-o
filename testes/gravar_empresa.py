import sys; sys.path.insert(0, "/home/claude/telas")
import requests
from comum import rotas
from gravar import Gravador
from dados_rdo import montar
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
B = "http://127.0.0.1:8900"; A = B + "/api"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
im = Image.new("RGBA", (900, 300), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.rounded_rectangle([10, 30, 250, 270], 40, fill=(15, 61, 110, 255)); d.polygon([(70, 220), (130, 80), (190, 220)], outline=(245, 158, 11, 255), width=22)
d.rectangle([290, 110, 860, 170], fill=(15, 61, 110, 255)); d.rectangle([290, 195, 700, 220], fill=(71, 85, 105, 255)); im.save("/tmp/logo-rawtech.png")
pid, p2, ids, R, rd = montar(com_logo=False)
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
adm.post(A+"/convites", json={"nome": "Diego Souza", "perfil": "funcionario", "canal": "email", "email": "diego@rawtech.com.br"})
import subprocess; subprocess.run(["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-e", "INSERT INTO funcionarios (empresa_id, nome, cargo, telefone) VALUES (1, 'Marcos Silva', 'Encarregado civil', '81998765432')"], check=True)
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, device_scale_factor=1.25 if mob else 1, locale="pt-BR"); rotas(c)
    c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); return c, c.new_page()
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden"); pg.wait_for_timeout(600)
link = {}
def pc(nav):
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g = Gravador(pg, 1100); pg.mouse.move(700, 400); g.pausa(600)
    g.clicar("#nav-empresa", depois=300); pg.wait_for_selector(".em-lin:not(.em-th)"); pg.wait_for_timeout(300); g.pausa(2600)
    g.clicar("#em-convidar", depois=500)
    pg.select_option("#cv-ficha", label="Marcos Silva · Encarregado civil"); pg.wait_for_timeout(200); g.pausa(900)
    g.clicar(".em-chips4 button[data-perfil=encarregado]", depois=700); g.pausa(500)
    g.clicar("#em-ok", depois=300); pg.wait_for_selector(".em-link"); pg.wait_for_timeout(300); g.pausa(3200)
    link["m"] = pg.input_value(".em-link input")
    g.clicar(".eq-jan .eq-acoes button >> text=Fechar", depois=900); g.pausa(900)
    pg.locator(".em-lin[data-nome='Bruno Costa'] select").select_option("gestor"); pg.wait_for_timeout(900); g.pausa(1400)
    pg.locator(".em-lin[data-nome='Bruno Costa'] select").select_option("encarregado"); pg.wait_for_timeout(700)
    g.clicar(".em-lin[data-nome='Carla Mendes'] .em-mais", depois=900)
    g.clicar(".em-menu button >> text=Desativar acesso", depois=1200)
    g.clicar("#em-ok", depois=400); pg.wait_for_timeout(700); g.pausa(1600)
    pg.locator(".em-filtros select").nth(1).select_option("desativados"); pg.wait_for_timeout(300); g.pausa(1600)
    g.clicar(".em-lin[data-nome='Carla Mendes'] button >> text=Reativar", depois=300); pg.wait_for_timeout(700)
    pg.locator(".em-filtros select").nth(1).select_option("ativos"); pg.wait_for_timeout(300); g.pausa(900)
    g.clicar(".em-abas button[data-aba=empresa]", depois=300); pg.wait_for_selector("#emp-razao_social"); g.pausa(900)
    g.digitar("#emp-razao_social", "Rawtech Instalações Ltda", 4); g.digitar("#emp-cnpj", "11222333000181", 3); g.digitar("#emp-telefone", "8133330000", 3)
    g.digitar("#emp-cidade", "Recife", 3); g.digitar("#emp-uf", "PE", 2)
    g.clicar("#emp-salvar", depois=300); pg.wait_for_timeout(900); g.pausa(900)
    pg.set_input_files("#emp-logo-arq", "/tmp/logo-rawtech.png"); pg.wait_for_selector(".em-logo img"); pg.wait_for_timeout(800); g.pausa(2400)
    g.clicar(".em-abas button[data-aba=calendario]", depois=300); pg.wait_for_selector(".em-dia"); pg.wait_for_timeout(300); g.pausa(1600)
    g.clicar(".em-dia:has-text('Sábado') .em-sw", depois=700)
    pg.locator(".em-add input[type=date]").first.fill("2026-12-08"); g.digitar(".em-add input >> nth=2", "N. Sra. da Conceição", 4)
    g.clicar(".em-add button", depois=900)
    g.clicar("#cal-salvar", depois=300); pg.wait_for_selector(".eq-jan"); pg.wait_for_timeout(300); g.pausa(2400)
    g.clicar("#em-ok", depois=300); pg.wait_for_timeout(1300); g.pausa(900)
    g.clicar(".em-abas button[data-aba=regras]", depois=300); pg.wait_for_selector(".em-regra"); g.pausa(1400)
    pg.locator(".em-regra", has_text="Foto obrigatória").locator("select").select_option("campo"); pg.wait_for_timeout(800); g.pausa(1000)
    g.clicar(".em-regra:has-text('Comentário obrigatório') .em-sw", depois=1300)
    g.clicar(".em-abas button[data-aba=plano]", depois=300); pg.wait_for_selector(".em-plano"); pg.wait_for_timeout(300); g.pausa(2000)
    g.clicar(".em-plano button >> text=Ver os planos", depois=300); pg.wait_for_selector(".em-pl"); g.pausa(2600)
    g.salvar("/home/claude/gifs/empresa-computador.gif"); print("computador", len(g.quadros)); c.close()
def cel(nav):
    if 'cel' in sys.argv: adm.post(A+"/convites", json={"nome": "Marcos Silva", "perfil": "encarregado", "canal": "whatsapp", "telefone": "81998765432"})
    c, pg = nova(nav, {"width": 390, "height": 844}, True); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g = Gravador(pg, 488); pg.evaluate("tfEmpresa.abrir()"); pg.wait_for_selector(".em-card"); pg.wait_for_timeout(400); g.pausa(2000)
    pg.locator(".em-card[data-nome='Marcos Silva']").scroll_into_view_if_needed(); pg.wait_for_timeout(200); g.pausa(900)
    g.clicar(".em-card[data-nome='Marcos Silva']", depois=1600)
    g.clicar(".em-folha button >> text=Mandar o link de novo pelo WhatsApp", depois=300); pg.wait_for_selector(".em-link"); pg.wait_for_timeout(400); g.pausa(2600)
    link["m"] = pg.input_value(".em-link input")
    g.clicar(".eq-jan .eq-acoes button >> text=Fechar", depois=500)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(200)
    for aba, y in [("empresa", 700), ("regras", 500), ("plano", 0)]:
        g.clicar(f".em-abas button[data-aba={aba}]", depois=300); pg.wait_for_timeout(700); g.pausa(1300)
        if y: pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(250); g.pausa(1100); pg.evaluate("window.scrollTo(0,0)")
    c.close()
    # o Marcos abre o link no celular dele, cria a senha e entra
    c, m = nova(nav, {"width": 390, "height": 844}, True); g.pg = m
    m.goto(link["m"]); m.wait_for_function("document.getElementById('senha-titulo').textContent.includes('Olá')"); m.wait_for_timeout(500); g.pausa(2400)
    g.digitar("#n-senha", "Marcos-Silva-2026", 4); g.digitar("#n-senha2", "Marcos-Silva-2026", 6)
    g.clicar("#f-senha button[type=submit]", depois=300); m.wait_for_url("**/index.html"); m.wait_for_selector(".mi-ola"); m.wait_for_timeout(700); g.pausa(2000)
    m.request.post(B+"/api/sair"); m.goto(B+"/entrar.html"); m.wait_for_selector("#v-entrar:not([hidden])"); m.wait_for_timeout(500); g.pausa(1200)
    g.digitar("#e-email", "(81) 99876-5432", 3); g.digitar("#e-senha", "Marcos-Silva-2026", 6)
    g.clicar("#f-entrar button[type=submit]", depois=300); m.wait_for_url("**/index.html"); m.wait_for_selector(".mi-ola"); m.wait_for_timeout(700); g.pausa(2400)
    g.salvar("/home/claude/gifs/empresa-celular.gif"); print("celular", len(g.quadros)); c.close()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    (pc(nav) if 'cel' not in sys.argv else None); cel(nav)
