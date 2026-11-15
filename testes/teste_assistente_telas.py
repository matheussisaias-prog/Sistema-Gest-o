"""Assistente Task Flow (telas): balão, Ctrl+K, busca com 'Entendi', ir para o resultado, dúvidas, montar obra por perguntas (computador e celular)."""
import sys, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_crono import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, ids = criar(); erros = []
s = requests.Session(); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
vazia = s.post(A+"/projetos", json={"codigo": "SPDA-003", "nome": "SPDA · Galpão 5", "situacao": "Planejamento", "inicio": "2027-02-01", "fim": "2027-03-31"}).json()["id"]
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return pg
def entrar(pg, email="wendell@rawtech.com.br", senha="Obra-Segura-2026"):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(400)
def responder_subestacao(pg, prazo="2027-02-26"):
    pg.click(".tfa-tipo >> text=Subestação"); pg.wait_for_selector(".tfa-check"); pg.click(".tfa-resp .tfa-bt-pri")
    pg.click(".tfa-op >> text=2 transformadores"); pg.click(".tfa-op >> text=1.000 kVA")
    pg.click(".tfa-op >> text=Outro…"); pg.fill(".tfa-outro input", "350"); pg.click(".tfa-outro .tfa-bt-pri")
    pg.click(".tfa-op >> text=200 m")
    pg.fill(".tfa-campos input[type=date] >> nth=0", "2027-01-11"); pg.dispatch_event(".tfa-campos input[type=date] >> nth=0", "change")
    pg.fill(".tfa-campos input[type=date] >> nth=1", prazo); pg.dispatch_event(".tfa-campos input[type=date] >> nth=1", "change"); pg.click(".tfa-resp .tfa-bt-pri")
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    pg = nova(nav, {"width": 1440, "height": 900}); entrar(pg)
    check("Balão do assistente no canto; o chat antigo saiu", pg.locator("#tfa-bt").is_visible() and pg.locator("#fab-chat-wrapper").count() == 0)
    pg.keyboard.press("Control+k"); pg.wait_for_selector(".tfa-busca input")
    check("Ctrl+K abre o assistente com o cursor na busca", pg.evaluate("document.activeElement.matches('.tfa-busca input')"))
    check("Sem texto: sugestões e perguntas frequentes", pg.locator(".tfa-pe a").count() >= 3 and pg.locator(".tfa-duv").count() >= 2)
    pg.fill(".tfa-busca input", "atividades atrasadas da ELE-014"); pg.wait_for_selector(".tfa-card-cab")
    check("Mostra o que entendeu", [x.strip("× \n") for x in pg.locator(".tfa-chip").all_inner_texts()] == ["atividades", "atrasadas", "obra ELE-014"], pg.locator(".tfa-chip").all_inner_texts())
    check("Resposta com as atrasadas e o atraso em dias", "atrasada" in pg.inner_text(".tfa-card-cab") and pg.locator(".tfa-card .tfa-selo.verm").count() >= 1)
    check("Também encontrei: a obra", "ELE-014" in pg.inner_text("section[aria-label='Também encontrei']"))
    pg.locator(".tfa-chip", has_text="obra ELE-014").locator("button").click(); pg.wait_for_function("!document.querySelector('.tfa-busca input').value.includes('ELE-014')")
    check("O × tira a obra da busca e busca de novo", pg.input_value(".tfa-busca input").strip() == "atividades atrasadas da")
    pg.fill(".tfa-busca input", "atividades atrasadas da ELE-014"); pg.wait_for_function("document.querySelectorAll('.tfa-chip').length === 3")
    pg.click(".tfa-card-pe .tfa-bt-sec"); pg.wait_for_selector("#view-obra.active .og-lin[data-id]")
    check("'Abrir o cronograma só com as atrasadas' abre a obra filtrada", pg.locator(".og-esq .og-lin[data-id]").count() >= 1 and all("atras" in c for c in pg.locator(".og-esq .og-lin[data-id]:not(.etapa)").evaluate_all("l => l.map(x => x.className)")))
    pg.fill(".tfa-busca input", "malha"); pg.wait_for_selector(".tfa-card .tfa-item >> text=Malha de aterramento")
    pg.click(".tfa-card .tfa-item >> text=Malha de aterramento"); pg.wait_for_selector(".og-painel, .og-pn", timeout=8000)
    check("Clicar numa atividade abre o painel dela", "Malha de aterramento" in pg.inner_text("body"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    if not pg.locator("#tfa-jan").is_visible(): pg.click("#tfa-bt")
    pg.fill(".tfa-busca input", "como salvo a linha de base"); pg.wait_for_selector(".tfa-duv[open]")
    check("Dúvida de uso: resposta aberta no próprio assistente", "Salvar linha de base" in pg.inner_text(".tfa-duv[open]"))
    pg.fill(".tfa-busca input", "xyzzyx qwrtp"); pg.wait_for_selector(".tfa-vazio")
    check("Sem resultado: orienta o que tentar", "código da obra" in pg.inner_text(".tfa-vazio"))
    pg.keyboard.press("Escape"); check("Esc fecha", pg.locator("#tfa-jan").is_hidden())
    # montar por perguntas
    pg.click("#tfa-bt"); pg.click(".tfa-abas button >> text=Montar obra"); pg.wait_for_selector(".tfa-tipo")
    check("Montar: 6 tipos de obra", pg.locator(".tfa-tipo").count() == 6)
    check("Prévia vazia antes de escolher", "Escolha o tipo" in pg.inner_text(".tfa-dir"))
    responder_subestacao(pg); pg.wait_for_selector(".tfa-alerta")
    check("Prévia com Gantt: 4 etapas e 12 atividades", pg.locator(".tfa-g-lin.etapa").count() == 4 and pg.locator(".tfa-g-corpo .tfa-g-lin:not(.etapa)").count() == 12)
    check("Duração calculada pela quantidade (cabo 350 m = 5d)", pg.locator(".tfa-g-corpo .tfa-g-lin", has_text="Cabos de média").locator(".tfa-g-dur").inner_text() == "5d")
    check("Avisa que passou do prazo, com ajustes", "depois do prazo" in pg.inner_text(".tfa-alerta") and pg.locator(".tfa-sug button").count() == 3)
    check("Explica a conta da duração na pergunta da equipe", "por dia com 4 pessoas" in pg.inner_text(".tfa-bal.atual"))
    check("Criar só no fim das perguntas", pg.locator(".tfa-dir-pe .tfa-bt-pri").is_disabled())
    pg.click(".tfa-sug button >> text=Equipe de 4"); pg.wait_for_selector(".tfa-ok")
    check("Ajuste aplicado: agora cabe no prazo", "Cabe no prazo" in pg.inner_text(".tfa-ok") and "6 pessoas" in pg.locator(".tfa-op.on").inner_text())
    pg.click(".tfa-bal.r >> text=2 transformadores"); pg.wait_for_selector(".tfa-bal.atual >> text=Quantos transformadores")
    check("Tocar numa resposta volta para mudar", pg.locator(".tfa-op.on").inner_text().startswith("2"))
    pg.click(".tfa-op >> text=1 transformadores"); pg.wait_for_function("document.querySelector('.tfa-dir-cab p').textContent.includes('1 × 1.000')")
    check("Mudou a resposta e a prévia acompanhou", "1 × 1.000 kVA" in pg.inner_text(".tfa-dir-cab"))
    for _ in range(4):
        if pg.locator(".tfa-bal.atual", has_text="equipe").count(): break
        pg.locator(".tfa-resp .tfa-bt-pri, .tfa-op.on").first.click(); pg.wait_for_timeout(250)
    pg.click(".tfa-resp .tfa-bt-pri")            # equipe
    pg.wait_for_selector(".tfa-bal.atual >> text=Para qual obra")
    check("Pergunta para qual obra (nova ou sem cronograma)", pg.locator(".tfa-op", has_text="Obra já cadastrada").count() == 1)
    pg.fill(".tfa-campos input >> nth=0", "ELE-019"); pg.fill(".tfa-campos input >> nth=1", "Metalúrgica Nordeste")
    check("Nome da obra sugerido", pg.input_value(".tfa-campos input >> nth=2") == "Subestação 1 × 1.000 kVA")
    pg.click(".tfa-resp .tfa-bt-pri"); pg.wait_for_selector(".tfa-bal >> text=Pronto!")
    check("Fim das perguntas libera o Criar", not pg.locator(".tfa-dir-pe .tfa-bt-pri").is_disabled())
    pg.click(".tfa-dir-pe .tfa-bt-pri"); pg.wait_for_selector("#view-obra.active .og-cab >> text=ELE-019"); pg.wait_for_selector(".og-lin[data-id]")
    check("Cria a obra e abre o cronograma montado", pg.locator(".og-esq .og-lin[data-id]").count() == 16 and pg.locator("#tfa-jan").is_hidden(), pg.locator(".og-esq .og-lin[data-id]").count())
    obra = [o for o in s.get(A+"/obras/resumo").json()["obras"] if o["codigo"] == "ELE-019"][0]
    check("Obra criada com cliente, tipo e situação Planejamento", obra["cliente"] == "Metalúrgica Nordeste" and obra["tipo_servico"] == "Elétrica" and obra["situacao"] == "Planejamento")
    # pela tela de montar da obra vazia
    pg.evaluate(f"tfObra.abrir({vazia})"); pg.wait_for_selector(".og-vazio-crono .ob-bt-pri"); pg.click(".og-vazio-crono .ob-bt-pri"); pg.wait_for_selector(".om-op")
    pg.click(".om-op >> text=Montar por perguntas"); pg.wait_for_selector(".tfa-tipo")
    check("Montar por perguntas a partir da obra: já sabe qual é", "SPDA-003" in pg.inner_text(".tfa-conv") and pg.locator(".tfa-prog").count() == 1)
    pg.click(".tfa-tipo >> text=SPDA"); pg.click(".tfa-resp .tfa-bt-pri")
    for _ in range(8):
        if pg.locator(".tfa-bal >> text=Pronto!").count(): break
        b = pg.locator(".tfa-resp .tfa-acoes .tfa-bt-pri")
        (b.first if b.count() else pg.locator(".tfa-resp .tfa-op.on").first).click(); pg.wait_for_timeout(300)
    check("Sem a pergunta de obra quando já veio da obra", pg.locator(".tfa-bal >> text=Pronto!").count() == 1 and pg.locator(".tfa-bal >> text=Para qual obra").count() == 0)
    pg.click(".tfa-resp .tfa-bt-pri"); pg.wait_for_selector(f"#view-obra.active .og-cab >> text=SPDA-003"); pg.wait_for_selector(".og-lin[data-id]")
    check("Cronograma criado na obra existente", pg.locator(".og-esq .og-lin[data-id]").count() == 11, pg.locator(".og-esq .og-lin[data-id]").count())
    # gestora: Fale conosco no rodapé
    g = nova(nav, {"width": 1440, "height": 900}); entrar(g, "ana@rawtech.com.br", "Ana-Ribeiro-2026")
    check("Fale conosco: só um link no rodapé", g.locator("#tf-contato").count() == 0 and g.locator("#tf-rodape-contato").count() == 1)
    # encarregado: só busca
    e = nova(nav, {"width": 1440, "height": 900}); entrar(e, "bruno@rawtech.com.br", "Bruno-Costa-2026"); e.click("#tfa-bt"); e.wait_for_selector(".tfa-busca input")
    check("Encarregado: assistente sem a aba Montar obra", e.locator(".tfa-abas").count() == 0)
    # celular
    m = nova(nav, {"width": 390, "height": 844}, True); entrar(m)
    m.click("#tfa-bt"); m.wait_for_selector(".tfa-busca input")
    box = m.locator("#tfa-jan").bounding_box()
    check("Celular: assistente em tela cheia", box["width"] >= 389 and box["height"] >= 840)
    m.fill(".tfa-busca input", "o que a Carla tem essa semana"); m.wait_for_selector(".tfa-card-cab")
    check("Celular: busca responde", "Carla" in m.inner_text(".tfa-card-cab"))
    m.click(".tfa-abas button >> text=Montar obra"); m.wait_for_selector(".tfa-tipo"); responder_subestacao(m); m.wait_for_selector(".tfa-cel-bt")
    check("Celular: botão da prévia mostra o atraso", "depois do prazo" in m.inner_text(".tfa-cel-bt"))
    m.click(".tfa-cel-bt"); m.wait_for_selector(".tfa-folha .tfa-g-lin")
    check("Celular: prévia com Gantt e ajustes em folha própria", m.locator(".tfa-folha .tfa-sug button").count() == 3 and m.locator(".tfa-folha .tfa-g-b").count() >= 12)
    check("Celular: sem rolagem lateral", m.evaluate("document.documentElement.scrollWidth") <= 390)
    m.click(".tfa-folha .tfa-x"); check("Celular: fecha a prévia e volta às perguntas", m.locator(".tfa-folha").count() == 0 and m.locator(".tfa-bal.atual").count() == 1)
    nav.close()
check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
