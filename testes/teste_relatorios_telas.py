"""Relatórios (telas): menu só para a gestão, 4 tipos, formulário (obra, período, seções, resumo sugerido e ajustado), prévia ao
lado igual ao impresso, emitir (número, abre o documento), lista dos emitidos (Abrir, Excel, excluir), celular (prévia em tela cheia)."""
import sys, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_rel import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar(); erros = []
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden")
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    # ── encarregado e funcionário não veem ──
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    check("Encarregado não tem Relatórios no menu", pg.locator("#nav-relatorios").count() == 0); c.close()
    # ── gestão no computador ──
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "ana@rawtech.com.br", "Ana-Ribeiro-2026")
    check("Menu: 'Relatórios' (não mais 'Relatório PDF')", pg.locator("#nav-relatorios").count() == 1 and "Relatórios" in pg.inner_text("#nav-relatorios") and "Relatório PDF" not in pg.inner_text(".sidebar"))
    pg.click("#nav-relatorios"); pg.wait_for_selector(".rl-tipo")
    check("Os 4 tipos de relatório", pg.locator(".rl-tipo").count() == 4 and "Nenhum relatório emitido" in pg.inner_text(".rl"))
    check("Título da página", pg.inner_text("#page-title") == "Relatórios")
    pg.click(".rl-tipo[data-tipo=obra]"); pg.wait_for_selector(".rl-frame"); pg.wait_for_function("document.getElementById('rl-resumo').value.length > 50")
    check("Obra: semana passada já escolhida e obra em andamento", pg.locator(".rl-chips button.on").inner_text() == "Semana passada" and pg.locator("#rl-obra option:checked").inner_text().startswith("ELE-014"))
    res = pg.input_value("#rl-resumo")
    check("Resumo sugerido com os números", "a obra avançou" in res and "pontos" in res, res)
    check("Números do período no formulário", pg.locator(".rl-num").count() == 4)
    fr = pg.frame_locator(".rl-frame")
    check("Prévia ao lado: A4 com a logo, PRÉVIA e curva S", fr.locator(".cab img.logo").count() == 1 and fr.locator(".marca").inner_text() == "PRÉVIA" and fr.locator("svg[aria-label='Curva S']").count() == 1)
    check("Semana passada: as fotos de hoje não entram", fr.locator(".fotos img").count() == 0)
    # período: este mês
    pg.click(".rl-chips button >> text=Este mês"); pg.wait_for_timeout(1500)
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
    check("Período 'Este mês' preenche as datas", pg.input_value("#rl-ini") == hoje.replace(day=1).isoformat() and pg.input_value("#rl-fim") == hoje.isoformat())
    check("Resumo refeito com o novo período", "01/11" in pg.input_value("#rl-resumo") or hoje.replace(day=1).strftime("%d/%m") in pg.input_value("#rl-resumo"))
    fr = pg.frame_locator(".rl-frame"); pg.wait_for_timeout(800); nf = fr.locator(".fotos img").count(); carregou = fr.locator(".fotos img").first.evaluate("i => i.naturalWidth") if nf else 0
    check("Este mês: prévia com as fotos (carregadas)", nf == 3 and carregou > 0, (nf, carregou))
    # seções: tirar fotos, pôr RDOs
    pg.locator(".rl-chk", has_text="Fotos do período").locator("input").uncheck(); pg.locator(".rl-chk", has_text="RDOs do período").locator("input").check(); pg.wait_for_timeout(1500)
    fr = pg.frame_locator(".rl-frame")
    check("Seções mudam a prévia (sem fotos, com RDOs)", fr.locator(".fotos").count() == 0 and "RDOS DO PERÍODO" in fr.locator("body").inner_text().upper())
    # resumo ajustado
    pg.fill("#rl-resumo", "Semana boa. Concluímos a mobilização <b>sem</b> acidentes."); pg.wait_for_timeout(1800)
    fr = pg.frame_locator(".rl-frame")
    check("Resumo ajustado aparece na prévia (texto escapado)", "Concluímos a mobilização <b>sem</b> acidentes." in fr.locator(".caixa").first.inner_text() and "ajustado por você" in pg.inner_text(".rl-res"))
    check("Mudar seção não apaga o texto ajustado", pg.input_value("#rl-resumo").startswith("Semana boa"))
    # emitir
    with pg.context.expect_page() as nova_aba: pg.click("#rl-emitir")
    doc = nova_aba.value; doc.wait_for_load_state()
    check("Emitir abre o documento numerado", "REL-ELE-014-01" in doc.inner_text(".tit") and doc.locator(".marca").count() == 0 and "Semana boa" in doc.inner_text(".caixa"))
    check("Documento tem 'Baixar Excel'", doc.locator(".barra a", has_text="Baixar Excel").count() == 1); doc.close()
    pg.wait_for_selector(".rl-lin:not(.rl-th)")
    check("Volta para a lista com o emitido", pg.locator(".rl-lin:not(.rl-th)").count() == 1 and "REL-ELE-014-01" in pg.inner_text(".rl-tab"))
    L = adm.get(A+"/relatorios").json()["emitidos"]
    check("Servidor guardou com seções e resumo", L[0]["referencia"] == "REL-ELE-014-01")
    # gerencial
    pg.click(".rl-tipo[data-tipo=gerencial]"); pg.wait_for_selector(".rl-frame"); pg.wait_for_timeout(500)
    fr = pg.frame_locator(".rl-frame")
    check("Gerencial: sem obra e sem resumo; prévia com as obras e pontos de atenção", pg.locator("#rl-obra").count() == 0 and pg.locator("#rl-resumo").count() == 0
          and "ELE-014" in fr.locator("table").first.inner_text() and "Pontos de atenção".upper() in fr.locator("body").inner_text().upper())
    with pg.context.expect_page() as nova_aba: pg.click("#rl-emitir")
    nova_aba.value.close(); pg.wait_for_selector(".rl-lin:not(.rl-th) >> nth=1")
    # SST e Recursos
    for t, txt in [("sst", "Documentos vencidos"), ("recursos", "Locação no período")]:
        pg.click(f".rl-tipo[data-tipo={t}]"); pg.wait_for_selector(".rl-frame"); pg.wait_for_timeout(400)
        check(f"{t}: prévia monta", txt.upper() in pg.frame_locator(".rl-frame").locator("body").inner_text().upper())
        pg.click(".eq-voltar"); pg.wait_for_selector(".rl-tipo")
    # filtro e Excel
    pg.click(".rl-filtro button >> text=Gerencial")
    check("Filtro por tipo", pg.locator(".rl-lin:not(.rl-th)").count() == 1 and "REL-GER-001" in pg.inner_text(".rl-tab"))
    pg.click(".rl-filtro button >> text=Todos")
    with pg.expect_download() as dl: pg.locator(".rl-lin", has_text="REL-ELE-014-01").locator("a", has_text="Excel").click()
    check("Excel baixa com o nome do relatório", dl.value.suggested_filename == "REL-ELE-014-01.xlsx")
    with pg.context.expect_page() as nova_aba: pg.locator(".rl-lin", has_text="REL-GER-001").locator("button", has_text="Abrir").click()
    d2 = nova_aba.value; d2.wait_for_load_state()
    check("Abrir mostra o emitido (congelado)", "REL-GER-001" in d2.inner_text(".tit")); d2.close()
    check("Gestora não exclui (só administrador)", pg.locator(".rl-x").count() == 0)
    check("Sem erros de JavaScript (computador)", not erros, erros); c.close()
    # ── administrador exclui ──
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    pg.evaluate("tfRelatorios.abrir()"); pg.wait_for_selector(".rl-lin:not(.rl-th)")
    pg.locator(".rl-lin", has_text="REL-GER-001").locator(".rl-x").click(); pg.click(".eq-jan button >> text=Excluir"); pg.wait_for_timeout(800)
    check("Administrador exclui (sai da lista)", "REL-GER-001" not in pg.inner_text(".rl-tab")); c.close()
    # ── celular ──
    c, m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "ana@rawtech.com.br", "Ana-Ribeiro-2026")
    m.evaluate("tfRelatorios.abrir()"); m.wait_for_selector(".rl-tipo")
    check("Celular: tipos em 2 colunas, emitidos em cartões, sem rolagem lateral", m.locator(".rl-card").count() >= 1 and m.evaluate("document.documentElement.scrollWidth") <= 390
          and m.locator(".rl-tipo").nth(1).bounding_box()["y"] == m.locator(".rl-tipo").nth(0).bounding_box()["y"])
    m.click(".rl-tipo[data-tipo=obra]"); m.wait_for_function("document.getElementById('rl-resumo') && document.getElementById('rl-resumo').value.length > 50")
    check("Celular: formulário sem prévia ao lado", m.locator(".rl-prev").count() == 0 and m.evaluate("document.documentElement.scrollWidth") <= 390)
    m.click("button >> text=Ver prévia"); m.wait_for_selector(".rl-tela .rl-frame"); m.wait_for_timeout(500)
    check("Celular: prévia em tela cheia", "PRÉVIA" in m.frame_locator(".rl-tela .rl-frame").locator(".marca").inner_text())
    m.click(".rl-tela button >> text=Fechar")
    check("Sem erros de JavaScript (celular)", not erros, erros); c.close()
print(f"\n{ok} OK, {f} falha(s)"); sys.exit(1 if f else 0)
