import sys; sys.path.insert(0, "/home/claude/telas")
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
    pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-cab")
col = lambda pg, sit: pg.locator(f".oq-col[data-sit='{sit}']")
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = nova(nav, {"width": 1440, "height": 950}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    # ── Quadro ──
    pg.click(".og-aba >> text=Quadro"); pg.wait_for_selector(".oq-col")
    qtd = lambda s: int(col(pg, s).locator(".oq-qtd").inner_text())
    check("Quadro com 4 colunas e as 11 atividades", pg.locator(".oq-col").count() == 4 and sum(qtd(s) for s in ["Pendente", "Em andamento", "Concluído", "Reprogramado"]) == 11)
    check("Atrasada destacada no quadro", col(pg, "Em andamento").locator(".oq-card.atras").count() == 1)
    col(pg, "Pendente").locator(".oq-card", has_text="Malha de aterramento").drag_to(col(pg, "Em andamento"))
    pg.wait_for_function("document.querySelector(\".oq-col[data-sit='Em andamento'] .oq-qtd\").innerText === '4'"); check("Arrastar muda a situação", qtd("Pendente") == 5)
    col(pg, "Em andamento").locator(".oq-card", has_text="Malha de aterramento").locator(".oq-mover").select_option("Concluído")
    pg.wait_for_function("document.querySelector(\".oq-col[data-sit='Concluído'] .oq-qtd\").innerText === '3'")
    check("Mover para Concluído põe 100%", "100%" in col(pg, "Concluído").locator(".oq-card", has_text="Malha de aterramento").inner_text() or col(pg, "Concluído").locator(".oq-card", has_text="Malha").count() == 1)
    col(pg, "Pendente").locator(".oq-card", has_text="QGBT").locator(".oq-mover").select_option("Reprogramado"); pg.wait_for_selector(".og-modal")
    check("Reprogramar pede o motivo", "Por que foi reprogramada" in pg.inner_text(".og-modal"))
    pg.fill(".og-modal textarea", "Cliente adiou a entrega do QGBT"); pg.click(".og-modal .ob-bt-pri")
    pg.wait_for_function("document.querySelector(\".oq-col[data-sit='Reprogramado'] .oq-qtd\").innerText === '1'"); check("Foi para Reprogramado", True)
    col(pg, "Reprogramado").locator(".oq-card").click(); pg.wait_for_selector(".og-painel")
    check("Motivo ficou nas observações", "Cliente adiou" in pg.input_value(".og-painel textarea")); pg.click(".og-p-cab .ob-x")
    pg.select_option(".oq-barra .ob-sel[aria-label=Responsável]", label="Carla Mendes"); check("Filtro por responsável no quadro", pg.locator(".oq-card").count() == 3, pg.locator(".oq-card").count())
    # ── Equipe ──
    pg.click(".og-aba >> text=Equipe da obra"); pg.wait_for_selector(".oe-lin:not(.oe-th)")
    check("Mostra gestor e membros com acesso", "Wendell Xavier" in pg.inner_text(".oe-lista") and "Bruno Costa" in pg.inner_text(".oe-lista"))
    check("Quem trabalha: 3 pessoas", pg.locator(".oe-lin:not(.oe-th)").count() == 3)
    check("Carga das próximas 2 semanas de cada pessoa", pg.locator(".oe-carga small").count() == 3 and all("%" in t for t in pg.locator(".oe-carga small").all_inner_texts()))
    pg.click(".oe-sec .ob-bt >> text=Adicionar pessoa"); pg.wait_for_selector(".og-modal"); pg.select_option(".og-modal select >> nth=0", label="Carla Mendes · funcionario"); pg.select_option(".og-modal select >> nth=1", "funcionario"); pg.click(".og-modal .ob-bt-pri")
    pg.wait_for_function("document.querySelector('.oe-lista').innerText.includes('carla@rawtech.com.br')"); check("Adiciona pessoa à obra", True)
    pg.locator(".oe-pessoa", has_text="carla@").locator(".og-x").click(); pg.wait_for_selector(".og-modal"); pg.click(".og-modal .og-bt-perigo")
    pg.wait_for_function("!document.querySelector('.oe-lista').innerText.includes('carla@rawtech.com.br')"); check("Tira o acesso", True)
    # ── Linha de base e histórico ──
    pg.click(".og-aba >> text=Linha de base e histórico"); pg.wait_for_selector(".ol-hist li")
    check("Lista a linha de base original", "Original" in pg.inner_text(".ol-tab") and pg.locator(".ol-lin:not(.ol-th)").count() == 1)
    pg.click(".ol-lin .og-link"); pg.wait_for_selector(".ol-cmp-lin")
    check("Comparar mostra quem atrasou (+2 dias)", "+2 dias" in pg.locator(".ol-cmp-lin", has_text="Eletrodutos").inner_text())
    check("Histórico com as mudanças do dia", "Reprogramado" in pg.inner_text(".ol-hist") or "situação" in pg.inner_text(".ol-hist"))
    pg.select_option(".oe-sec .ob-sel[aria-label='Filtrar histórico']", "linhas_base"); check("Filtro do histórico", "linha de base original" in pg.inner_text(".ol-hist"))
    # ── Calendário ──
    pg.click(".og-aba >> text=Cronograma"); pg.wait_for_selector(".og-lin[data-id]")
    fim_antes = pg.locator(".og-lin[data-id]", has_text="Transformadores 1 MVA").locator(".c-data").nth(1).inner_text()
    pg.click(".og-dado .og-link"); pg.wait_for_selector(".oc-lista"); check("Abre a escolha de calendário (Padrão marcado)", "on" in pg.locator(".oc-op").first.get_attribute("class"))
    pg.click(".oc-jan .ob-bt >> text=Novo calendário"); pg.wait_for_selector(".oc-cols")
    pg.fill(".oc-jan .ob-campo input", "Com sábado"); pg.locator(".oc-sw").nth(5).click(); pg.locator(".oc-dia").nth(5).locator("input").fill("4")
    pg.click(".oc-jan .ob-bt >> text=Adicionar"); pg.locator(".oc-linha select").select_option("parado"); pg.locator(".oc-linha input[type=date]").first.fill("2026-12-24"); pg.locator(".oc-linha input[type=date]").nth(1).fill("2026-12-31"); pg.locator(".oc-linha input:not([type])").fill("Recesso")
    pg.click(".oc-jan .ob-bt-pri"); pg.wait_for_selector(".oc-lista")
    check("Calendário criado e já usado na obra", "on" in pg.locator(".oc-op", has_text="Com sábado").get_attribute("class"))
    pg.click(".oc-jan .ob-bt >> text=Cancelar"); pg.wait_for_function("document.querySelector('.og-dado .og-link').innerText === 'Com sábado'")
    fim_dep = pg.locator(".og-lin[data-id]", has_text="Transformadores 1 MVA").locator(".c-data").nth(1).inner_text()
    check("Datas recalculadas pelo calendário novo", "Sáb 4 h" in pg.inner_text(".og-cab") and fim_dep != fim_antes, (fim_antes, fim_dep))
    pg.click(".og-dado .og-link"); pg.wait_for_selector(".oc-lista"); pg.click(".oc-op >> nth=0"); pg.click(".oc-jan .ob-bt-pri")
    pg.wait_for_function("document.querySelector('.og-dado .og-link').innerText === 'Padrão'"); check("Volta para o calendário Padrão", True)
    # ── encarregado e celular ──
    e = nova(nav, {"width": 1440, "height": 900}); entrar(e, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    e.click(".og-aba >> text=Equipe da obra"); e.wait_for_selector(".oe-lin:not(.oe-th)"); check("Encarregado não adiciona pessoas", e.locator(".oe-sec .ob-bt").count() == 0 and e.locator(".oe-pessoa .og-x").count() == 0)
    e.click(".og-aba >> text=Quadro"); e.wait_for_selector(".oq-mover"); check("Encarregado move no quadro", e.locator(".oq-mover").count() >= 1)
    m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "wendell@rawtech.com.br", "Obra-Segura-2026")
    larg = lambda: m.evaluate("document.documentElement.scrollWidth")
    for aba in ["Quadro", "Equipe", "Linha de base"]:
        m.click(f".og-aba >> text={aba}"); m.wait_for_timeout(900)
        check(f"Celular: aba {aba} sem rolagem lateral", larg() <= 390, larg())
    nav.close()
check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
