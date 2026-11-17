"""Minhas atividades paginada (como o Kanban): cabe na tela sem rolar para baixo, ‹ 1/N › por grupo,
Próximas/Concluídas trocam o quadro, e atualizar (F5) mantém as páginas. Computador e celular."""
import sys, requests, datetime as dt
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
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
def entrar(pg):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "carla@rawtech.com.br"); pg.fill("#e-senha", "Carla-Mendes-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".mi-grupo"); pg.wait_for_timeout(800)
cabe = lambda pg: pg.evaluate("Math.max(...[...document.querySelector('#view-minhas .mi').children].map(c => c.getBoundingClientRect().bottom)) <= innerHeight")
pag = lambda pg, g: pg.locator(f"#mi-g-{g} .mi-pag span").inner_text() if pg.locator(f"#mi-g-{g} .mi-pag").count() else ""
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for nome, vp, mob in [("computador", {"width": 1440, "height": 900}, False), ("celular", {"width": 390, "height": 844}, True)]:
        c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); rotas(c)
        c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page(); erros = []
        pg.on("pageerror", lambda e: erros.append(str(e))); entrar(pg)
        check(f"[{nome}] Cabe na tela sem rolar para baixo", cabe(pg))
        check(f"[{nome}] Atrasadas paginadas com 1/N", pag(pg, "atrasadas").startswith("1/"), pag(pg, "atrasadas"))
        primeiro = pg.locator("#mi-g-atrasadas .mi-card-t b").first.inner_text()
        pg.locator("#mi-g-atrasadas .mi-pbt").nth(1).click(); pg.wait_for_timeout(300)
        check(f"[{nome}] Próxima página troca os cartões (2/N)", pag(pg, "atrasadas").startswith("2/") and pg.locator("#mi-g-atrasadas .mi-card-t b").first.inner_text() != primeiro)
        check(f"[{nome}] Continua cabendo na página 2", cabe(pg))
        pg.reload(); pg.wait_for_selector(".mi-grupo"); pg.wait_for_timeout(1000)
        check(f"[{nome}] Atualizar (F5) volta na mesma página", pag(pg, "atrasadas").startswith("2/"), pag(pg, "atrasadas"))
        pg.click(".mi-mais"); pg.wait_for_timeout(400)
        check(f"[{nome}] Próximas/Concluídas trocam o quadro (não empilham embaixo)", pg.locator("#mi-g-proximas").count() == 1 and pg.locator("#mi-g-atrasadas").count() == 0 and cabe(pg))
        pg.reload(); pg.wait_for_selector(".mi-grupo"); pg.wait_for_timeout(1000)
        check(f"[{nome}] F5 mantém Próximas/Concluídas abertas", pg.locator("#mi-g-proximas").count() == 1)
        pg.click(".mi-ind.verm"); pg.wait_for_timeout(500)
        check(f"[{nome}] Indicador 'atrasadas' volta para o quadro principal", pg.locator("#mi-g-atrasadas").count() == 1)
        check(f"[{nome}] Sem erro de tela", not erros, erros)
        if mob: check("[celular] Sem rolagem lateral da página", pg.evaluate("document.documentElement.scrollWidth") <= 390)
        c.close()
    nav.close()
print(f"RESULTADO: {ok} ok, {f} falhas")
