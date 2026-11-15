import sys, re; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from dados_crono import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, ids = criar(); erros = []
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(500)
def abrir(pg):
    pg.evaluate("switchView('obras', document.getElementById('nav-obras'))"); pg.wait_for_selector(".ob-card"); pg.click(".ob-card .ob-abrir"); pg.wait_for_selector(".og-lin[data-id]")
linhas = lambda pg: pg.locator(".og-esq .og-lin[data-id]")
lin = lambda pg, txt: pg.locator(".og-esq .og-lin[data-id]", has_text=txt).first
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = nova(nav, {"width": 1440, "height": 950}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026"); abrir(pg)
    check("Abrir obra mostra o cabeçalho da obra", "Subestação 13,8 kV" in pg.inner_text(".og-cab h1") and "PE20260012345" in pg.inner_text(".og-cab"))
    check("Tabela com 4 etapas e 11 atividades", linhas(pg).count() == 15 and pg.locator(".og-lin.etapa").count() == 4, linhas(pg).count())
    check("EAP numerada", lin(pg, "Malha de aterramento").locator(".c-eap").inner_text() == "2.3")
    check("Atividade atrasada em vermelho (1.3)", "atras" in lin(pg, "as-built").get_attribute("class") and pg.locator(".og-barra.atras").count() >= 1)
    check("Caminho crítico marcado no Gantt", pg.locator(".og-barra.crit").count() >= 6, pg.locator(".og-barra.crit").count())
    check("Linha de base aparece embaixo das barras", pg.locator(".og-base").count() >= 10)
    check("Setas das ligações", pg.locator(".og-setas > path").count() == 9, pg.locator(".og-setas > path").count())
    check("Marco em losango", pg.locator(".og-marco").count() == 1)
    pg.locator(".og-lin.etapa .og-tog").first.click(); check("Fechar etapa esconde as subatividades", linhas(pg).count() == 12)
    pg.locator(".og-lin.etapa .og-tog").first.click()
    pg.select_option(".og-barra-crono .ob-sel[aria-label=Mostrar]", "atrasadas"); check("Filtro Atrasadas (atividade + etapa)", linhas(pg).count() == 2)
    pg.select_option(".og-barra-crono .ob-sel[aria-label=Mostrar]", "todas")
    # editar duração na célula: avisa o empurrão
    ini23 = lin(pg, "Malha de aterramento").locator(".c-data").first.inner_text()
    lin(pg, "Base dos transformadores").locator(".c-dur").click(); pg.fill(".og-inp", "13"); pg.keyboard.press("Enter")
    pg.wait_for_selector(".og-modal"); check("Mudar a duração avisa o que vai ser empurrado", "empurra" in pg.inner_text(".og-modal") and "Malha de aterramento" in pg.inner_text(".og-modal"))
    pg.click(".og-modal .ob-bt-pri"); pg.wait_for_function(f"!document.querySelector('.og-modal') && [...document.querySelectorAll('.og-lin')].some(l => l.innerText.includes('Malha de aterramento') && !l.innerText.includes('{ini23}'))", timeout=8000)
    check("Salvou e empurrou a malha de aterramento", lin(pg, "Base dos transformadores").locator(".c-dur").inner_text() == "13d")
    # nova linha e Tab
    pg.click(".og-nova-inp"); pg.fill(".og-nova-inp", "Limpeza final"); pg.keyboard.press("Enter")
    pg.wait_for_function("[...document.querySelectorAll('.og-lin')].some(l => l.innerText.includes('Limpeza final'))"); check("Enter cria a linha nova", linhas(pg).count() == 16)
    check("Depois do Enter o cursor volta para a nova linha", pg.evaluate("document.activeElement.classList.contains('og-nova-inp')"))
    pg.keyboard.press("Tab"); pg.wait_for_selector(".og-nova-inp[placeholder*='subatividade']"); pg.fill(".og-nova-inp", "Retirada de entulho"); pg.keyboard.press("Enter")
    pg.wait_for_function("[...document.querySelectorAll('.og-lin')].some(l => l.innerText.includes('Retirada de entulho'))")
    check("Tab cria subatividade (Limpeza final vira etapa)", "etapa" in lin(pg, "Limpeza final").get_attribute("class") and lin(pg, "Retirada de entulho").locator(".c-eap").inner_text().endswith(".1"))
    # editar nome na célula
    lin(pg, "Retirada de entulho").locator(".og-nome-txt").click(); pg.fill(".og-inp", "Retirada de entulho e sobras"); pg.keyboard.press("Escape")
    check("Esc cancela a edição", lin(pg, "Retirada de entulho").inner_text().count("sobras") == 0)
    # painel
    lin(pg, "Base dos transformadores").locator(".og-abre").click(force=True); pg.wait_for_selector(".og-painel")
    check("Painel mostra a predecessora 1.2", "1.2 Integração NR-10" in pg.inner_text(".og-preds"))
    pg.fill(".og-painel input[placeholder='ex.: 5d']", "18d"); pg.wait_for_selector(".og-aviso:not([hidden])", timeout=5000)
    check("Painel avisa o empurrão antes de salvar", "empurra" in pg.inner_text(".og-aviso") and "Salvar e empurrar" in pg.inner_text(".og-p-pe .ob-bt-pri"))
    pg.click(".og-p-pe .ob-bt >> text=Cancelar"); pg.wait_for_selector(".og-painel", state="detached")
    lin(pg, "Retirada de entulho").locator(".og-abre").click(force=True); pg.wait_for_selector(".og-painel")
    pg.select_option(".og-pred.nova select >> nth=0", label="4.1 · Ensaios e testes"); pg.click(".og-pred.nova .ob-bt")
    pg.wait_for_function("document.querySelector('.og-preds') && document.querySelector('.og-preds').innerText.includes('Ensaios e testes')"); check("Liga predecessora pelo painel", True)
    pg.click(".og-pred .og-x"); pg.wait_for_function("document.querySelector('.og-preds') && !document.querySelector('.og-preds').innerText.includes('4.1 Ensaios')"); check("Remove a ligação", True)
    pg.click(".og-p-cab .ob-x"); pg.wait_for_selector(".og-painel", state="detached")
    # encadear
    lin(pg, "Retirada de entulho").locator(".c-sel input").check(); lin(pg, "Energização").locator(".c-sel input").check()
    pg.locator(".og-barra-crono .ob-bt", has_text="Encadear (2)").click()
    pg.wait_for_function("[...document.querySelectorAll('.og-lin')].some(l => l.innerText.includes('Retirada de entulho') && l.querySelector('.c-pred').innerText.trim() === '4.2')")
    check("Encadear liga as selecionadas na ordem do cronograma", True)
    # linha de base: reprogramar exige motivo
    pg.click(".og-acoes .ob-bt >> text=Reprogramar linha de base"); pg.wait_for_selector(".og-modal"); pg.click(".og-modal .ob-bt-pri"); pg.wait_for_timeout(500)
    check("Reprogramar sem motivo é recusado", pg.locator(".og-modal").count() == 0 and "motivo" in pg.inner_text("body").lower())
    pg.click(".og-acoes .ob-bt >> text=Reprogramar linha de base"); pg.wait_for_selector(".og-modal"); pg.fill(".og-modal textarea", "Base dos transformadores atrasou com a chuva"); pg.click(".og-modal .ob-bt-pri")
    pg.wait_for_timeout(800); check("Reprogramação com motivo salva", "Reprogramação nº 1" in pg.inner_text("body"))
    check("Escala em meses e dias", (pg.click(".og-escala button >> text=Meses"), pg.locator(".og-t").count() >= 3)[1] and (pg.click(".og-escala button >> text=Dias"), pg.locator(".og-t.dia").count() > 60)[1])
    # encarregado
    e = nova(nav, {"width": 1440, "height": 900}); entrar(e, "bruno@rawtech.com.br", "Bruno-Costa-2026"); abrir(e)
    check("Encarregado: sem botões de editar, sem nova linha", e.locator(".og-acoes").count() == 0 and e.locator(".og-nova-inp").count() == 0 and e.locator(".c-sel input").count() == 0)
    lin(e, "Malha de aterramento").locator(".c-pct").click(); e.fill(".og-inp", "20"); e.keyboard.press("Enter")
    e.wait_for_function("[...document.querySelectorAll('.og-lin')].some(l => l.innerText.includes('Malha de aterramento') && l.innerText.includes('20%'))"); check("Encarregado atualiza o avanço na célula", True)
    check("Encarregado não edita datas", "ed" not in (lin(e, "Malha de aterramento").locator(".c-dur").get_attribute("class") or "").split())
    # celular
    m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "wendell@rawtech.com.br", "Obra-Segura-2026"); m.mouse.move(250, 500); abrir(m) if False else None
    m.evaluate("switchView('obras', document.getElementById('nav-obras'))"); m.wait_for_selector(".ob-card"); m.click(".ob-card .ob-abrir"); m.wait_for_selector(".og-cel-card")
    larg = lambda: m.evaluate("document.documentElement.scrollWidth")
    check("Celular: cartões por etapa, sem Gantt e sem rolagem lateral", m.locator(".og-area").count() == 0 and m.locator(".og-cel-etapa").count() >= 4 and larg() <= 390, larg())
    card = m.locator(".og-cel-card", has_text="Eletrodutos"); antes = card.locator(".og-cel-bar small").inner_text()
    card.locator("button[aria-label='Aumentar 10%']").click()
    m.wait_for_function("[...document.querySelectorAll('.og-cel-card')].some(c => c.innerText.includes('Eletrodutos') && c.innerText.includes('40% feito'))"); check("Celular: botão + aumenta o avanço", antes == "30% feito")
    m.click(".og-chips .ob-chip >> text=Atrasadas"); check("Celular: filtro Atrasadas", m.locator(".og-cel-card").count() == 1)
    m.click(".og-fab"); m.wait_for_selector(".og-painel"); check("Celular: + Atividade abre o painel em tela cheia", m.locator(".og-painel").bounding_box()["width"] >= 389 and larg() <= 390)
    nav.close()
check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
