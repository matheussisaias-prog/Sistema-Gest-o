import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from playwright.sync_api import sync_playwright
B="http://127.0.0.1:8900"; ok=f=0
def check(n,c,x=""):
    global ok,f
    if c: ok+=1; print("OK   ",n)
    else: f+=1; print("FALHA",n,x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
with sync_playwright() as p:
    nav=p.chromium.launch(executable_path="/usr/bin/google-chrome"); pg=nav.new_page(viewport={"width":390,"height":844}); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    pg.goto(B+"/entrar.html"); pg.click("footer >> text=Fale conosco"); pg.wait_for_selector("#v-contato:not([hidden])")
    check("Rodapé abre o Fale conosco", True)
    pg.fill("#k-nome","Maria Cliente"); pg.fill("#k-email","maria@cliente.test"); pg.select_option("#k-assunto","Comercial"); pg.fill("#k-msg","Gostaria de uma demonstração do sistema.")
    pg.click("#f-contato button[type=submit]"); pg.wait_for_selector("#aviso.ok"); check("Envia pela tela de entrada", "Mensagem enviada" in pg.inner_text("#aviso"))
    pg.goto(B+"/entrar.html#contato"); pg.wait_for_selector("#v-contato:not([hidden])"); check("Link #contato abre direto", True)
    pg.goto(B+"/entrar.html"); pg.fill("#e-email","admin@rawtech.test"); pg.fill("#e-senha","nova-senha-adm"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector("#tf-contato"); pg.click("#tf-contato"); pg.wait_for_selector("#tf-k-msg")
    check("Modal mostra o e-mail da conta", "admin@rawtech.test" in pg.inner_text(".tf-imp"))
    pg.fill("#tf-k-msg","O relatório semanal não está saindo."); pg.click(".tf-imp [type=submit]"); pg.wait_for_selector(".tf-imp", state="detached")
    check("Envia de dentro do sistema", True)
    nav.close()
print(f"RESULTADO: {ok} ok, {f} falhas")
