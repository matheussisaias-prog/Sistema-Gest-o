import sys; sys.path.insert(0, "/home/claude/telas")
from comum import rotas
from gravar import Gravador
from dados_crono import criar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
criar()
def data(pg, n, v): pg.fill(f".tfa-campos input[type=date] >> nth={n}", v); pg.dispatch_event(f".tfa-campos input[type=date] >> nth={n}", "change")
def roteiro(pg, g, cel):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1000); pg.mouse.move(600, 400); g.pausa(1200)
    g.clicar("#tfa-bt", depois=900)
    if cel:
        g.digitar(".tfa-busca input", "o que a Carla tem essa semana", 3); pg.wait_for_selector(".tfa-card-cab"); pg.wait_for_timeout(400); g.pausa(2200)
        g.digitar(".tfa-busca input", "", 1); pg.fill(".tfa-busca input", ""); g.digitar(".tfa-busca input", "como importar do ms project", 3); pg.wait_for_selector(".tfa-duv[open]"); pg.wait_for_timeout(300); g.pausa(2200)
    else:
        g.digitar(".tfa-busca input", "atividades atrasdas da ELE-014", 3); pg.wait_for_selector(".tfa-card-cab"); pg.wait_for_timeout(400); g.pausa(2600)
        pg.fill(".tfa-busca input", ""); g.digitar(".tfa-busca input", "o que a Carla tem essa semana", 3); pg.wait_for_function("document.querySelector('.tfa-card-cab') && document.querySelector('.tfa-card-cab').textContent.includes('Carla')"); pg.wait_for_timeout(300); g.pausa(2200)
        pg.fill(".tfa-busca input", ""); g.digitar(".tfa-busca input", "como salvo a linha de base", 3); pg.wait_for_selector(".tfa-duv[open]"); pg.wait_for_timeout(300); g.pausa(2400)
    g.clicar(".tfa-abas button >> text=Montar obra", depois=900)
    g.clicar(".tfa-tipo >> text=Subestação", depois=900); g.pausa(500)
    g.clicar(".tfa-resp .tfa-bt-pri", depois=700)
    g.clicar(".tfa-op >> text=2 transformadores", depois=700); g.clicar(".tfa-op >> text=1.000 kVA", depois=700)
    g.clicar(".tfa-op >> text=Outro…", depois=400); g.digitar(".tfa-outro input", "350", 1); g.clicar(".tfa-outro .tfa-bt-pri", depois=700)
    g.clicar(".tfa-op >> text=200 m", depois=800)
    data(pg, 0, "2027-01-11"); data(pg, 1, "2027-02-26"); pg.wait_for_timeout(700); g.pausa(1200)
    g.clicar(".tfa-resp .tfa-bt-pri", depois=1200)
    if cel:
        g.pausa(1200); g.clicar(".tfa-cel-bt", depois=1500); pg.mouse.wheel(0, 250); pg.wait_for_timeout(300); g.pausa(1600)
        g.clicar(".tfa-folha .tfa-sug button >> nth=0", depois=1600); pg.evaluate("document.querySelector('.tfa-folha .tfa-dir').scrollTop = 0"); pg.wait_for_timeout(300); g.pausa(1600)
        g.clicar(".tfa-folha .tfa-x", depois=1200)
    else:
        g.pausa(2400); g.clicar(".tfa-sug button >> nth=0", depois=1800)
    g.clicar(".tfa-resp .tfa-acoes .tfa-bt-pri", depois=900)
    g.digitar(".tfa-campos input >> nth=0", "ELE-020" if cel else "ELE-019", 2); g.digitar(".tfa-campos input >> nth=1", "Metalúrgica Nordeste", 4); g.pausa(700)
    g.clicar(".tfa-resp .tfa-bt-pri", depois=1200)
    if cel: g.clicar(".tfa-resp .tfa-bt-pri", depois=300)
    else: g.clicar(".tfa-dir-pe .tfa-bt-pri", depois=300)
    pg.wait_for_selector("#view-obra.active .og-cab >> text=" + ("ELE-020" if cel else "ELE-019")); pg.wait_for_selector(".og-lin[data-id], .og-cel-card"); pg.wait_for_timeout(900); g.pausa(2800)
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    for cel, nome, larg, vp, esc in [(True, "assistente-celular", 488, {"width": 390, "height": 844}, 1.25)]:
        if cel:  # a obra ELE-019 já existe depois da gravação do computador
            import requests; s = requests.Session(); s.post(B+"/api/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
            o = [x for x in s.get(B+"/api/obras/resumo").json()["obras"] if x["codigo"] == "ELE-019"]
            if o: s.delete(B+f"/api/projetos/{o[0]['id']}")
        c = nav.new_context(viewport=vp, device_scale_factor=esc, is_mobile=cel, has_touch=cel, locale="pt-BR"); pg = c.new_page(); rotas(pg)
        pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        g = Gravador(pg, larg); roteiro(pg, g, cel); g.salvar(f"/home/claude/gifs/{nome}.gif"); print(nome, len(g.quadros)); c.close()
    nav.close()
