"""Empresa e usuários (telas): menu só para a gestão; usuários (convidar por WhatsApp e por e-mail, trocar perfil, desativar,
reativar, link de nova senha); empresa (dados e logo); calendário padrão (sábado, feriado, aviso das atividades que mudam);
regras do campo; plano; gestor só vê; celular (cartões e folha de ações); entrar com o celular e página do convite."""
import sys, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_rdo import montar
from playwright.sync_api import sync_playwright
from PIL import Image
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
im = Image.new("RGBA", (800, 260), (0, 0, 0, 0)); im.paste((22, 101, 52, 255), (10, 30, 250, 230)); im.save("/tmp/logo-verde.png")
pid, p2, ids, R, rd = montar(com_logo=False); erros = []
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
usu = lambda nome: [x for x in adm.get(A+"/empresa/usuarios").json()["usuarios"] if x["nome"] == nome][0]
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden")
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    check("Encarregado não tem 'Empresa e usuários' no menu", pg.locator("#nav-empresa").count() == 0); c.close()
    # ── administrador no computador ──
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    pg.click("#nav-empresa"); pg.wait_for_selector(".em-lin:not(.em-th)")
    check("Menu abre a tela com as 5 abas", pg.inner_text("#page-title") == "Empresa e usuários" and pg.locator(".em-abas button").count() == 5)
    check("Indicadores e lista de usuários", "2 de 5" in pg.inner_text(".em-kpis") and pg.locator(".em-lin:not(.em-th)").count() == 4 and "Wendell Xavier (você)" in pg.inner_text(".em-tab"))
    check("Não muda o próprio perfil (sem seletor na própria linha)", pg.locator(".em-lin[data-nome='Wendell Xavier'] select").count() == 0)
    # convidar pelo WhatsApp
    pg.click("#em-convidar"); pg.wait_for_selector(".em-conv")
    check("Convite: WhatsApp já escolhido e celular é o login", pg.locator(".em-canal button.on").inner_text().endswith("Link para WhatsApp") and "é com ele que a pessoa vai entrar" in pg.inner_text(".em-conv"))
    pg.fill("#cv-nome", "Marcos Silva"); pg.click(".em-chips4 button[data-perfil=encarregado]"); pg.fill("#cv-tel", "81998765432")
    check("Celular formatado ao digitar", pg.input_value("#cv-tel") == "(81) 99876-5432")
    pg.click("#em-ok"); pg.wait_for_selector(".em-link")
    wa = pg.locator(".em-link a").get_attribute("href")
    check("Link criado com botão do WhatsApp e mensagem pronta", wa.startswith("https://wa.me/5581998765432?text=") and "Marcos" in pg.inner_text(".em-msg") and pg.locator("#em-ok").is_hidden())
    link = pg.input_value(".em-link input")
    pg.click(".eq-jan .eq-acoes button >> text=Fechar")
    check("Convite aparece na lista", "Convite enviado" in pg.inner_text(".em-lin[data-nome='Marcos Silva']") and "(81) 99876-5432" in pg.inner_text(".em-lin[data-nome='Marcos Silva']"))
    # convidar por e-mail
    pg.click("#em-convidar"); pg.wait_for_selector(".em-conv"); pg.click(".em-canal button[data-canal=email]")
    pg.fill("#cv-nome", "Diego Souza"); pg.fill("#cv-email", "diego@rawtech.com.br"); pg.click("#em-ok"); pg.wait_for_selector(".eq-jan", state="detached")
    check("Convite por e-mail: janela fecha e o convite entra na lista", pg.locator(".em-lin[data-nome='Diego Souza']").count() == 1)
    # trocar perfil
    pg.locator(".em-lin[data-nome='Bruno Costa'] select").select_option("gestor"); pg.wait_for_timeout(900)
    check("Trocar perfil no seletor salva na hora", usu("Bruno Costa")["perfil"] == "gestor")
    pg.locator(".em-lin[data-nome='Bruno Costa'] select").select_option("encarregado"); pg.wait_for_timeout(900)
    # link de nova senha
    pg.locator(".em-lin[data-nome='Carla Mendes'] .em-mais").click(); pg.click(".em-menu button >> text=Gerar link de nova senha"); pg.wait_for_selector(".em-link")
    check("Link de nova senha numa janela", "redefinir=" in pg.input_value(".em-link input")); pg.click(".eq-jan .eq-acoes button >> text=Fechar")
    # desativar e reativar
    pg.locator(".em-lin[data-nome='Carla Mendes'] .em-mais").click(); pg.click(".em-menu button >> text=Desativar acesso"); pg.click("#em-ok"); pg.wait_for_timeout(900)
    check("Desativar: sai da lista de ativos", usu("Carla Mendes")["situacao"] == "desativado" and pg.locator(".em-lin[data-nome='Carla Mendes']").count() == 0)
    pg.locator(".em-filtros select").nth(1).select_option("desativados")
    check("Filtro 'Desativados' mostra a Carla com Reativar", "Desativado" in pg.inner_text(".em-lin[data-nome='Carla Mendes']"))
    pg.locator(".em-lin[data-nome='Carla Mendes'] button >> text=Reativar").click(); pg.wait_for_timeout(900)
    check("Reativar", usu("Carla Mendes")["situacao"] == "ativo")
    pg.locator(".em-filtros select").nth(1).select_option("ativos")
    pg.fill(".em-filtros input", "marcos")
    check("Busca filtra a lista", pg.locator(".em-lin:not(.em-th)").count() == 1)
    # empresa
    pg.click(".em-abas button[data-aba=empresa]"); pg.wait_for_selector("#emp-razao_social")
    pg.fill("#emp-razao_social", "Rawtech Instalações Ltda"); pg.fill("#emp-cnpj", "11222333000181"); pg.fill("#emp-cidade", "Recife"); pg.fill("#emp-uf", "PE")
    check("CNPJ formatado ao digitar", pg.input_value("#emp-cnpj") == "11.222.333/0001-81")
    pg.click("#emp-salvar"); pg.wait_for_timeout(1000)
    E = adm.get(A+"/empresa").json()["empresa"]
    check("Dados da empresa salvos e na prévia do cabeçalho", E["razao_social"] == "Rawtech Instalações Ltda" and E["cidade"] == "Recife" and "Rawtech Instalações Ltda" in pg.inner_text(".em-cabdoc"))
    pg.set_input_files("#emp-logo-arq", "/tmp/logo-verde.png"); pg.wait_for_selector(".em-logo img"); pg.wait_for_timeout(600)
    check("Enviar logo: aparece, cor tirada dela e logo na barra lateral", adm.get(A+"/empresa").json()["empresa"]["tem_logo"] and pg.locator(".em-cor").count() == 1 and pg.locator(".sidebar-empresa img").count() == 1)
    # calendário
    pg.click(".em-abas button[data-aba=calendario]"); pg.wait_for_selector(".em-dia")
    pg.locator(".em-dia", has_text="Sábado").locator(".em-sw").click()
    pg.locator(".em-add input[type=date]").first.fill("2026-12-08"); pg.locator(".em-add input").nth(2).fill("Nossa Senhora da Conceição"); pg.locator(".em-add button").click()
    check("Sábado com 4 h e feriado da cidade na lista", pg.locator(".em-dia", has_text="Sábado").locator("input").input_value() == "4" and "Nossa Senhora da Conceição" in pg.inner_text(".em-fer"))
    pg.click("#cal-salvar"); pg.wait_for_selector(".eq-jan")
    check("Antes de salvar avisa quantas atividades mudam", "ainda não iniciada" in pg.inner_text(".eq-jan"))
    pg.click("#em-ok"); pg.wait_for_timeout(1500)
    C = adm.get(A+"/empresa/calendario").json()
    check("Calendário padrão salvo", C["horas_semana"][5] == 4 and C["dias"][0]["nome"] == "Nossa Senhora da Conceição")
    # regras
    pg.click(".em-abas button[data-aba=regras]"); pg.wait_for_selector(".em-regra")
    pg.locator(".em-regra", has_text="Foto obrigatória").locator("select").select_option("campo"); pg.wait_for_timeout(800)
    pg.locator(".em-regra", has_text="Comentário obrigatório").locator(".em-sw").click(); pg.wait_for_timeout(800)
    Rg = adm.get(A+"/empresa").json()["regras"]
    check("Regras salvam na hora", Rg["foto"] == "campo" and Rg["comentario_concluir"] is True and pg.locator(".em-regra", has_text="Comentário obrigatório").locator(".em-sw.on").count() == 1)
    # plano
    pg.click(".em-abas button[data-aba=plano]"); pg.wait_for_selector(".em-plano")
    check("Plano: uso de obras, escritório, campo e espaço", pg.locator(".em-uso").count() == 4 and "Teste grátis" in pg.inner_text(".em-plano"))
    pg.click(".em-plano button >> text=Ver os planos"); pg.wait_for_selector(".em-pl")
    check("Ver os planos: os 4 planos lado a lado", pg.locator(".em-pl").count() == 4); pg.click(".eq-jan .eq-acoes button")
    check("Sem erros de JavaScript (administrador)", not erros, erros); c.close()
    # ── gestora só vê ──
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "ana@rawtech.com.br", "Ana-Ribeiro-2026")
    pg.evaluate("tfEmpresa.abrir()"); pg.wait_for_selector(".em-lin:not(.em-th)")
    check("Gestora vê a lista, sem convidar nem trocar perfil", pg.locator("#em-convidar").count() == 0 and pg.locator(".em-perf").count() == 0 and "só o administrador altera" in pg.inner_text(".eq-cab"))
    pg.click(".em-abas button[data-aba=empresa]"); pg.wait_for_selector("#emp-nome")
    check("Gestora: dados da empresa só leitura", pg.locator("#emp-nome").is_disabled() and pg.locator("#emp-salvar").count() == 0); c.close()
    # ── celular ──
    c, m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "wendell@rawtech.com.br", "Obra-Segura-2026")
    m.evaluate("tfEmpresa.abrir()"); m.wait_for_selector(".em-card")
    check("Celular: cartões, sem rolagem lateral", m.locator(".em-card").count() >= 5 and m.evaluate("document.documentElement.scrollWidth") <= 390)
    m.click(".em-card[data-nome='Marcos Silva']"); m.wait_for_selector(".em-folha")
    check("Celular: folha de ações do convite com 'Mandar o link de novo pelo WhatsApp'", "Mandar o link de novo pelo WhatsApp" in m.inner_text(".em-folha"))
    m.click(".em-folha button >> text=Mandar o link de novo pelo WhatsApp"); m.wait_for_selector(".em-link")
    check("Celular: link novo na janela", m.locator(".em-link a").get_attribute("href").startswith("https://wa.me/55")); novo_link = m.input_value(".em-link input")
    check("Sem erros de JavaScript (celular)", not erros, erros); c.close()
    # ── convite aceito e entrar com o celular ──
    c, m = nova(nav, {"width": 390, "height": 844}, True)
    m.goto(novo_link.replace("http://127.0.0.1:8900", B)); m.wait_for_function("document.getElementById('senha-titulo').textContent.includes('Olá')")
    check("Página do convite: nome e com o que vai entrar", "Olá, Marcos" in m.inner_text("#senha-titulo") and "(81) 99876-5432" in m.inner_text("#senha-sub"))
    m.fill("#n-senha", "Marcos-Silva-2026"); m.fill("#n-senha2", "Marcos-Silva-2026"); m.click("#f-senha button[type=submit]"); m.wait_for_url("**/index.html"); m.wait_for_selector(".tf-user")
    check("Criou a senha e entrou como encarregado", "Marcos" in m.locator(".tf-user").text_content()); c.close()
    c, m = nova(nav, {"width": 390, "height": 844}, True)
    m.goto(B+"/entrar.html"); m.fill("#e-email", "(81) 99876-5432"); m.fill("#e-senha", "Marcos-Silva-2026"); m.click("#f-entrar button[type=submit]"); m.wait_for_url("**/index.html")
    check("Entrar com o celular e a senha", m.locator(".tf-user").count() == 1 or m.wait_for_selector(".tf-user") is not None); c.close()
    check("Sem erros de JavaScript (convite)", not erros, erros)
print(f"RESULTADO: {ok} ok, {f} falhas"); sys.exit(1 if f else 0)
