"""Equipe (telas): lista, filtros, ficha (documentos com certificado, ausências, agenda, dados), cargos, nova pessoa,
encarregado só com a equipe dele, celular; Obra aberta com documentos exigidos e aviso ao alocar."""
import sys, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_equipe import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
open("/tmp/nr33.pdf", "wb").write(b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF")
pid, ids, F = montar(); erros = []
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden")
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    c, g = nova(nav, {"width": 1440, "height": 1000}); entrar(g, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g.click("#nav-pessoas"); g.wait_for_selector(".eq-card")
    check("Menu Equipe abre a tela nova com todas as pessoas", g.locator("#view-pessoas.active").count() == 1 and g.locator(".eq-card").count() == 6)
    check("Indicadores: ausentes e documentos vencidos/faltando", g.locator(".eq-kpi.azul b").inner_text() == "1" and int(g.locator(".eq-kpi.verm b").inner_text()) >= 2)
    g.click(".eq-kpi.verm"); g.wait_for_timeout(200)
    check("Clicar no indicador filtra quem tem documento vencido ou faltando", all("Falta" in t or "vencido" in t for t in g.locator(".eq-card .eq-selos").all_inner_texts()) and g.locator(".eq-card").count() >= 2)
    g.click(".eq-kpi.verm"); g.fill(".eq-busca input", "diego"); g.wait_for_timeout(200)
    check("Busca por nome", g.locator(".eq-card").count() == 1 and "Diego" in g.inner_text(".eq-card"))
    check("Cartão mostra ASO vencido, encarregado e obra", "ASO vencido" in g.inner_text(".eq-card") and "Bruno Costa" in g.inner_text(".eq-card") and "ELE-014" in g.inner_text(".eq-card"))
    g.fill(".eq-busca input", ""); g.click(".eq-card >> text=Carla Mendes"); g.wait_for_selector(".eq-doc")
    check("Ficha: documentos exigidos pelo cargo e pela atividade (NR-33 falta)", g.locator(".eq-doc").count() == 5 and "Malha de aterramento" in g.locator(".eq-doc.falta").inner_text())
    g.locator(".eq-doc.falta .eq-bt").click(); g.wait_for_selector(".eq-jan")
    check("Lançar já vem com o documento escolhido e o vencimento explicado", "Espaço confinado" in g.locator(".eq-jan select").first.evaluate("s => s.options[s.selectedIndex].text") and "validade 1 ano" in g.inner_text(".eq-jan"))
    g.fill(".eq-jan input[type=date]", "2026-11-02"); g.fill(".eq-jan input[placeholder='Ex.: SENAI']", "SENAI"); g.set_input_files(".eq-jan input[type=file]", "/tmp/nr33.pdf")
    g.click(".eq-jan .eq-bt.pri"); g.wait_for_selector(".eq-jan", state="detached"); g.wait_for_function("!document.querySelector('.eq-doc.falta')")
    linha = g.locator(".eq-doc", has_text="NR-33")
    check("NR-33 lançada: em dia, vence em 1 ano e com o certificado", "Em dia" in linha.inner_text() and "02/11/2027" in linha.inner_text() and linha.locator("a >> text=certificado").count() == 1)
    g.click(".eq-abas button >> text=Ausências"); g.wait_for_selector(".eq-aus-nova")
    g.locator(".eq-aus-nova select").select_option("Folga"); g.fill(".eq-aus-nova input >> nth=0", "2026-12-24"); g.fill(".eq-aus-nova input >> nth=1", "2026-12-26"); g.click(".eq-aus-nova .eq-bt")
    g.wait_for_selector(".eq-aus >> text=Folga")
    check("Inclui ausência (folga de 3 dias)", "3 dias" in g.inner_text(".eq-aus"))
    g.click(".eq-aus .eq-x"); g.wait_for_selector(".eq-aus", state="detached")
    check("Tira a ausência", g.locator(".eq-aus").count() == 0)
    g.click(".eq-abas button >> text=Agenda"); g.wait_for_selector(".eq-g-b")
    check("Agenda com as atividades em barras", g.locator(".eq-g-lin:not(.cab)").count() >= 2)
    g.click(".eq-abas button >> text=Dados"); g.fill(".eq-form input[data-k=telefone]", "(81) 97777-1234"); g.click(".eq-acoes .eq-bt.pri"); g.wait_for_timeout(1200)
    check("Edita dados (telefone)", [x for x in adm.get(A+"/equipe").json()["pessoas"] if x["nome"] == "Carla Mendes"][0]["telefone"] == "(81) 97777-1234")
    # cargos
    g.click(".eq-voltar"); g.wait_for_selector(".eq-card"); g.click("button >> text=Cargos e documentos exigidos"); g.wait_for_selector(".eq-cg-item")
    g.click(".eq-cg >> text=Ajudante"); g.fill(".eq-cg-docs > input", "nr-10 bas"); g.wait_for_timeout(200)
    g.locator(".eq-cg-item", has_text="NR-10 Básico").locator("input").check(); g.click(".eq-jan .eq-acoes .eq-bt.pri"); g.wait_for_timeout(1000)
    aj = [x for x in adm.get(A+"/cargos-documentos").json()["cargos"] if x["cargo"] == "Ajudante"][0]
    check("Cargos: Ajudante passa a exigir NR-10 Básico", len(aj["tipos"]) == 3)
    g.keyboard.press("Escape")
    # nova pessoa
    g.click("button >> text=Nova pessoa"); g.wait_for_selector(".eq-jan .eq-form")
    g.fill(".eq-jan input[data-k=nome]", "Rafael Lima"); g.fill(".eq-jan input[data-k=cargo]", "Eletricista"); g.click(".eq-jan .eq-acoes .eq-bt.pri")
    g.wait_for_selector(".eq-ficha-t >> text=Rafael Lima")
    check("Nova pessoa: cadastra e abre a ficha já com os exigidos do cargo", g.locator(".eq-doc.falta").count() == 4)
    # Obra aberta
    g.evaluate(f"tfObra.abrir({pid})"); g.wait_for_selector(".og-lin[data-id]")
    g.locator(".og-esq .og-lin", has_text="Base dos transformadores").locator(".og-abre").click(); g.wait_for_selector(".og-exig-sel")
    g.locator(".og-exig-sel").select_option(label="NR-35 · Trabalho em altura"); g.wait_for_selector(".og-exig-chip")
    check("Painel: exigir documento da atividade", "Trabalho em altura" in g.inner_text(".og-exig"))
    g.locator(".og-painel label", has_text="Responsável").locator("select").select_option(str(F["Marcos"])); g.click(".og-p-pe .ob-bt-pri"); g.wait_for_selector(".og-aloc")
    check("Aviso ao alocar: Marcos sem NR-35 e com sugestões", "Falta NR-35" in g.inner_text(".og-aloc") and g.locator(".og-aloc-pess").count() >= 1)
    sug = g.locator(".og-aloc-pess b").first.inner_text()
    g.locator(".og-aloc-pess").first.click(); g.wait_for_selector(".og-painel", state="detached"); g.wait_for_timeout(800)
    check("Escolher a sugestão aloca a pessoa sugerida", g.locator(".og-esq .og-lin", has_text="Base dos transformadores").locator(".c-resp").inner_text() == sug, sug)
    linha = g.locator(".og-esq .og-lin", has_text="Malha de aterramento")
    linha.locator(".c-resp").click(); g.wait_for_selector(".c-resp select"); g.locator(".c-resp select").select_option(str(F["Diego"])); g.wait_for_selector(".og-aloc")
    check("Na célula da tabela também avisa (ASO vencido, falta NR-33)", "ASO" in g.inner_text(".og-aloc") and "NR-33" in g.inner_text(".og-aloc"))
    g.click(".og-aloc .og-bt-laranja"); g.wait_for_timeout(1200)
    h = adm.get(A+f"/atividades/{ids['a23']}/historico").json()["historico"][0]
    check("Alocar mesmo assim: salva e registra as pendências no histórico", h["depois"].get("responsavel_id") == F["Diego"] and "NR-33" in h["depois"].get("alocou_com_pendencias", ""), h["depois"])
    c.close()
    # encarregado
    c, e = nova(nav, {"width": 1440, "height": 1000}); entrar(e, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    e.click("#nav-pessoas"); e.wait_for_selector(".eq-card")
    nomes = sorted(e.locator(".eq-card-t b").all_inner_texts())
    check("Encarregado vê só ele e a equipe dele, sem 'Nova pessoa'", "Ana Ribeiro" not in nomes and "Carla Mendes" in nomes and e.locator("button >> text=Nova pessoa").count() == 0, nomes)
    c.close()
    # celular
    c, m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "wendell@rawtech.com.br", "Obra-Segura-2026")
    m.evaluate("tfEquipe.abrir()"); m.wait_for_selector(".eq-card")
    check("Celular: lista sem rolagem lateral e 3 indicadores", m.evaluate("document.documentElement.scrollWidth") <= 390 and m.locator(".eq-kpi").count() == 3)
    m.click(".eq-card >> text=Carla Mendes"); m.wait_for_selector(".eq-doc")
    check("Celular: Ligar e WhatsApp com o telefone", m.locator(".eq-contato a[href^='tel:81977771234']").count() == 1 and m.locator(".eq-contato a[href*='wa.me/5581977771234']").count() == 1)
    check("Celular: ficha sem rolagem lateral", m.evaluate("document.documentElement.scrollWidth") <= 390)
    m.locator(".eq-doc .eq-bt").first.click(); m.wait_for_selector(".eq-jan")
    check("Celular: lançar certificado abre a câmera", m.locator(".eq-jan input[type=file][capture=environment]").count() == 1)
    c.close(); nav.close()
check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
