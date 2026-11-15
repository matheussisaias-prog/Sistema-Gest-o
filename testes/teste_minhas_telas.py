"""Minhas atividades (telas): funcionária no celular (foto obrigatória, concluir, Travou, sem internet, abrir sem internet),
encarregado no computador (Da minha equipe, + direto, Liberar) e a Obra aberta mostrando travada e fotos."""
import sys, json, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_crono import criar
from playwright.sync_api import sync_playwright
from PIL import Image
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
Image.new("RGB", (2400, 1800), (80, 120, 150)).save("/tmp/obra.jpg", "JPEG", quality=90)
pid, ids = criar(); erros = []
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
ativ = lambda i: [a for a in adm.get(A+f"/obras/{pid}/cronograma").json()["atividades"] if a["id"] == i][0]
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user")
card = lambda pg, nome: pg.locator(".mi-card", has_text=nome).first
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    # ── funcionária no celular ──
    c, m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "carla@rawtech.com.br", "Carla-Mendes-2026"); m.wait_for_selector(".mi-card")
    check("Funcionária entra direto em Minhas atividades", m.locator("#view-minhas.active").count() == 1 and "Carla" in m.inner_text(".mi-ola h1"))
    check("Sem a chave 'Da minha equipe' para funcionária", m.locator(".mi-seg").count() == 0)
    check("Só atividades dela", all("Você" in x for x in m.locator(".mi-card .mi-pe").all_inner_texts()))
    check("Celular sem rolagem lateral", m.evaluate("document.documentElement.scrollWidth") <= 390)
    card(m, "Eletrodutos").locator(".mi-bt[aria-label='Aumentar 10%']").click(); m.wait_for_selector(".mi-folha")
    check("O + abre a folha com a foto obrigatória e o Salvar desligado", "obrigatória" in m.inner_text(".mi-folha") and m.locator(".mi-folha .mi-bt-pri").is_disabled())
    m.set_input_files(".mi-folha input[type=file]", "/tmp/obra.jpg"); m.wait_for_selector(".mi-mini")
    check("Com a foto, o Salvar liga e diz quantas fotos", not m.locator(".mi-folha .mi-bt-pri").is_disabled() and "1 foto" in m.inner_text(".mi-folha .mi-bt-pri"))
    m.fill(".mi-folha textarea", "Trecho A pronto"); m.click(".mi-folha .mi-bt-pri"); m.wait_for_selector(".mi-folha", state="detached")
    m.wait_for_function("[...document.querySelectorAll('.mi-card')].some(c => c.innerText.includes('Eletrodutos') && c.innerText.includes('com foto'))")
    check("Avanço salvo no servidor (30% → 40%)", ativ(ids["a22"])["avanco"] == 40 and ativ(ids["a22"])["fotos"] == 1)
    fts = adm.get(A+f"/atividades/{ids['a22']}/fotos").json()["fotos"]
    img = adm.get(A+f"/fotos/{fts[0]['id']}"); w, h = Image.open(__import__('io').BytesIO(img.content)).size
    check("A foto chega reduzida (até 1600 px) e com o comentário", max(w, h) == 1600 and fts[0]["comentario"] == "Trecho A pronto", (w, h))
    # concluir
    card(m, "Eletrodutos").locator(".mi-bt[aria-label='Concluir']").click(); m.wait_for_selector(".mi-folha")
    m.set_input_files(".mi-folha input[type=file]", "/tmp/obra.jpg"); m.wait_for_selector(".mi-mini")
    check("Concluir pede 100% com foto", "Concluir com 1 foto" in m.inner_text(".mi-folha .mi-bt-pri"))
    m.click(".mi-folha .mi-bt-pri"); m.wait_for_selector(".mi-folha", state="detached"); m.wait_for_timeout(1200)
    check("Concluída sai das abertas", ativ(ids["a22"])["situacao"] == "Concluído" and card(m, "Eletrodutos").count() == 0)
    m.click(".mi-mais"); m.wait_for_selector("#mi-g-concluidas .mi-card")
    check("Aparece em 'Concluídas nos últimos 7 dias'", "Eletrodutos" in m.inner_text("#mi-g-concluidas"))
    # travou
    n_antes = sum(1 for _ in open("/home/claude/teste-api/emails.jsonl", encoding="utf-8"))
    card(m, "Malha").locator(".mi-travou").click(); m.wait_for_selector(".mi-motivos")
    check("Travou: 5 motivos e o Avisar desligado até escolher", m.locator(".mi-motivos button").count() == 5 and m.locator(".mi-folha .mi-bt-pri").is_disabled())
    m.click(".mi-motivos button >> text=Falta material"); m.fill(".mi-folha textarea", "Faltam 40 caixas 4x4"); m.click(".mi-folha .mi-bt-pri"); m.wait_for_selector(".mi-folha", state="detached")
    m.wait_for_function("[...document.querySelectorAll('.mi-card .mi-trav')].some(t => t.innerText.includes('avisado às'))")
    check("Cartão mostra 'Travou' com o motivo e a hora do aviso", "Falta material: Faltam 40 caixas 4x4" in card(m, "Malha").inner_text() and "avisado às" in card(m, "Malha").inner_text())
    ult = json.loads(open("/home/claude/teste-api/emails.jsonl", encoding="utf-8").read().splitlines()[-1])
    check("Gestor recebe o e-mail", sum(1 for _ in open("/home/claude/teste-api/emails.jsonl", encoding="utf-8")) == n_antes + 1 and "Travou: Malha" in ult["assunto"])
    check("Funcionária não vê o Liberar", card(m, "Malha").locator(".mi-trav button").count() == 0)
    # sem internet
    c.set_offline(True); m.wait_for_selector(".mi-aviso")
    check("Sem internet: aviso amarelo", "Sem internet" in m.inner_text(".mi-aviso"))
    card(m, "Malha").locator(".mi-bt[aria-label='Aumentar 10%']").click(); m.wait_for_selector(".mi-folha")
    m.set_input_files(".mi-folha input[type=file]", "/tmp/obra.jpg"); m.wait_for_selector(".mi-mini"); m.click(".mi-folha .mi-bt-pri"); m.wait_for_selector(".mi-folha", state="detached")
    m.wait_for_function("document.querySelector('.mi-aviso') && document.querySelector('.mi-aviso').innerText.includes('1 atualização guardada')")
    check("Fica guardado no celular e o cartão mostra 'guardado'", "guardado" in card(m, "Malha").inner_text() and "10% feito" in card(m, "Malha").inner_text() and ativ(ids["a23"])["avanco"] == 0)
    c.set_offline(False)
    m.wait_for_function("!document.querySelector('.mi-aviso')", timeout=20000)
    check("Internet voltou: enviado sozinho, com a foto", ativ(ids["a23"])["avanco"] == 10 and ativ(ids["a23"])["fotos"] == 1)
    # abrir o sistema já sem internet
    m.evaluate("localStorage.setItem('tf-sw', '1')"); m.reload(); m.wait_for_selector(".mi-card")
    m.evaluate("navigator.serviceWorker.ready"); m.wait_for_timeout(1500); m.reload(); m.wait_for_selector(".mi-card"); m.wait_for_timeout(1500)
    c.set_offline(True); m.reload(); m.wait_for_selector(".mi-card", timeout=15000)
    check("Abre sem internet: última lista guardada e o aviso", "Malha" in m.inner_text("#view-minhas") and "Sem internet" in m.inner_text(".mi-aviso"))
    c.set_offline(False); c.close()
    # ── encarregado no computador ──
    c, e = nova(nav, {"width": 1440, "height": 1000}); entrar(e, "bruno@rawtech.com.br", "Bruno-Costa-2026"); e.wait_for_selector(".mi-ind")
    check("Encarregado entra em Minhas atividades com a chave Minhas/Equipe", e.locator(".mi-seg button").count() == 2 and "encarregado na ELE-014" in e.inner_text(".mi-ola"))
    e.click(".mi-seg button >> text=Da minha equipe"); e.wait_for_selector(".mi-card >> text=Malha de aterramento")
    check("Da minha equipe: vê as da Carla, em 3 colunas", "Carla Mendes" in e.inner_text(".mi-grupos") and e.evaluate("getComputedStyle(document.querySelector('.mi-grupos')).display") == "grid")
    check("Indicador de travadas", e.locator(".mi-ind.lar b").inner_text() == "1")
    antes = ativ(ids["a21"])["avanco"]
    card(e, "Base dos transformadores").locator(".mi-bt[aria-label='Aumentar 10%']").click(); e.wait_for_timeout(1500)
    check("Encarregado: + atualiza direto, sem pedir foto", e.locator(".mi-folha").count() == 0 and ativ(ids["a21"])["avanco"] == antes + 10)
    card(e, "Malha").locator(".mi-trav button >> text=Liberar").click(); e.wait_for_function("![...document.querySelectorAll('.mi-card')].some(c => c.innerText.includes('Malha') && c.querySelector('.mi-trav'))")
    check("Encarregado libera a travada", ativ(ids["a23"])["travada"] is None)
    c.close()
    # ── Obra aberta (gestor): travada e fotos ──
    requests.Session()
    car = requests.Session(); car.post(A+"/entrar", json={"email": "carla@rawtech.com.br", "senha": "Carla-Mendes-2026"})
    car.post(A+f"/atividades/{ids['a23']}/impedimento", json={"motivo": "clima", "descricao": "Chuva forte"})
    c, g = nova(nav, {"width": 1440, "height": 900}); entrar(g, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g.evaluate(f"tfObra.abrir({pid})"); g.wait_for_selector(".og-lin[data-id]")
    linha = g.locator(".og-esq .og-lin", has_text="Malha de aterramento")
    check("Cronograma marca a travada e as fotos", linha.locator(".og-trav").count() == 1 and linha.locator(".og-nfotos").count() == 1)
    linha.locator(".og-abre").click(); g.wait_for_selector(".og-p-trav"); g.wait_for_selector(".og-fotos img")
    check("Painel: motivo, quem informou e as fotos de campo", "Chuva / tempo: Chuva forte" in g.inner_text(".og-p-trav") and "Carla" in g.inner_text(".og-p-trav") and g.locator(".og-fotos img").count() == 1)
    check("Histórico legível (avanço com foto, travou)", "com 1 foto" in g.inner_text(".og-hist") and "informou que travou" in g.inner_text(".og-hist"))
    g.click(".og-p-trav button >> text=Liberar"); g.wait_for_selector(".og-painel", state="detached"); g.wait_for_timeout(800)
    check("Gestor libera pelo painel", g.locator(".og-esq .og-lin", has_text="Malha de aterramento").locator(".og-trav").count() == 0)
    g.click("#tfa-bt"); g.fill(".tfa-busca input", "atividades travadas"); g.wait_for_selector(".tfa-card-cab")
    check("Assistente entende 'travadas'", "travada" in g.inner_text(".tfa-card-cab"))
    c.close(); nav.close()
# 'Chart is not defined': com o guardião ligado, o teste não consegue trocar o Chart.js da internet (bloqueada aqui) pela cópia local
check("Sem erros de JavaScript", not [x for x in erros if "Chart is not defined" not in x], erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
