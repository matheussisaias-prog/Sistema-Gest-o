import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from dados_obras import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
ids = criar(); erros = []
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(600)
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    pg.on("pageerror", lambda e: erros.append(str(e))); return pg
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = nova(nav, {"width": 1366, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    check("Menu tem Obras e não tem mais Projetos/Portfólio", pg.locator("#nav-obras").count() == 1 and pg.locator(".nav-item[onclick*=\"'portfolio'\"]").count() == 0)
    pg.click("#nav-obras"); pg.wait_for_selector(".ob-card")
    check("Mostra as 5 obras ativas (concluída escondida)", pg.locator(".ob-card").count() == 5, pg.locator(".ob-card").count())
    check("Número de em andamento = 3", pg.locator(".ob-kpi").nth(0).locator(".ob-kpi-val").inner_text() == "3")
    check("Atrasadas = 1, com +1 em atenção", pg.locator(".ob-kpi").nth(1).locator(".ob-kpi-val").inner_text() == "1" and "+1 em atenção" in pg.locator(".ob-kpi").nth(1).inner_text())
    check("Valor em carteira", "1,27 mi" in pg.locator(".ob-kpi").nth(3).inner_text(), pg.locator(".ob-kpi").nth(3).inner_text())
    primeiro = pg.locator(".ob-card").first
    check("Mais atrasada primeiro, com farol vermelho", "MON-021" in primeiro.inner_text() and "Atrasada" in primeiro.locator(".ob-chip-farol.verm").first.inner_text())
    check("Segunda é a de atenção", "Atenção" in pg.locator(".ob-card").nth(1).inner_text())
    mon = pg.locator(".ob-card", has_text="MON-021")
    check("Conta atividade atrasada no cartão", mon.locator(".ob-mini > div").nth(0).locator("b").inner_text() == "1")
    check("Pausada sem farol e planejamento 'começa em'", "Pausada" in pg.locator(".ob-card", has_text="SPDA-003").inner_text() and "começa em 16 dias" in pg.locator(".ob-card", has_text="ELE-016").inner_text())
    pg.fill(".ob-busca input", "goiana"); check("Busca por cliente", pg.locator(".ob-card").count() == 1 and "NR12-007" in pg.locator(".ob-card").inner_text())
    pg.fill(".ob-busca input", ""); pg.select_option(".ob-sel[aria-label=Situação]", "concluidas"); check("Filtro Concluídas", pg.locator(".ob-card").count() == 1 and "ILU-009" in pg.locator(".ob-card").inner_text())
    pg.select_option(".ob-sel[aria-label=Situação]", "ativas"); pg.select_option(".ob-sel[aria-label=Farol]", "verde"); check("Filtro de farol", pg.locator(".ob-card").count() == 1 and "ELE-014" in pg.locator(".ob-card").inner_text())
    pg.select_option(".ob-sel[aria-label=Farol]", ""); pg.click(".ob-vbt[aria-label=Lista]"); check("Vista em lista", pg.locator(".ob-tab tbody tr").count() == 5)
    pg.click(".ob-vbt[aria-label=Cartões]")
    # nova obra
    pg.click(".ob-cab .ob-bt-pri"); pg.wait_for_selector(".ob-form")
    pg.click(".ob-form [type=submit]"); check("Formulário avisa os campos que faltam", "Preencha" in pg.inner_text(".ob-form-erro"))
    pg.fill("[name=codigo]", "ELE-017"); pg.fill("[name=nome]", "Retrofit de iluminação · Galpão 1"); pg.select_option("[name=tipo_servico]", "Elétrica")
    pg.fill("[name=cliente]", "Metalúrgica Nordeste"); pg.fill("[name=numero_contrato]", "PC 4500123456"); pg.fill("[name=valor_contrato]", "150.000,00")
    pg.select_option("[name=rt_funcionario_id]", label="Paulo Melo · Engenheiro eletricista"); pg.fill("[name=art_numero]", "PE20260012345")
    pg.fill("[name=inicio]", "2027-01-10"); pg.fill("[name=fim]", "2027-01-05"); pg.click(".ob-form [type=submit]")
    check("Recusa fim antes do início", "antes do início" in pg.inner_text(".ob-form-erro"))
    pg.fill("[name=fim]", "2027-03-30"); pg.click(".ob-form .ob-corbt >> nth=4"); pg.click(".ob-form [type=submit]")
    pg.wait_for_selector(".ob-form", state="detached"); pg.wait_for_selector(".og-cab h1")
    check("Depois de criar, abre a própria obra para montar o cronograma", "Retrofit de iluminação" in pg.inner_text(".og-cab h1"))
    pg.click("#nav-obras"); pg.wait_for_selector(".ob-card:has-text('ELE-017')")
    check("Cria a obra e ela aparece", pg.locator(".ob-card").count() == 6)
    check("Também entra nas telas antigas (Gantt/Atividades)", pg.evaluate("projects.some(p => p.code === 'ELE-017')"))
    # editar pelo menu
    c = pg.locator(".ob-card", has_text="ELE-017"); c.locator(".ob-menu-bt").click(); pg.click(".ob-menu >> text=Editar"); pg.wait_for_selector(".ob-form")
    check("Editar abre preenchido", pg.input_value("[name=art_numero]") == "PE20260012345" and pg.input_value("[name=valor_contrato]") == "150.000,00")
    pg.fill("[name=local_obra]", "Recife/PE"); pg.click(".ob-form [type=submit]"); pg.wait_for_selector(".ob-form", state="detached")
    pg.wait_for_function("[...document.querySelectorAll('.ob-card')].some(c => c.innerText.includes('ELE-017') && c.innerText.includes('Recife/PE'))"); check("Edição salva", True)
    c = pg.locator(".ob-card", has_text="NR12-007"); c.locator(".ob-menu-bt").click(); pg.click(".ob-menu >> text=Pausar")
    pg.wait_for_function("[...document.querySelectorAll('.ob-card')].some(c => c.innerText.includes('NR12-007') && c.innerText.includes('Pausada'))"); check("Pausar pelo menu", True)
    c = pg.locator(".ob-card", has_text="NR12-007"); c.locator(".ob-menu-bt").click(); pg.click(".ob-menu >> text=Retomar")
    pg.wait_for_function("[...document.querySelectorAll('.ob-card')].some(c => c.innerText.includes('NR12-007') && c.innerText.includes('Atenção'))"); check("Retomar pelo menu", True)
    pg.locator(".ob-card", has_text="ELE-014").locator(".ob-abrir").click(); pg.wait_for_selector("#view-obra.active .og-cab")
    check("Abrir obra leva à Obra aberta", "Subestação 13,8 kV · Galpão 3" in pg.inner_text(".og-cab"))
    # encarregado e funcionário
    e = nova(nav, {"width": 1366, "height": 900}); entrar(e, "jp@rawtech.com.br", "Joao-Paulo-2026"); e.click("#nav-obras"); e.wait_for_selector(".ob-card")
    check("Encarregado vê só a obra dele, sem botão Nova e sem valor", e.locator(".ob-card").count() == 1 and e.locator(".ob-cab .ob-bt-pri").count() == 0 and e.locator(".ob-kpi").count() == 3 and "Contrato" not in e.inner_text(".ob-card"))
    check("Encarregado sem menu de ações", e.locator(".ob-menu-bt").count() == 0)
    fu = nova(nav, {"width": 1366, "height": 900}); entrar(fu, "david@rawtech.com.br", "David-Lima-2026"); check("Funcionário não tem Obras no menu", fu.locator("#nav-obras").count() == 0)
    # celular
    m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "wendell@rawtech.com.br", "Obra-Segura-2026")
    m.evaluate("switchView('obras', document.getElementById('nav-obras'))"); m.wait_for_selector(".ob-card")
    larg = lambda: m.evaluate("document.documentElement.scrollWidth")
    check("Celular: sem rolagem lateral", larg() <= 390, larg())
    check("Celular: filtros escondidos e botões rápidos visíveis", m.locator(".ob-filtros").is_hidden() and m.locator(".ob-chips").is_visible())
    m.click(".ob-chip >> text=Atrasadas"); check("Celular: botão Atrasadas", m.locator(".ob-card").count() == 1)
    m.click(".ob-chip >> text=Minhas"); check("Celular: botão Minhas (gestor = eu)", m.locator(".ob-card").count() == 4, m.locator(".ob-card").count())
    m.click(".ob-chip >> text=Filtros"); check("Celular: Filtros abre os seletores", m.locator(".ob-filtros").is_visible() and larg() <= 390)
    m.click(".ob-cab .ob-bt-pri"); m.wait_for_selector(".ob-form"); check("Celular: formulário em tela cheia sem rolagem lateral", larg() <= 390 and m.locator(".ob-form").bounding_box()["width"] >= 389)
    nav.close()
check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
