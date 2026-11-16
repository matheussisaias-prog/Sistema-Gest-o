"""Histórico e Importar (telas): menu (funcionário sem Histórico; Importar só para a gestão); linha do tempo com dias, ícones,
antes → depois e Abrir; filtros (tipo, obra, busca); Excel; encarregado; importar MS Project (prévia, obra nova, abre a obra),
obra existente com substituir (confirmação); celular sem rolagem lateral."""
import sys, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_rdo import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar(); erros = []
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
adm.patch(A+f"/atividades/{ids['e2']}", json={"duracao_dias": 4})
open("/tmp/ELE-014.xml", "w").write(adm.get(A+f"/obras/{pid}/exportar?formato=mspdi").text)
open("/tmp/NR12.xlsx", "wb").write(adm.get(A+f"/obras/{p2}/exportar?formato=xlsx").content)
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR", accept_downloads=True); rotas(c)
    c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page(); pg.on("pageerror", lambda e: erros.append(str(e))); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden")
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "carla@rawtech.com.br", "Carla-Mendes-2026")
    check("Funcionária sem Histórico e sem Importar no menu", pg.locator("#nav-historico").count() == 0 and pg.locator("#nav-importar").count() == 0); c.close()
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    check("Encarregado: Histórico sim, Importar não", pg.locator("#nav-historico").count() == 1 and pg.locator("#nav-importar").count() == 0)
    pg.click("#nav-historico"); pg.wait_for_selector(".hi-item")
    check("Encarregado: só a obra dele e sem filtro de pessoa", pg.locator("#hi-pessoa").count() == 0 and all(t == "ELE-014" for t in pg.locator(".hi-dir .eq-selo").all_inner_texts())); c.close()
    # ── administrador ──
    c, pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg, "wendell@rawtech.com.br", "Obra-Segura-2026")
    pg.click("#nav-historico"); pg.wait_for_selector(".hi-item")
    check("Histórico abre com dias, ícones e frases", pg.inner_text("#page-title") == "Histórico" and pg.locator(".hi-dia").first.inner_text().upper().startswith("HOJE") and pg.locator(".hi-ic").count() == pg.locator(".hi-item").count()
          and "atualizou “Eletrodutos e caixas de passagem” de 30% para 40%" in pg.inner_text(".hi-lista"))
    check("Antes → depois na mudança de cronograma", pg.locator(".hi-item", has_text="mudou “Montagem do transformador 1”").locator(".hi-det").count() == 1 and "Duração" in pg.locator(".hi-item", has_text="mudou “Montagem do transformador 1”").inner_text())
    check("Ao lado: total, pessoas e quem mais registrou", pg.locator(".hi-lado .eq-kpi").count() == 2 and pg.locator(".hi-rank div").count() >= 2)
    pg.click(".hi-tipos button[data-tipo=rdo]"); pg.wait_for_timeout(900)
    check("Filtro 'RDO e relatórios'", pg.locator(".hi-item").count() >= 8 and all("RDO" in t for t in pg.locator(".hi-item .hi-txt").all_inner_texts()))
    pg.click(".hi-tipos button[data-tipo='']"); pg.wait_for_timeout(700)
    pg.select_option("#hi-obra", str(p2)); pg.wait_for_timeout(900)
    check("Filtro por obra", pg.locator(".hi-item").count() >= 1 and all(t == "NR12-007" for t in pg.locator(".hi-dir .eq-selo").all_inner_texts()))
    pg.select_option("#hi-obra", ""); pg.wait_for_timeout(700)
    pg.fill("#hi-busca", "Malha"); pg.wait_for_timeout(1200)
    check("Busca sem perder o que está digitando", pg.locator(".hi-item").count() >= 1 and pg.evaluate("document.activeElement.id") == "hi-busca" and pg.input_value("#hi-busca") == "Malha")
    with pg.expect_download() as dl: pg.click("#hi-excel")
    check("Baixar Excel do que está filtrado", dl.value.suggested_filename.endswith(".xlsx"))
    pg.fill("#hi-busca", ""); pg.wait_for_timeout(1000)
    pg.locator(".hi-item", has_text="mudou “Montagem do transformador 1”").locator(".hi-abrir").click(); pg.wait_for_selector(".og-painel", timeout=10000)
    check("Abrir leva à obra com a atividade aberta", "Montagem do transformador 1" in pg.inner_text(".og-painel"))
    # importar
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    if pg.locator(".og-painel-fundo").count(): pg.mouse.click(5, 450); pg.wait_for_timeout(300)
    pg.click("#nav-importar"); pg.wait_for_selector("#im-drop")
    check("Importar: 3 passos e como funciona", pg.locator(".im-passos span").count() == 3 and pg.locator(".im-ajuda").count() == 1 and pg.locator(".im-nota a[href='api/importar/modelo']").count() == 1)
    pg.set_input_files("#im-arq", "/tmp/ELE-014.xml"); pg.wait_for_selector(".im-kpis")
    check("Prévia do MS Project: números e responsáveis achados", "MS Project" in pg.inner_text(".im-arq") and pg.locator(".im-lin:not(.im-th)").count() >= 15 and "✓ Bruno Costa" in pg.inner_text(".im-tab"))
    check("Obra nova já com o nome e o início do arquivo", pg.input_value("#im-nome").startswith("ELE-014") and pg.input_value("#im-inicio") != "")
    pg.fill("#im-nome", ""); pg.locator("#im-nome").dispatch_event("change"); pg.wait_for_timeout(200)
    check("Sem nome: botão desligado e aviso", pg.locator("#im-importar").is_disabled() and "Falta o nome da obra" in pg.inner_text(".im-t3"))
    pg.fill("#im-codigo", "SUB-015"); pg.fill("#im-nome", "Subestação Galpão 5"); pg.locator("#im-nome").dispatch_event("change"); pg.fill("#im-cliente", "Metalúrgica Nordeste"); pg.wait_for_timeout(200)
    check("Com nome: pronto para importar (passo 3)", not pg.locator("#im-importar").is_disabled() and pg.locator(".im-passos .atual").inner_text().endswith("Conferir e importar"))
    pg.click("#im-importar"); pg.wait_for_selector(".og-lin[data-id]", timeout=15000)
    nova_id = int(adm.get(A+"/importacoes").json()["importacoes"][0]["projeto_id"])
    check("Importou e abriu a obra nova", "SUB-015" in pg.inner_text("#view-obra") and adm.get(A+"/importacoes").json()["importacoes"][0]["destino"] == "nova")
    # obra existente: substituir
    pg.click("#nav-importar"); pg.wait_for_selector("#im-drop")
    check("Importações feitas aparecem embaixo", "ELE-014.xml" in pg.inner_text(".im-hist"))
    pg.set_input_files("#im-arq", "/tmp/NR12.xlsx"); pg.wait_for_selector(".im-kpis")
    pg.click(".im-op[data-destino=existente]"); pg.select_option("#im-obra", str(nova_id)); pg.click(".im-op[data-substituir='1']")
    check("Substituir mostra o aviso", "Substituir apaga" in pg.inner_text(".im-sec >> nth=2"))
    pg.click("#im-importar"); pg.wait_for_selector(".eq-jan")
    check("Pede confirmação antes de substituir", "atividades atuais" in pg.inner_text(".eq-jan"))
    pg.click("#im-ok"); pg.wait_for_selector(".og-lin[data-id]", timeout=15000); pg.wait_for_timeout(500)
    check("Substituiu o cronograma da obra", adm.get(A+"/importacoes").json()["importacoes"][0]["destino"] == "substituiu")
    check("Sem erros de JavaScript (computador)", not erros, erros); c.close()
    # ── celular ──
    c, m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "wendell@rawtech.com.br", "Obra-Segura-2026")
    m.evaluate("tfHistorico.abrir()"); m.wait_for_selector(".hi-item")
    check("Celular: histórico sem rolagem lateral, hora e obra na linha", m.evaluate("document.documentElement.scrollWidth") <= 390 and m.locator(".hi-meta").count() >= 1)
    m.evaluate("tfImportar.abrir()"); m.wait_for_selector("#im-drop"); m.set_input_files("#im-arq", "/tmp/ELE-014.xml"); m.wait_for_selector(".im-kpis")
    check("Celular: importar sem rolagem lateral e números em 2 colunas", m.evaluate("document.documentElement.scrollWidth") <= 390 and m.evaluate("getComputedStyle(document.querySelector('.im-kpis')).display") == "grid")
    check("Sem erros de JavaScript (celular)", not erros, erros); c.close()
print(f"RESULTADO: {ok} ok, {f} falhas"); sys.exit(1 if f else 0)
