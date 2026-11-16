"""Recursos (telas): lista, indicadores e filtros, mapa de reservas, ficha (locação, reservas, calibração com certificado,
parada, estender e devolver), novo recurso alugado, fornecedores, dados; encarregado só lê; funcionário sem o menu;
Obra aberta (recursos da atividade, aviso com sugestão, reservar mesmo assim, alugar); celular."""
import sys, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from comum import rotas
from dados_recursos import montar
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
open("/tmp/calib.pdf", "wb").write(b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF")
pid, p2, ids, R = montar(); erros = []
adm = requests.Session(); adm.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
rec = lambda cod: [x for x in adm.get(A+"/recursos").json()["recursos"] if x["codigo"] == cod][0]
def nova(nav, vp, mob=False):
    c = nav.new_context(viewport=vp, is_mobile=mob, has_touch=mob, locale="pt-BR"); pg = c.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript")); pg.on("pageerror", lambda e: erros.append(str(e))); return c, pg
def entrar(pg, email, senha):
    pg.goto(B+"/entrar.html"); pg.fill("#e-email", email); pg.fill("#e-senha", senha); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_selector("#loader", state="hidden")
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--lang=pt-BR"])
    c, g = nova(nav, {"width": 1440, "height": 1000}); entrar(g, "wendell@rawtech.com.br", "Obra-Segura-2026")
    g.click("#nav-recursos"); g.wait_for_selector(".rc-card")
    check("Menu Recursos abre a tela nova com os 7 recursos", g.locator("#view-recursos.active .rc-card").count() == 7 and g.locator("#recursos-wrap").count() == 0)
    k = [x.inner_text().split("\n")[0] for x in g.locator(".eq-kpi b").all()]
    check("Indicadores: em uso, livres, devoluções, vencidos, conflito", k == ["2", "4", "1", "1", "1"], k)
    check("Aviso do conflito da caminhonete", "Caminhonete S10" in g.inner_text(".rc-conf") and "Aterramento das prensas" in g.inner_text(".rc-conf"))
    g.click(".eq-kpi.verm"); g.wait_for_timeout(150)
    check("Indicador 'vencida' filtra o megômetro", g.locator(".rc-card").count() == 1 and "Megômetro" in g.inner_text(".rc-card"))
    g.click(".eq-kpi.verm"); g.fill(".eq-busca input", "munck"); g.wait_for_timeout(150)
    check("Busca por nome", g.locator(".rc-card").count() == 2)
    g.fill(".eq-busca input", ""); g.locator(".eq-filtros select[aria-label=Propriedade]").select_option("alugado"); g.wait_for_timeout(150)
    check("Filtro de alugados", g.locator(".rc-card").count() == 1 and "Devolver em 5 dias" in g.inner_text(".rc-card"))
    g.locator(".eq-filtros select[aria-label=Propriedade]").select_option("")
    # mapa
    g.click(".rc-modo button >> text=Mapa de reservas"); g.wait_for_selector(".rc-m-b")
    check("Mapa: conflito em vermelho, manutenção, calibração vencida e locação", g.locator(".rc-m-b.conf").count() == 2 and g.locator(".rc-m-b.man").count() == 1 and g.locator(".rc-m-b.cal").count() == 1 and g.locator(".rc-m-loc").count() == 1)
    check("Mapa: barras que se cruzam vão em pistas diferentes", len(set(round(b.bounding_box()["y"]) for b in g.locator(".rc-m-b.conf").all())) == 2)
    ini = g.inner_text(".rc-mapa-nav > span:not(.rc-modo)"); g.click(".rc-mapa-nav button[aria-label='Próximas semanas']"); g.wait_for_timeout(500)
    check("Mapa: avança as semanas e volta para hoje", g.inner_text(".rc-mapa-nav > span:not(.rc-modo)") != ini and (g.click(".rc-mapa-nav button >> text=Hoje") or g.wait_for_timeout(500) or True) and g.inner_text(".rc-mapa-nav > span:not(.rc-modo)") == ini)
    g.click(".rc-modo button >> text=8 sem"); g.wait_for_timeout(500)
    check("Mapa com 8 semanas", g.locator(".rc-m-lin.cab .rc-m-s").count() == 8)
    g.click(".rc-m-nome >> text=PLT-02"); g.wait_for_selector(".rc-loc")
    # ficha
    t = g.inner_text(".rc-loc")
    check("Ficha da plataforma: locação com fornecedor, custo até agora e previsto", "LocaMáq" in t and "R$ 380,00 / dia" in t and "R$ 4.940,00 (13 dias)" in t and "R$ 6.840,00" in t)
    check("Ficha avisa reserva depois da devolução", "termina depois da devolução" in g.inner_text(".rc-geral"))
    g.click("button >> text=Estender locação"); g.wait_for_selector(".eq-jan")
    sug = g.locator(".eq-jan input[type=date]").input_value(); g.click(".eq-jan .eq-bt.pri"); g.wait_for_selector(".eq-jan", state="detached"); g.wait_for_timeout(800)
    check("Estender sugere o fim da última reserva e tira o alerta", sug == rec("PLT-02")["locacao"]["devolucao_prevista"] and not any(a["texto"] == "Reserva depois da devolução" for a in rec("PLT-02")["alertas"]))
    g.click(".eq-abas button >> text=Reservas"); g.wait_for_selector(".rc-res")
    check("Aba Reservas lista as atividades", "Eletrodutos e caixas de passagem" in g.inner_text(".rc-res"))
    g.click(".eq-voltar"); g.wait_for_selector(".rc-mapa")
    check("Voltar da ficha leva de volta ao mapa", g.locator(".rc-modo button.on").first.inner_text() == "Mapa de reservas")
    g.click(".rc-modo button >> text=Cartões"); g.wait_for_selector(".rc-card")
    g.click(".rc-card >> text=Megômetro"); g.wait_for_selector(".rc-alerta")
    check("Ficha do megômetro com alerta de calibração vencida", "Calibração vencida" in g.inner_text(".rc-alerta"))
    g.click(".rc-ctrl .eq-bt >> text=Renovar"); g.wait_for_selector(".eq-jan")
    check("Renovar já vem com o tipo, o item e a validade de 1 ano", g.locator(".eq-jan input[aria-label=Item]").input_value() == "Calibração (RBC)" and g.locator(".eq-jan select[aria-label=Validade]").input_value() == "12")
    g.fill(".eq-jan input[aria-label='Feito em']", rec("PLT-02")["locacao"]["retirada"]); g.fill(".eq-jan input[aria-label=Instituição]", "Lab. Metrologia PE"); g.set_input_files(".eq-jan input[type=file]", "/tmp/calib.pdf")
    g.click(".eq-jan .eq-bt.pri"); g.wait_for_selector(".eq-jan", state="detached"); g.wait_for_selector(".rc-ctrl.ok")
    check("Calibração lançada com certificado: megômetro em dia", g.locator(".rc-alerta").count() == 0 and g.locator(".rc-ctrl.ok a >> text=certificado").count() == 1 and g.locator(".rc-hist").count() == 1)
    g.click("button >> text=Registrar parada"); g.wait_for_selector(".eq-jan")
    g.fill(".eq-jan input[aria-label=Fim]", (dt.date.fromisoformat(rec("PLT-02")["locacao"]["retirada"]) + dt.timedelta(days=60)).isoformat()); g.fill(".eq-jan input[aria-label=Motivo]", "Troca das pontas de prova"); g.click(".eq-jan .eq-bt.pri")
    g.wait_for_selector(".rc-par >> text=Troca das pontas de prova")
    check("Registrar parada (fora de uso)", rec("MEG-03")["situacao"]["tipo"] == "manutencao")
    g.click(".eq-abas button >> text=Dados"); g.fill(".eq-form input[data-k=modelo]", "Fluke 1555 FC"); g.click(".rc-acoes .eq-bt.pri"); g.wait_for_timeout(900)
    check("Editar dados do recurso", rec("MEG-03")["modelo"] == "Fluke 1555 FC")
    g.click(".eq-voltar"); g.wait_for_selector(".rc-card")
    # novo recurso alugado
    g.click("button >> text=Novo recurso"); g.wait_for_selector(".eq-jan")
    g.fill(".eq-jan input[aria-label=Nome]", "Andaime fachadeiro 40 m²"); g.fill(".eq-jan input[aria-label=Código]", "AND-01"); g.locator(".eq-jan select[aria-label=Propriedade]").select_option("alugado")
    g.fill(".eq-jan input[aria-label=Fornecedor]", "LocaMáq Equipamentos"); g.fill(".eq-jan input[aria-label='Devolução prevista']", rec("PLT-02")["locacao"]["devolucao_prevista"]); g.fill(".eq-jan input[aria-label=Custo]", "45")
    g.click(".eq-jan .eq-bt.pri"); g.wait_for_selector(".eq-ficha-t >> text=Andaime fachadeiro")
    nv = rec("AND-01")
    check("Novo recurso alugado: cadastra, abre a ficha e usa o fornecedor existente", nv["propriedade"] == "alugado" and nv["locacao"]["fornecedor"] == "LocaMáq Equipamentos" and len(adm.get(A+"/fornecedores").json()["fornecedores"]) == 1)
    g.click(".eq-voltar"); g.wait_for_selector(".rc-card")
    g.click("button >> text=Fornecedores de locação"); g.wait_for_selector(".rc-forn-lin")
    g.fill(".rc-forn-novo input[aria-label='Novo fornecedor']", "Mills"); g.click(".rc-forn-novo .eq-bt"); g.wait_for_selector(".rc-forn-lin input[value=Mills]")
    check("Fornecedores: lista com locações em aberto e adiciona novo", "2 em aberto" in g.inner_text(".rc-forn") and len(adm.get(A+"/fornecedores").json()["fornecedores"]) == 2)
    g.keyboard.press("Escape")
    # Obra aberta
    g.evaluate(f"tfObra.abrir({pid})"); g.wait_for_selector(".og-lin[data-id]")
    g.locator(".og-esq .og-lin", has_text="Montagem do transformador 1").locator(".og-abre").click(); g.wait_for_selector(".og-rec-sel")
    g.locator(".og-rec-sel").select_option(str(R["MUN-01"])); g.wait_for_selector("#og-rec-t")
    check("Reservar munck ocupado: aviso com o conflito e a sugestão do munck 8 t", "NR12-007 · Remoção do painel antigo" in g.inner_text(".og-aloc") and "MUN-02" in g.inner_text(".og-rec-sug"))
    g.click(".og-rec-sug"); g.wait_for_selector(".og-rec .og-exig-chip >> text=MUN-02")
    check("Usar a sugestão reserva o munck 8 t", [x["codigo"] for x in adm.get(A+f"/atividades/{ids['e2']}/recursos").json()["recursos"]] == ["MUN-02"])
    g.locator(".og-rec-sel").select_option(str(R["MEG-03"])); g.wait_for_selector("#og-rec-t")
    check("Megômetro em manutenção nessas datas: aviso", "Em manutenção" in g.inner_text(".og-aloc"))
    g.click(".og-aloc .og-bt-laranja"); g.wait_for_selector(".og-rec .og-exig-chip.grave")
    h = adm.get(A+f"/atividades/{ids['e2']}/historico").json()["historico"][0]
    check("Reservar mesmo assim: chip em vermelho e histórico com as pendências", "MEG-03" in h["depois"].get("recursos", "") and "manutenção" in h["depois"].get("reservou_com_pendencias", ""), h)
    g.locator(".og-rec-sel").select_option(str(R["MUN-01"])); g.wait_for_selector("#og-rec-t")
    g.click(".og-rec-alugar-bt"); g.fill(".og-rec-alugar input[aria-label=Fornecedor]", "Sotreq"); g.fill(".og-rec-alugar input[aria-label='Custo por dia']", "650"); g.click(".og-rec-alugar .ob-bt-pri")
    g.wait_for_selector(".og-rec .og-exig-chip >> text=Caminhão munck 12 t (alugado)")
    L = [x for x in adm.get(A+"/recursos").json()["recursos"] if x["nome"] == "Caminhão munck 12 t (alugado)"]
    check("Alugar pelo aviso: cria o munck alugado nas datas da atividade e reserva", L and L[0]["locacao"]["fornecedor"] == "Sotreq" and L[0]["locacao"]["custo"] == 650)
    g.locator(".og-rec .og-exig-chip", has_text="MEG-03").locator("button").click(); g.wait_for_timeout(700)
    check("Tirar recurso da atividade", "MEG-03" not in [x["codigo"] for x in adm.get(A+f"/atividades/{ids['e2']}/recursos").json()["recursos"]])
    g.keyboard.press("Escape"); c.close()
    # encarregado: só lê
    c, e = nova(nav, {"width": 1440, "height": 1000}); entrar(e, "bruno@rawtech.com.br", "Bruno-Costa-2026")
    e.evaluate("tfRecursos.abrir()"); e.wait_for_selector(".rc-card")
    check("Encarregado vê a lista sem 'Novo recurso' nem fornecedores", e.locator("button >> text=Novo recurso").count() == 0 and e.locator("button >> text=Fornecedores").count() == 0)
    e.click(".rc-card >> text=Plataforma tesoura"); e.wait_for_selector(".rc-loc")
    check("Encarregado: ficha sem custos e sem botões de edição", "R$" not in e.inner_text(".rc-loc") and e.locator("button >> text=Registrar devolução").count() == 0 and e.locator("button >> text=Renovar").count() == 0)
    c.close()
    c, fu = nova(nav, {"width": 1440, "height": 1000}); entrar(fu, "carla@rawtech.com.br", "Carla-Mendes-2026")
    check("Funcionário não tem o menu Recursos", fu.locator("#nav-recursos").count() == 0)
    c.close()
    # celular
    c, m = nova(nav, {"width": 390, "height": 844}, True); entrar(m, "wendell@rawtech.com.br", "Obra-Segura-2026")
    m.evaluate("tfRecursos.abrir()"); m.wait_for_selector(".rc-card")
    check("Celular: lista sem rolagem lateral, 3 indicadores e atalhos", m.evaluate("document.documentElement.scrollWidth") <= 390 and m.locator(".eq-kpi").count() == 3 and m.locator(".rc-chips button").count() == 5 and m.locator(".rc-modo").count() == 0)
    m.click(".rc-chips button >> text=Alugados"); m.wait_for_timeout(150)
    check("Celular: atalho 'Alugados'", m.locator(".rc-card").count() == 3)
    m.click(".rc-chips button >> text=Todos"); m.click(".rc-card >> text=Terrômetro"); m.wait_for_selector(".eq-ficha-cab")
    check("Celular: ficha abre em Reservas, sem rolagem lateral", m.locator(".eq-abas button.on").inner_text().startswith("Reservas") and m.evaluate("document.documentElement.scrollWidth") <= 390)
    m.click(".eq-abas button >> text=Calibração"); m.wait_for_selector(".rc-ctrl")
    m.click("button >> text=Lançar com foto"); m.wait_for_selector(".eq-jan")
    check("Celular: lançar calibração abre a câmera e cabe na tela", m.locator(".eq-jan input[type=file][capture=environment]").count() == 1 and m.evaluate("document.querySelector('.eq-jan-corpo').scrollWidth") <= 390)
    m.keyboard.press("Escape"); c.close(); nav.close()
check("Sem erros de JavaScript", not erros, erros[:3])
print(f"RESULTADO: {ok} ok, {f} falhas")
