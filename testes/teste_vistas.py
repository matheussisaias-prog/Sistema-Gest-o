import sys, re; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from playwright.sync_api import sync_playwright
B="http://127.0.0.1:8900"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
vistas = sorted(set(re.findall(r"switchView\('([a-z-]+)'", open('/home/claude/sistema-gest-o/index.html').read())))
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome"); pg = nav.new_page(viewport={"width":1366,"height":800}); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    erros=[]; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(B+"/entrar.html"); pg.fill("#e-email","w@rawtech.test"); pg.fill("#e-senha","Senha-Forte-1"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(800)
    ok=0
    for v in vistas:
        antes=len(erros); pg.evaluate(f"switchView('{v}', document.querySelector(\"[onclick*=\\\"switchView('{v}'\\\"]\"))"); pg.wait_for_timeout(250)
        vis = pg.evaluate(f"!!document.querySelector('#view-{v}.active')")
        if len(erros)==antes and vis: ok+=1
        else: print("FALHA", v, vis, erros[antes:])
    print(f"Telas abertas sem erro: {ok} de {len(vistas)}")
    nav.close()
