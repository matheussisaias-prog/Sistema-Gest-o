"""Tela Gráficos e indicadores (gestão de planejamento): resumo, SQDCP com tendência e detalhe, prazo das obras,
Curva S, causas (Ishikawa em dias perdidos + Pareto), pendências de controle, carga e equipamentos; API, tela,
celular, permissões, F5 e PDF."""
import sys, requests, datetime as dt
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_ind import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
pid, p2, ids, R, rd = montar()
def sessao(e, s): x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026")
# ── API ──
d = adm.get(A+"/indicadores").json(); K = {k["chave"]: k for k in d["kpis"]}
check("5 indicadores S, Q, D, C, P com série de 8 semanas e tendência", [k["chave"] for k in d["kpis"]] == list("SQDCP") and all(len(k["serie"]) == 8 and "delta" in k["tendencia"] for k in d["kpis"]))
check("Resumo em uma frase com obras no prazo e principal causa", "obras no prazo" in d["resumo"] and "principal causa: falta de material" in d["resumo"], d["resumo"])
check("Segurança: 45 dias sem acidente, atenção, conformidade SST embaixo", K["S"]["valor"] == 45 and K["S"]["farol"] == "amarelo" and K["S"]["secundario"]["rotulo"] == "Conformidade SST")
check("Entrega: IDP e obras fora do prazo", K["D"]["formato"] == "indice" and K["D"]["valor"] is not None and "de 2" in K["D"]["secundario"]["valor"])
check("Custo sem lançamento: pede para lançar (não inventa IDC)", K["C"]["valor"] is None and "Lance os custos" in K["C"]["detalhe"])
check("Planejamento sem plano: pede para montar o plano da semana", K["P"]["valor"] is None and "Plano da semana" in K["P"]["detalhe"] and K["P"]["secundario"]["rotulo"] == "Tempo médio para destravar")
check("Prazo das obras com término previsto e do contrato", d["prazo_obras"] and {"termino_previsto", "termino_contrato", "desvio_dias", "idp"} <= set(d["prazo_obras"][0]))
check("Curva S com previsto, real e projeção", d["curva"] and any(p["real"] is not None for p in d["curva"]["pontos"]) and any(p.get("projetado") for p in d["curva"]["pontos"]))
ram = {r["chave"]: r for r in d["causas"]["ramos"]}
check("Ishikawa 6M em dias perdidos", list(ram) == ["mao", "maquina", "material", "metodo", "meio", "medida"] and ram["material"]["dias"] >= 2)
check("Pareto ordenado com % acumulado chegando a 100", d["causas"]["pareto"][0]["causa"] == "Falta de material" and d["causas"]["pareto"][-1]["acum"] == 100)
check("Acidente sem parar serviço não vira causa de atraso", ram["mao"]["qtd"] == 0)
check("Dias sem RDO ficam nas pendências, não no Ishikawa", any(g["chave"] == "rdo" for g in d["pendencias"]) and not any(g["titulo"] == "Dias sem RDO" for r in d["causas"]["ramos"] for g in r["grupos"]))
check("Carga da equipe e ocupação de equipamentos", d["equipe"] and d["equipamentos"] and "carga" in d["equipe"][0])
d7 = adm.get(A+"/indicadores?periodo=7").json(); d90 = adm.get(A+"/indicadores?periodo=90").json()
check("Período muda a janela (7 e 90 dias)", d7["periodo"] == 7 and d90["periodo"] == 90 and d90["causas"]["total_dias"] >= d7["causas"]["total_dias"])
d2 = adm.get(A+f"/indicadores?obra={p2}").json()
check("Filtro por obra", d2["obra"] == p2 and all(r["qtd"] == 0 for r in d2["causas"]["ramos"] if r["chave"] in ("material", "meio")))
check("Encarregado e funcionário não acessam", sessao("bruno@rawtech.com.br", "Bruno-Costa-2026").get(A+"/indicadores").status_code == 403 and sessao("carla@rawtech.com.br", "Carla-Mendes-2026").get(A+"/indicadores").status_code == 403)
check("Obra de outra empresa não abre", adm.get(A+"/indicadores?obra=99999").status_code == 404)
r = adm.put(A+"/empresa/regras", json={"meta_idp": 0.9}); d3 = adm.get(A+"/indicadores").json()
check("Meta ajustável em Empresa vale no indicador", r.status_code == 200 and d3["metas"]["meta_idp"] == 0.9 and "0,90" in {k["chave"]: k for k in d3["kpis"]}["D"]["meta"])
check("Meta fora da faixa é recusada", adm.put(A+"/empresa/regras", json={"meta_ppc": 150}).status_code == 400)
adm.put(A+"/empresa/regras", json={"meta_idp": 0.95})
# ── tela ──
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for nome, vp, mob in [("computador", {"width": 1440, "height": 900}, False), ("celular", {"width": 390, "height": 844}, True)]:
        c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); rotas(c); c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
        pg = c.new_page(); erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto(B+"/entrar.html"); pg.fill("#e-email", "wendell@rawtech.com.br"); pg.fill("#e-senha", "Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
        pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(800)
        pg.evaluate("tfIndicadores.abrir()"); pg.wait_for_selector(".ind-kpi")
        check(f"[{nome}] Resumo, 5 cartões com letra, tendência e meta", pg.locator(".ind-resumo").count() == 1 and pg.locator(".ind-kpi .ind-letra").all_inner_texts() == list("SQDCP") and pg.locator(".ind-kpi .ind-tend").count() == 5)
        check(f"[{nome}] Gráficos antigos escondidos para a gestão", not pg.is_visible(".ind-antigos"))
        pg.locator(".ind-kpi >> nth=2").click(); pg.wait_for_selector(".ind-gaveta")
        check(f"[{nome}] Clicar no cartão abre a explicação, a conta e a lista", "IDP" in pg.inner_text(".ind-gaveta") and pg.locator(".ind-gav-form").count() == 1 and pg.locator(".ind-gaveta .ind-item").count() >= 1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        check(f"[{nome}] Prazo das obras, Curva S, Pareto e pendências", pg.locator(".ind-tab tbody tr").count() == 2 and pg.locator(".ind-c-real").count() == 1 and pg.locator(".ind-par-l").count() >= 3 and pg.locator(".ind-pend-g").count() >= 2)
        if not mob:
            pg.locator(".ind-ramo[data-ramo='material'] .ind-ramo-cx").click(); pg.wait_for_timeout(300)
            check("[computador] Ramo do Ishikawa lista os registros em dias", "Cabo 25 mm²" in pg.inner_text(".ind-det-ramo") and "dias perdidos" in pg.inner_text(".ind-det-t"))
            pg.reload(); pg.wait_for_selector(".ind-kpi"); pg.wait_for_timeout(800)
            check("[computador] F5 mantém o ramo aberto", pg.locator(".ind-det-ramo").count() == 1)
            pg.click(".ind-seg button >> text=90 dias"); pg.wait_for_timeout(1200)
            check("[computador] Período escolhido aparece no cabeçalho", "período de" in pg.inner_text(".ind-cab-tela") and pg.locator(".ind-seg button.on").inner_text() == "90 dias")
            pg.emulate_media(media="print"); pg.wait_for_timeout(200)
            check("[computador] PDF (impressão) mostra só os indicadores", not pg.is_visible(".sidebar") and pg.is_visible("#ind-raiz") and not pg.is_visible(".ind-ctr"), [pg.is_visible(".sidebar"), pg.is_visible("#ind-raiz"), pg.is_visible(".ind-ctr")])
            pg.emulate_media(media="screen")
            pg.locator(".ind-tab tbody tr >> nth=0").click(); pg.wait_for_selector(".og-cab h1")
            check("[computador] Clicar na obra da tabela abre a obra", pg.inner_text("#page-title") == "Obra")
        else:
            check("[celular] Ishikawa vira Pareto e cartões deslizam", not pg.is_visible(".ind-ish-box") and pg.evaluate("getComputedStyle(document.querySelector('.ind-kpis')).display") == "flex")
            check("[celular] Sem rolagem lateral da página", pg.evaluate("document.documentElement.scrollWidth") <= 392, pg.evaluate("document.documentElement.scrollWidth"))
        check(f"[{nome}] Sem erro de tela", not erros, erros)
        c.close()
    c = nav.new_context(viewport={"width": 1440, "height": 900}); rotas(c); c.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg = c.new_page()
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", "bruno@rawtech.com.br"); pg.fill("#e-senha", "Bruno-Costa-2026"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(800)
    pg.evaluate("switchView('graficos', null)"); pg.wait_for_timeout(1000)
    check("Encarregado vê só os gráficos antigos", pg.locator(".ind-kpi").count() == 0 and pg.is_visible("#chart-status-full"))
    nav.close()
print(f"RESULTADO: {ok} ok, {f} falhas")
