import sys, requests; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from dados_crono import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid1, _ = criar(); erros = []
s = requests.Session(); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
pid = s.post(A+"/projetos", json={"codigo": "ELE-017", "nome": "Retrofit de iluminação · Galpão 1", "cliente": "Metalúrgica Nordeste", "tipo_servico": "Elétrica", "situacao": "Planejamento", "inicio": "2027-01-11", "fim": "2027-03-26"}).json()["id"]
xlsx = s.get(A+f"/obras/{pid1}/exportar?formato=xlsx").content; open("/tmp/crono.xlsx", "wb").write(xlsx)
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, accept_downloads=True); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return pg
def entrar(pg):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(400)
linhas = lambda pg: pg.locator(".og-esq .og-lin[data-id]").count()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = nova(nav, {"width": 1440, "height": 950}); entrar(pg)
    pg.evaluate(f"tfObra.abrir({pid})"); pg.wait_for_selector(".og-vazio-crono")
    check("Obra vazia oferece montar", pg.locator(".og-vazio-crono .ob-bt-pri").count() == 1)
    pg.click(".og-vazio-crono .ob-bt-pri"); pg.wait_for_selector(".om-mod")
    check("Abre já num modelo do tipo da obra, com prévia", "on" in pg.locator(".om-mod").first.get_attribute("class") and pg.locator(".om-pl").count() > 5)
    pg.click(".om-busca input"); pg.fill(".om-busca input", "ilumina"); pg.click(".om-mod >> text=Retrofit de iluminação industrial")
    check("Prévia do modelo escolhido", pg.locator(".om-pl").count() == 12 and "Montagem das luminárias LED" in pg.inner_text(".om-previa"))
    pg.click(".om-pe .ob-bt-pri"); pg.wait_for_selector(".om-jan", state="detached"); pg.wait_for_selector(".og-lin[data-id]")
    check("Modelo aplicado: 12 linhas no cronograma", linhas(pg) == 12, linhas(pg))
    check("Começa na data da obra", pg.locator(".og-lin[data-id]").nth(1).locator(".c-data").first.inner_text() == "11/01")
    # salvar como modelo
    pg.click(".og-mais"); pg.click(".ob-menu >> text=Salvar como modelo"); pg.wait_for_selector(".og-modal"); pg.fill(".og-modal input", "Retrofit Rawtech"); pg.click(".og-modal .ob-bt-pri"); pg.wait_for_timeout(600)
    check("Salva a obra como modelo", any(m["nome"] == "Retrofit Rawtech" for m in s.get(A+"/modelos").json()["modelos"]))
    # copiar etapa de outra obra
    pg.click(".og-mais"); pg.click(".ob-menu >> text=Montar / importar cronograma"); pg.wait_for_selector(".om-op")
    pg.click(".om-op >> text=Copiar de outra obra"); pg.wait_for_selector(".om-corpo select"); pg.select_option(".om-corpo select", str(pid1)); pg.wait_for_selector(".om-etapas input")
    check("Lista as etapas da outra obra", pg.locator(".om-etapas input").count() == 4)
    for i in range(3): pg.locator(".om-etapas input").nth(i).uncheck()
    pg.click(".om-pe .ob-bt-pri"); pg.wait_for_selector(".om-jan", state="detached"); pg.wait_for_function("document.querySelectorAll('.og-esq .og-lin[data-id]').length === 15")
    check("Copia só a etapa Comissionamento (acrescenta 3)", "Comissionamento" in pg.inner_text(".og-esq"))
    # colar do Excel na nova linha
    pg.click(".og-nova-inp")
    pg.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'Atividade\\tDuração\\tResponsável\\nPintura das eletrocalhas\\t2\\tCarla Mendes\\nLimpeza final\\t1\\t'); 
       document.querySelector('.og-nova-inp').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
    pg.wait_for_selector(".om-ta"); pg.wait_for_selector(".om-previa", timeout=6000)
    check("Colar várias linhas abre o 'Colar do Excel' com prévia", "Pintura das eletrocalhas" in pg.inner_text(".om-previa") and pg.locator(".om-pl").count() == 2)
    pg.click(".om-pe .ob-bt-pri"); pg.wait_for_selector(".om-jan", state="detached"); pg.wait_for_function("document.querySelectorAll('.og-esq .og-lin[data-id]').length === 17")
    check("Colou 2 atividades com responsável pelo nome", "Carla Mendes" in pg.locator(".og-lin[data-id]", has_text="Pintura das eletrocalhas").inner_text())
    # importar arquivo (substituir)
    pg.click(".og-mais"); pg.click(".ob-menu >> text=Montar / importar cronograma"); pg.wait_for_selector(".om-op"); pg.click(".om-op >> text=Importar arquivo")
    pg.set_input_files(".om-arq input[type=file]", "/tmp/crono.xlsx"); pg.wait_for_selector(".om-previa")
    check("Prévia do Excel importado", "15 linhas" in pg.inner_text(".om-previa-cab"), pg.inner_text(".om-previa-cab"))
    pg.select_option(".om-pe select", "1"); pg.click(".om-pe .ob-bt-pri"); pg.wait_for_selector(".og-modal .og-bt-perigo"); pg.click(".og-modal .og-bt-perigo")
    pg.wait_for_selector(".om-jan", state="detached"); pg.wait_for_function("document.querySelectorAll('.og-esq .og-lin[data-id]').length === 15")
    check("Substituiu pelo cronograma do Excel, mantendo ligações", pg.locator(".og-setas > path").count() == 9, pg.locator(".og-setas > path").count())
    # exportar
    pg.click(".og-acoes .ob-bt >> text=Exportar"); pg.wait_for_selector(".om-exp")
    with pg.expect_download() as d: pg.click(".om-exp >> text=Excel (.xlsx)")
    check("Exportar Excel baixa o .xlsx", d.value.suggested_filename.endswith(".xlsx"), d.value.suggested_filename)
    pg.click(".og-acoes .ob-bt >> text=Exportar")
    with pg.expect_download() as d: pg.click(".om-exp >> text=MS Project (.xml)")
    check("Exportar MS Project baixa o .xml", d.value.suggested_filename.endswith(".xml"))
    pg.click(".og-acoes .ob-bt >> text=Exportar")
    with pg.expect_popup() as pp: pg.click(".om-exp >> text=PDF para imprimir")
    w = pp.value; w.wait_for_load_state()
    check("PDF: abre a folha para imprimir com tabela e Gantt", w.locator("tbody tr").count() == 15 and w.locator("td.g i.b").count() >= 10)
    w.close()
    # celular
    m = nova(nav, {"width": 390, "height": 844}, True); entrar(m); m.evaluate(f"tfObra.abrir({pid})"); m.wait_for_selector(".og-cab")
    m.click(".og-mais"); m.click(".ob-menu >> text=Montar / importar cronograma"); m.wait_for_selector(".om-mod")
    check("Celular: montar em tela cheia sem rolagem lateral", m.evaluate("document.documentElement.scrollWidth") <= 390 and m.locator(".om-jan").bounding_box()["width"] >= 389)
    nav.close()
check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
