import sys, json, time, requests; sys.path.insert(0, "/home/claude/telas")
from comum import rotas, token
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"
ok = falhas = 0
def check(n, c, x=""):
    global ok, falhas
    if c: ok += 1; print("OK   ", n)
    else: falhas += 1; print("FALHA", n, x)

# empresa + administrador + encarregado (pela API)
s = requests.Session()
s.post(B+"/api/cadastro", json={"empresa":{"nome":"Rawtech"},"admin":{"nome":"Wendell","email":"w@rawtech.test","senha":"Senha-Forte-1"},
       "equipe":[{"nome":"João Paulo","cargo":"Encarregado","perfil":"encarregado","email":"jp@rawtech.test"}]})
s.post(B+"/api/confirmar-email", json={"token": token("w@rawtech.test","confirmar")}); s.post(B+"/api/entrar", json={"email":"w@rawtech.test","senha":"Senha-Forte-1"})
LOCAL = {
 "tf_projects": [{"id":"p1","name":"Manipuladores","status":"Em andamento"},
                 {"id":"_x1","name":"LECTRA 5","code":"LEC-005","desc":"Projeto elétrico Lear","manager":"Wendell","status":"Planejamento","startDate":"2026-11-01","endDate":"2027-01-30","color":"#7c3aed"}],
 "tf_activities": [{"id":"a1","project":"Manipuladores","description":"exemplo","responsible":"JOÃO PAULO","status":"Pendente","progress":0},
                   {"id":"_y1","project":"LECTRA 5","projectId":"_x1","description":"Levantamento de cargas","responsible":"Joao Paulo","startDate":"2026-11-03","dueDate":"2026-11-20","status":"Em Andamento","progress":40,"durationH":72,"isCritical":True,"obs":"Lear Goiana"},
                   {"id":"_y2","project":"LECTRA 5","projectId":"_x1","description":"Diagrama unifilar","responsible":"David","startDate":"2026-11-21","dueDate":"2026-12-10","status":"Pendente","progress":0,"parentId":"_y1"}],
 "tf_employees_v2": [{"id":"e1","key":"david","name":"David","team":"Elétrica","role":"Eletricista"}],
 "tf_resources_registry_v1": [{"id":"r1","name":"Andaime 6m","isCollaborator":False}],
 "tf_team_calendar_v2": {"david":{"2026-12-22":{"type":"Férias","label":"Férias"},"2026-12-23":{"type":"Férias","label":"Férias"},"2026-12-24":{"type":"Férias","label":"Férias"}}},
}
STUB = "window.Chart=function(){return{destroy(){},update(){},data:{datasets:[]}}};window.Chart.register=function(){};window.Chart.defaults={font:{},plugins:{legend:{labels:{}},tooltip:{}},scale:{grid:{}}};"
with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    ctx = nav.new_context(viewport={"width":1366,"height":800}, accept_downloads=True)
    pg = ctx.new_page(); rotas(pg)
    pg.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.goto(B+"/index.html"); pg.wait_for_url("**/entrar.html", timeout=8000)
    check("Sem login, o sistema manda para entrar.html", pg.url.endswith("entrar.html"))
    pg.evaluate("d => { for (const [k,v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(v)); }", LOCAL)
    pg.fill("#e-email","w@rawtech.test"); pg.fill("#e-senha","Senha-Forte-1"); pg.click("#f-entrar button[type=submit]")
    pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-imp", timeout=8000)
    check("Cabeçalho mostra quem entrou", "Wendell" in pg.inner_text(".tf-user") and "Administrador" in pg.inner_text(".tf-user"))
    txt = pg.inner_text(".tf-imp")
    check("Oferece importar (sem contar o exemplo)", "1 obra" in txt and "2 atividade" in txt, txt)
    with pg.expect_download() as dl: pg.click("#tf-imp-sim")
    check("Baixa cópia antes de importar", dl.value.suggested_filename == "mercronos-copia-do-navegador.json")
    pg.wait_for_selector(".tf-imp", state="detached", timeout=8000)
    projs = s.get(B+"/api/projetos").json()["projetos"]; acts = s.get(B+"/api/atividades").json()["atividades"]
    check("Importou a obra LECTRA 5 com status Planejamento", [(x["nome"],x["situacao"]) for x in projs] == [("LECTRA 5","Planejamento")], projs)
    check("Importou 2 atividades, subatividade ligada à mãe", len(acts)==2 and acts[1]["pai_id"]==acts[0]["id"], acts)
    check("'JOÃO PAULO'/'Joao Paulo' virou o mesmo funcionário do cadastro", acts[0]["responsavel_nome"]=="João Paulo", acts[0]["responsavel_nome"])
    aus = s.get(B+"/api/ausencias").json()["ausencias"]
    check("Férias de 3 dias viraram 1 período", len(aus)==1 and aus[0]["inicio"]=="2026-12-22" and aus[0]["fim"]=="2026-12-24", aus)
    check("Tela mostra o que veio do servidor", pg.evaluate("activities.length")==2 and pg.evaluate("projects[0].name")=="LECTRA 5")

    # criar obra e atividade pelas funções das telas
    pg.evaluate("""() => { editingProjId=null; document.getElementById('proj-name').value='Retífica 03'; document.getElementById('proj-manager').value='Ana';
        document.getElementById('proj-code').value='RET-003'; document.getElementById('proj-status').value='Em andamento'; saveProject(); }""")
    pg.wait_for_timeout(1500)
    pr = [x for x in s.get(B+"/api/projetos").json()["projetos"] if x["nome"]=="Retífica 03"]
    check("Nova obra criada na tela chega ao servidor", len(pr)==1 and pr[0]["codigo"]=="RET-003", pr)
    pg.evaluate("""() => { editingActId=null; document.getElementById('act-project').value='Retífica 03'; document.getElementById('act-description').value='Compra de material';
        document.getElementById('act-responsible').value='Carlos Novo'; document.getElementById('act-start').value='2026-11-16'; document.getElementById('act-due').value='2026-11-30';
        document.getElementById('act-status').value='Pendente'; document.getElementById('act-progress').value='0'; saveActivity(); }""")
    pg.wait_for_timeout(1800)
    nova = [x for x in s.get(B+"/api/atividades").json()["atividades"] if x["descricao"]=="Compra de material"]
    check("Nova atividade chega ao servidor com responsável novo", len(nova)==1 and nova[0]["responsavel_nome"]=="Carlos Novo", nova)
    # editar avanço
    pg.evaluate("() => { const a = activities.find(x=>x.description==='Levantamento de cargas'); a.progress = 75; save(); }"); pg.wait_for_timeout(1500)
    a = [x for x in s.get(B+"/api/atividades").json()["atividades"] if x["descricao"]=="Levantamento de cargas"][0]
    check("Alteração de avanço gravada", a["avanco"]==75)
    hist = s.get(B+"/api/atividades").status_code
    # excluir
    pg.evaluate("() => { activities = activities.filter(x=>x.description!=='Compra de material'); save(); }"); pg.wait_for_timeout(1500)
    check("Exclusão gravada", not [x for x in s.get(B+"/api/atividades").json()["atividades"] if x["descricao"]=="Compra de material"])
    # status da equipe
    pg.evaluate("() => { teamCalendar['carlos novo'] = {'2026-12-01':{type:'Treinamento',label:'NR-10'},'2026-12-02':{type:'Treinamento',label:'NR-10'}}; save(); }"); pg.wait_for_timeout(1500)
    aus = [x for x in s.get(B+"/api/ausencias").json()["ausencias"] if x["funcionario_nome"]=="Carlos Novo"]
    check("Treinamento no calendário vira período no servidor", len(aus)==1 and aus[0]["detalhe"]=="NR-10" and aus[0]["fim"]=="2026-12-02", aus)
    check("Indicador verde: tudo salvo", pg.get_attribute("#tf-sync","class").strip()=="tf-sync")
    # recarregar: dados persistem, sem nova oferta de importação
    pg.reload(); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(1500)
    check("Depois de recarregar, os dados continuam (vindos do servidor)", pg.evaluate("activities.length")==2 and pg.evaluate("projects.length")==2)
    check("Não oferece importar de novo", pg.query_selector(".tf-imp") is None)
    check("Vencido calculado na tela não gera gravação repetida", pg.get_attribute("#tf-sync","class").strip()=="tf-sync")
    # sair
    pg.click("#tf-sair"); pg.wait_for_url("**/entrar.html"); check("Sair volta ao login", pg.url.endswith("entrar.html"))
    pg.goto(B+"/index.html"); pg.wait_for_url("**/entrar.html"); check("Depois de sair, o sistema exige login de novo", True)

    # encarregado
    lec = [x for x in s.get(B+"/api/projetos").json()["projetos"] if x["nome"]=="LECTRA 5"][0]
    pg2 = nav.new_context(viewport={"width":390,"height":844}).new_page(); rotas(pg2)
    pg2.route("**/chart.umd.min.js", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
    pg2.goto(B+"/entrar.html?convite="+token("jp@rawtech.test","convite")); pg2.fill("#n-senha","Senha-JP-2026"); pg2.fill("#n-senha2","Senha-JP-2026"); pg2.click("#f-senha button[type=submit]")
    pg2.wait_for_url("**/index.html"); pg2.wait_for_selector(".tf-user"); pg2.wait_for_timeout(800)
    check("Encarregado sem obra atribuída não vê obras", pg2.evaluate("projects.length")==0)
    jp = [x for x in requests.Session().get(B+"/api/eu").json().get("usuario",{}).items()] if False else None
    uid = pg2.evaluate("fetch('api/eu').then(r=>r.json()).then(j=>j.usuario.id)")
    s.post(B+f"/api/projetos/{lec['id']}/membros", json={"usuario_id": uid, "papel":"encarregado"})
    pg2.reload(); pg2.wait_for_selector(".tf-user"); pg2.wait_for_timeout(1000)
    check("Encarregado vê a obra dele", pg2.evaluate("projects.map(p=>p.name).join()")=="LECTRA 5")
    pg2.evaluate("() => { activities[0].progress = 90; save(); }"); pg2.wait_for_timeout(1500)
    a = [x for x in s.get(B+"/api/atividades").json()["atividades"] if x["descricao"]=="Levantamento de cargas"][0]
    check("Encarregado lança avanço", a["avanco"]==90)
    pg2.evaluate("() => { activities[0].description = 'mudado'; save(); }"); pg2.wait_for_timeout(1500)
    check("Encarregado não muda descrição: aviso de erro", "erro" in pg2.get_attribute("#tf-sync","class"))
    real = [e for e in erros if "Chart" not in e]
    check("Sem erros de JavaScript", not real, real)
    nav.close()
print(f"RESULTADO: {ok} ok, {falhas} falhas")
