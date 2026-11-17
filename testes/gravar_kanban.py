import sys, requests, datetime as dt; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_rel import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, *_ = montar()
s = requests.Session(); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"}); h = dt.date.today()
nomes = ["Lançamento de eletrodutos", "Passagem de cabos de força", "Montagem de quadro de distribuição", "Instalação de luminárias LED", "Teste de isolamento", "Fixação de eletrocalhas", "Aterramento de estruturas", "Identificação de circuitos"]
for i in range(22):
    ini = h - dt.timedelta(days=30-i); s.post(A+"/atividades", json={"projeto_id": pid, "descricao": f"{nomes[i%8]} · trecho {i+1}", "inicio": ini.isoformat(), "fim": (ini+dt.timedelta(days=3)).isoformat()})
for i in range(14):
    ini = h + dt.timedelta(days=5+i); s.post(A+"/atividades", json={"projeto_id": pid, "descricao": f"{nomes[i%8]} · área {i+1}", "inicio": ini.isoformat(), "fim": (ini+dt.timedelta(days=4)).isoformat()})
def roteiro(pg, g, cel):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1000); pg.mouse.move(700, 300)
    pg.evaluate("switchView('kanban', document.querySelector('[onclick*=\"kanban\"]'))"); pg.wait_for_timeout(900); g.pausa(1600)
    prox = lambda col: f".kanban-col:nth-child({col}) .kb-bt >> nth=1"
    g.clicar(prox(1), depois=900); g.clicar(prox(1), depois=900); g.clicar(prox(1), depois=1300)
    g.clicar(".kanban-col:nth-child(1) .kb-bt >> nth=0", depois=1000)
    if cel:
        pg.evaluate("document.getElementById('kanban-board').scrollTo({left: document.querySelectorAll('.kanban-col')[3].offsetLeft - 10, behavior: 'smooth'})"); pg.wait_for_timeout(700); g.pausa(1200)
    g.clicar(prox(4), depois=900); g.clicar(prox(4), depois=1500)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for cel, nome, larg, vp, esc in [(False, "kanban-computador", 1100, {"width": 1440, "height": 900}, 1), (True, "kanban-celular", 488, {"width": 390, "height": 844}, 1.25)]:
        c = nav.new_context(viewport=vp, device_scale_factor=esc, is_mobile=cel, has_touch=cel); pg = c.new_page(); rotas(pg)
        pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        g = Gravador(pg, larg); roteiro(pg, g, cel); g.salvar(f"/home/claude/gifs/{nome}.gif"); print(nome, len(g.quadros)); c.close()
    nav.close()
