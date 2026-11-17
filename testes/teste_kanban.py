"""Kanban compacto: cada coluna cabe na tela e pagina com ‹ 1/N › (computador e celular)."""
import sys, requests, datetime as dt
sys.path.insert(0, "/home/claude/telas"); from dados_rel import montar
from playwright.sync_api import sync_playwright
ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
pid, *_ = montar()
A="http://127.0.0.1:8900/api"; s=requests.Session(); s.post(A+"/entrar", json={"email":"wendell@rawtech.com.br","senha":"Obra-Segura-2026"})
h=dt.date.today()
nomes=["Lançamento de eletrodutos","Passagem de cabos de força","Montagem de quadro de distribuição","Instalação de luminárias LED","Teste de isolamento","Fixação de eletrocalhas perfuradas no mezanino","Aterramento de estruturas","Identificação de circuitos"]
for i in range(22):
    ini=h-dt.timedelta(days=30-i); fim=ini+dt.timedelta(days=3)
    s.post(A+"/atividades", json={"projeto_id":pid,"descricao":f"{nomes[i%8]} · trecho {i+1}","inicio":ini.isoformat(),"fim":fim.isoformat()})
for i in range(14):
    ini=h+dt.timedelta(days=5+i); s.post(A+"/atividades", json={"projeto_id":pid,"descricao":f"{nomes[i%8]} · área {i+1}","inicio":ini.isoformat(),"fim":(ini+dt.timedelta(days=4)).isoformat()})
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for nome,vp,mob in [("desk",{"width":1440,"height":900},False),("cel",{"width":390,"height":844},True)]:
        c=b.new_context(viewport=vp, is_mobile=mob, device_scale_factor=2 if mob else 1); pg=c.new_page(); erros=[]
        pg.on("pageerror", lambda e: erros.append(str(e)))
        pg.goto("http://127.0.0.1:8900/entrar.html"); pg.fill("#e-email","wendell@rawtech.com.br"); pg.fill("#e-senha","Obra-Segura-2026"); pg.click("#f-entrar button[type=submit]")
        pg.wait_for_url("**/index.html"); pg.wait_for_selector(".tf-user"); pg.wait_for_timeout(800)
        pg.evaluate("switchView('kanban', document.querySelector('[onclick*=\"kanban\"]'))"); pg.wait_for_timeout(800)
        info=pg.evaluate("""() => ({rolagem: document.scrollingElement.scrollHeight - innerHeight, main: (()=>{const m=document.querySelector('#view-kanban').closest('main,.main,.content')||document.body; return m.scrollHeight-m.clientHeight})(),
          cols:[...document.querySelectorAll('.kanban-col')].map(c=>c.querySelector('.kanban-col-title').innerText+':'+c.querySelectorAll('.kb-c').length+'/'+c.querySelector('.kanban-col-count').innerText+' '+(c.querySelector('.kb-pag span')?.innerText||''))})""")
        cols = {c.split(':')[0]: c for c in info["cols"]}
        check(f"[{nome}] Kanban não rola para baixo (colunas cabem na tela)", pg.evaluate("Math.max(...[...document.querySelectorAll('.kanban-col')].map(x=>x.getBoundingClientRect().bottom)) <= innerHeight"))
        check(f"[{nome}] Coluna cheia mostra só uma página e o contador 1/N", "1/" in cols["Pendente"] and int(cols["Pendente"].split(":")[1].split("/")[0]) < 28, cols["Pendente"])
        check(f"[{nome}] Coluna com poucos cartões não tem paginação", pg.locator(".kanban-col", has_text="Em Andamento").locator(".kb-pag").count() == 0)
        primeiro = pg.locator(".kanban-col").first.locator(".kb-t").first.inner_text()
        pg.locator(".kanban-col").first.locator(".kb-bt").nth(1).click(); pg.wait_for_timeout(300)
        check(f"[{nome}] Próxima página troca os cartões e mostra 2/N", pg.locator(".kanban-col").first.locator(".kb-pag span").inner_text().startswith("2/") and pg.locator(".kanban-col").first.locator(".kb-t").first.inner_text() != primeiro)
        pg.locator(".kanban-col").first.locator(".kb-bt").first.click(); pg.wait_for_timeout(300)
        check(f"[{nome}] Voltar retorna à página 1 e o botão de voltar fica desligado", pg.locator(".kanban-col").first.locator(".kb-bt").first.is_disabled())
        check(f"[{nome}] Sem erro de tela", not [e for e in erros if "Chart" not in e], erros)
        c.close()
    b.close()
print(f"RESULTADO: {ok} ok, {f} falhas")
