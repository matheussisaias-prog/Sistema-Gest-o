"""RDO (telas): menu, calendário, pendências, RDO do dia (clima, presentes, terceiros, observações), fechar e documento,
reabrir, entregar, anexar folha assinada, excluir; logo da empresa (janela, barra lateral); encarregado no celular
(RDO de hoje em Minhas atividades, enviar ao gestor); cadastro da empresa com a logo."""
import sys, io, base64, datetime as dt, requests
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
Image.new("RGB", (1000, 1400), (245, 244, 238)).save("/tmp/folha.jpg", "JPEG")
im = Image.new("RGBA", (800, 260), (0, 0, 0, 0)); im.paste((200, 30, 40, 255), (10, 30, 250, 230)); im.save("/tmp/logo-vermelha.png")
pid, p2, ids, R, rd = montar(); erros = []
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden")
rdo = lambda i: adm.get(A+f"/rdos/{i}").json()
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    # ── encarregado no celular ──
    c, m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    m.wait_for_selector(".mi-rdo")
    check("Celular: 'RDO de hoje' em Minhas atividades", "ELE-014" in m.inner_text(".mi-rdo"))
    m.click(".mi-rdo"); m.wait_for_selector(".rd-serv")
    check("Celular: RDO de hoje já montado (serviços, Travou, equipamentos, presentes)", m.locator(".rd-serv").count() == 2 and m.locator(".rd-oc").count() == 1 and m.locator(".rd-eq .eq-selo").count() == 2 and m.locator(".rd-pes").count() == 2)
    check("Celular: sem rolagem lateral e clima em grade", m.evaluate("document.documentElement.scrollWidth") <= 390 and m.locator(".rd-chips").first.evaluate("e => getComputedStyle(e).display") == "grid")
    check("Celular: encarregado envia, não fecha", m.locator("button >> text=Enviar para o gestor").count() == 1 and m.locator("button >> text=Fechar e gerar PDF").count() == 0)
    rid = m.evaluate("tfRdo.estado.id")
    m.locator(".rd-clima").nth(0).locator("button >> text=Bom").click(); m.wait_for_timeout(500)
    m.locator(".rd-clima").nth(1).locator("button >> text=Chuva").click(); m.wait_for_timeout(500)
    m.locator(".rd-pes", has_text="Carla Mendes").locator("input").uncheck(); m.wait_for_timeout(600)
    m.fill(".rd-terc input[type=number]", "4"); m.locator(".rd-terc input[type=number]").dispatch_event("change"); m.wait_for_timeout(600)
    m.fill(".rd-pad textarea", "Visita do fiscal às 10h."); m.locator(".rd-pad textarea").dispatch_event("change"); m.wait_for_timeout(600)
    r = rdo(rid)["rdo"]
    check("Celular: clima, falta, terceiros e observações salvos sozinhos", r["clima_manha"] == "Bom" and r["clima_tarde"] == "Chuva" and r["terceiros"] == 4 and r["observacoes"] == "Visita do fiscal às 10h." and "Total: 5 pessoas" in m.inner_text("#rd-total"))
    m.click("button >> text=Enviar para o gestor"); m.wait_for_selector(".rd-aviso.ok")
    check("Celular: enviado ao gestor", "Enviado por Bruno Costa" in m.inner_text(".rd-aviso"))
    m.click(".eq-voltar"); m.wait_for_selector(".rd-lin")
    check("Celular: lista de dias sem rolagem lateral", m.evaluate("document.documentElement.scrollWidth") <= 390 and m.locator(".eq-kpi").count() == 3)
    c.close()
    # ── gestor no computador ──
    c, g = nova(nav, {"width": 1440, "height": 1000}); entrar(g, "wendell@rawtech.com.br", "Obra-Segura-2026")
    check("Logo da empresa na barra lateral", g.locator(".sidebar-empresa img").count() == 1)
    g.click("#nav-rdo"); g.wait_for_selector(".rd-dia")
    check("Menu RDO: calendário do mês com indicadores e pendências", g.locator(".rd-dia.ass").count() == 1 and g.locator(".rd-dia.entr").count() == 1 and g.locator(".rd-dia.fech").count() == 1 and g.locator(".rd-dia.rasc").count() >= 1 and g.locator(".rd-pend button").count() >= 4)
    g.locator(".rd-pend button", has_text="enviado").click(); g.wait_for_selector(".rd-cab")
    check("Pendência abre o RDO enviado pelo encarregado", g.evaluate("tfRdo.estado.id") == rid and "Revise e feche" in g.inner_text(".rd-aviso"))
    g.click("button >> text=Fechar e gerar PDF"); g.wait_for_selector(".eq-jan")
    with g.context.expect_page() as pop: g.click(".eq-jan .eq-bt.pri")
    doc = pop.value; doc.wait_for_load_state(); doc.wait_for_timeout(600)
    check("Fechar abre o documento A4 com a logo e o código", "RELATÓRIO DIÁRIO DE OBRA" in doc.inner_text("body") and doc.locator("img.logo").count() == 1 and "código de conferência" in doc.inner_text(".rod"))
    check("Documento com mão de obra, serviços, ocorrência e observações", "4 pessoas" in doc.inner_text("body") and "Base dos transformadores" in doc.inner_text("body") and "Chuva forte" in doc.inner_text("body") and "Visita do fiscal" in doc.inner_text("body"))
    doc.close(); g.wait_for_selector(".rd-step .atual >> text=Fechado")
    check("RDO fechado: campos travados e etapa 2", g.locator(".rd-chips button[disabled]").count() == 8 and g.locator(".rd-step .feito").count() == 1)
    g.click("button >> text=Reabrir"); g.wait_for_selector(".rd-step .atual >> text=Rascunho")
    check("Reabrir volta para rascunho", rdo(rid)["rdo"]["situacao"] == "Rascunho")
    with g.context.expect_page() as pop:
        g.click("button >> text=Fechar e gerar PDF"); g.click(".eq-jan .eq-bt.pri")
    pop.value.close(); g.wait_for_selector("button >> text=Marcar como entregue")
    g.click("button >> text=Marcar como entregue"); g.click(".eq-jan .eq-bt.pri"); g.wait_for_selector(".rd-step .atual >> text=Entregue")
    check("Marcar como entregue", rdo(rid)["rdo"]["situacao"] == "Entregue")
    g.click("button >> text=Anexar folha assinada"); g.wait_for_selector(".eq-jan")
    g.set_input_files(".eq-jan input[type=file]", "/tmp/folha.jpg"); g.wait_for_selector(".rd-prev img")
    g.fill(".eq-jan input[aria-label='Quem assinou']", "Eng. Paulo Andrade"); g.click(".eq-jan .eq-bt.pri"); g.wait_for_selector(".rd-aviso.ok >> text=ver folha assinada")
    check("Anexar folha assinada: RDO assinado com link da folha", rdo(rid)["rdo"]["situacao"] == "Assinado" and "Eng. Paulo Andrade" in g.inner_text(".rd-aviso"))
    g.click(".eq-voltar"); g.wait_for_selector(".rd-dia")
    g.click(".rd-dia.rasc"); g.wait_for_selector(".rd-cab")
    g.click("button >> text=Excluir este rascunho"); g.click(".eq-jan .eq-bt.pri"); g.wait_for_selector(".rd-dia")
    check("Excluir rascunho volta ao calendário", adm.get(A+f"/rdos/{rd['rasc']}").status_code == 404)
    sabado = [x for x in adm.get(A+f"/rdos?obra={pid}").json()["dias"] if x["estado"] == "nao" and not x["rdo"]]
    if sabado:
        g.click(f".rd-dia.nao[aria-label^='{sabado[0]['data'][8:10]}/']"); g.wait_for_selector(".eq-jan")
        check("Dia sem expediente pergunta antes de abrir", "não é dia útil" in g.inner_text(".eq-jan")); g.keyboard.press("Escape")
    g.click("button >> text=Logo da empresa"); g.wait_for_selector(".rd-logo-prev img")
    g.set_input_files(".rd-logo-bts input[type=file]", "/tmp/logo-vermelha.png"); g.wait_for_timeout(1500)
    check("Trocar a logo: prévia e cor do cabeçalho mudam", adm.get(A+"/empresa/cabecalho").json()["cor"].startswith("#c") and "rgb(2" in g.locator(".rd-logo-linha").evaluate("e => getComputedStyle(e).borderBottomColor"))
    g.keyboard.press("Escape"); c.close()
    # ── cadastro da empresa com a logo ──
    c, s = nova(nav, {"width": 1280, "height": 900})
    s.goto(B+"/entrar.html"); s.click("text=Cadastrar minha empresa"); s.wait_for_selector("#c-logo", state="attached")
    s.set_input_files("#c-logo", "/tmp/logo-vermelha.png"); s.wait_for_selector("#c-logo-img:not([hidden])")
    check("Cadastro: logo com prévia e botão de tirar", s.locator("#c-logo-tirar:not([hidden])").count() == 1)
    s.fill("#c-nome", "Construtora Teste"); s.fill("#c-tel", "(81) 3000-2222"); s.click("#f-empresa button[type=submit]"); s.wait_for_selector("#v-cadastro-2:not([hidden])"); s.wait_for_timeout(300)
    s.fill("#a-nome", "Teste Admin"); s.fill("#a-email", "cad@logo.test"); s.fill("#a-senha", "Senha-Forte-2026"); s.click("#f-admin button[type=submit]")
    s.wait_for_selector("#concluir")
    with s.expect_request(lambda r: r.url.endswith("/api/cadastro")) as req: s.click("#concluir")
    corpo = req.value.post_data_json
    check("Cadastro envia a logo junto com a empresa", corpo["empresa"]["logo"]["dados"].startswith("data:image/png;base64,") and corpo["empresa"]["telefone"] == "(81) 3000-2222")
    c.close(); nav.close()
check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
