"""Minhas atividades paginada (como o Kanban): cabe na tela sem rolar para baixo, ‹ 1/N › por grupo,
Próximas/Concluídas trocam o quadro, e atualizar (F5) mantém as páginas. Computador e celular."""
import sys, requests, datetime as dt
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from gravar import Gravador
from dados_crono import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, ids = criar()
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
carla = [x for x in adm.get(A+"/funcionarios").json()["funcionarios"] if x["nome"].startswith("Carla")][0]["id"]
h = dt.date.today()
for i in range(9):    # atrasadas
    ini = h - dt.timedelta(days=20-i); adm.post(A+"/atividades", json={"projeto_id": pid, "descricao": f"Passagem de cabos · trecho {i+1}", "inicio": ini.isoformat(), "fim": (ini+dt.timedelta(days=3)).isoformat(), "responsavel_id": carla})
for i in range(7):    # hoje
    adm.post(A+"/atividades", json={"projeto_id": pid, "descricao": f"Montagem de luminárias · área {i+1}", "inicio": (h-dt.timedelta(days=1)).isoformat(), "fim": (h+dt.timedelta(days=6)).isoformat(), "responsavel_id": carla})
def roteiro(pg, g, cel):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "carla@rawtech.com.br"); pg.fill("#e-senha", "Carla-Mendes-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".mi-grupo"); pg.wait_for_timeout(1200); pg.mouse.move(700, 300); g.pausa(1600)
    g.clicar("#mi-g-atrasadas .mi-pbt >> nth=1", depois=1000); g.clicar("#mi-g-atrasadas .mi-pbt >> nth=1", depois=1300)
    if cel:
        pg.evaluate("document.getElementById('mi-g-hoje').scrollIntoView({behavior:'smooth', block:'nearest', inline:'start'})"); pg.wait_for_timeout(700); g.pausa(1000)
    g.clicar("#mi-g-hoje .mi-pbt >> nth=1", depois=1300)
    pg.reload(); pg.wait_for_selector(".mi-grupo"); pg.wait_for_timeout(1200); g.pausa(1500)
    g.clicar(".mi-mais", depois=1500); g.clicar(".mi-mais", depois=1300)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for cel, nome, larg, vp, esc in [(False, "minhas-computador", 1100, {"width": 1440, "height": 900}, 1), (True, "minhas-celular", 488, {"width": 390, "height": 844}, 1.25)]:
        c = nav.new_context(viewport=vp, device_scale_factor=esc, is_mobile=cel, has_touch=cel, locale="pt-BR"); rotas(c)
        c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page()
        g = Gravador(pg, larg); roteiro(pg, g, cel); g.salvar(f"/home/claude/gifs/{nome}.gif"); print(nome, len(g.quadros)); c.close()
    nav.close()
