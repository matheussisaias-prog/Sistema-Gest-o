import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas, token
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"
ok = falhas = 0
def check(n, c, x=""):
    global ok, falhas
    if c: ok += 1; print("OK   ", n)
    else: falhas += 1; print("FALHA", n, x)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = nav.new_page(viewport={"width": 1366, "height": 800}); rotas(pg)
    erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(B + "/entrar.html"); pg.wait_for_selector("#v-entrar:not([hidden])")
    check("Abre na tela de login", pg.is_visible("#f-entrar"))
    pg.click("#f-entrar button[type=submit]"); check("Valida e-mail vazio", "e-mail válido" in pg.inner_text("#aviso"))
    pg.click("text=Cadastrar minha empresa"); check("Vai para o cadastro (passo 1)", pg.is_visible("#f-empresa"))
    pg.click("#f-empresa button[type=submit]"); check("Exige nome da empresa", pg.is_visible("#aviso") and "nome da empresa" in pg.inner_text("#aviso"))
    pg.fill("#c-nome", "Rawtech Engenharia"); pg.type("#c-cnpj", "11222333000181"); check("Máscara de CNPJ", pg.input_value("#c-cnpj") == "11.222.333/0001-81", pg.input_value("#c-cnpj"))
    pg.type("#c-tel", "81999998888"); check("Máscara de telefone", pg.input_value("#c-tel") == "(81) 99999-8888", pg.input_value("#c-tel"))
    pg.fill("#c-cidade", "Recife"); pg.select_option("#c-uf", "PE"); pg.click("#f-empresa button[type=submit]")
    check("Passo 2 (você)", pg.is_visible("#f-admin"))
    pg.fill("#a-nome", "Wendell Xavier"); pg.fill("#a-email", "wendell@rawtech.test"); pg.fill("#a-senha", "curta")
    pg.click("#f-admin button[type=submit]"); check("Recusa senha curta", "8 caracteres" in pg.inner_text("#aviso"))
    pg.fill("#a-senha", "Senha-Forte-2026"); check("Medidor de força da senha", pg.get_attribute("#a-senha >> xpath=../../div[@class='forca']", "data-n") in ("3","4"))
    pg.click("#f-admin button[type=submit]"); check("Passo 3 (equipe) com 2 linhas", pg.is_visible("#v-cadastro-3") and pg.locator(".pessoa").count() == 2)
    linhas = pg.locator(".pessoa")
    linhas.nth(0).locator(".p-nome").fill("João Paulo"); linhas.nth(0).locator(".p-cargo").fill("Encarregado"); linhas.nth(0).locator(".p-perfil").select_option("encarregado"); linhas.nth(0).locator(".p-email").fill("jp@rawtech.test")
    linhas.nth(1).locator(".p-nome").fill("Carlos"); linhas.nth(1).locator(".p-cargo").fill("Ajudante")
    pg.click("#add-pessoa"); check("Adiciona pessoa", pg.locator(".pessoa").count() == 3)
    pg.click("#concluir"); pg.wait_for_selector("#v-feito:not([hidden])")
    check("Cadastro concluído pela tela", "1 pessoa da equipe" in pg.inner_text("#feito-texto"), pg.inner_text("#feito-texto"))
    # confirmação por link
    pg.goto(B + "/entrar.html?confirmar=" + token("wendell@rawtech.test", "confirmar")); pg.wait_for_selector("#aviso.ok")
    check("Link de confirmação funciona", "confirmado" in pg.inner_text("#aviso"))
    pg.fill("#e-email", "wendell@rawtech.test"); pg.fill("#e-senha", "errada-123"); pg.click("#f-entrar button[type=submit]"); pg.wait_for_selector("#aviso.erro")
    check("Senha errada: mensagem clara", "incorretos" in pg.inner_text("#aviso"))
    pg.fill("#e-senha", "Senha-Forte-2026"); pg.click("#f-entrar button[type=submit]"); pg.wait_for_url("**/index.html", timeout=8000)
    check("Login leva ao sistema", pg.url.endswith("/index.html"))
    pg.goto(B + "/entrar.html"); pg.wait_for_url("**/index.html", timeout=8000); check("Já logado: entrar.html manda para o sistema", pg.url.endswith("/index.html"))
    # convite
    ctx2 = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2); pg2 = ctx2.new_page(); rotas(pg2)
    pg2.goto(B + "/entrar.html?convite=" + token("jp@rawtech.test", "convite")); pg2.wait_for_selector("#v-senha:not([hidden])")
    check("Convite abre 'Criar sua senha' (celular)", pg2.inner_text("#senha-titulo") == "Criar sua senha")
    pg2.fill("#n-senha", "Senha-do-JP-1"); pg2.fill("#n-senha2", "outra"); pg2.click("#f-senha button[type=submit]")
    check("Senhas diferentes recusadas", "não são iguais" in pg2.inner_text("#aviso"))
    pg2.fill("#n-senha2", "Senha-do-JP-1"); pg2.click("#f-senha button[type=submit]"); pg2.wait_for_url("**/index.html", timeout=8000)
    check("Convite aceito e já entra", pg2.url.endswith("/index.html"))
    # esqueci a senha
    pg3 = nav.new_page(); rotas(pg3); pg3.goto(B + "/entrar.html"); pg3.click("text=Esqueci minha senha"); pg3.fill("#r-email", "wendell@rawtech.test"); pg3.click("#f-esqueci button[type=submit]"); pg3.wait_for_selector("#aviso.ok")
    pg3.goto(B + "/entrar.html?redefinir=" + token("wendell@rawtech.test", "redefinir")); pg3.fill("#n-senha", "Nova-Senha-2026"); pg3.fill("#n-senha2", "Nova-Senha-2026"); pg3.click("#f-senha button[type=submit]"); pg3.wait_for_selector("#aviso.ok")
    check("Redefinir senha pela tela", "Senha alterada" in pg3.inner_text("#aviso"))
    # celular: sem rolagem lateral
    m = nav.new_page(viewport={"width": 390, "height": 844}); rotas(m); m.goto(B + "/entrar.html#cadastro"); m.wait_for_selector("#v-cadastro-1:not([hidden])")
    check("Celular sem rolagem lateral", m.evaluate("document.documentElement.scrollWidth <= 390"))
    check("Sem erros de JavaScript", not erros, erros)
    nav.close()
print(f"RESULTADO: {ok} ok, {falhas} falhas")
