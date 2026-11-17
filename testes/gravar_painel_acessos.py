"""GIFs do painel da plataforma: Acessos, Empresas (administração com dados de teste → apagar) — computador e celular.
Dados de demonstração só no banco local de teste."""
import sys, random, subprocess, datetime as dt, requests; sys.path.insert(0, "/home/claude/telas")
from comum import rotas, token
from gravar import Gravador
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8900"; A = B + "/api"
SQL = ["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-N", "-e"]
def q(s): return subprocess.run(SQL + [s], capture_output=True, text=True, check=True).stdout.strip()
SENHA = "Painel-Mercurium-26"
def cadastrar(emp, nome, email, senha, cid, equipe=()):
    requests.post(A+"/cadastro", json={"empresa": {"nome": emp, "cidade": cid, "uf": "PE"}, "admin": {"nome": nome, "email": email, "senha": senha}, "equipe": list(equipe)})
    requests.post(A+"/confirmar-email", json={"token": token(email, "confirmar")})
cadastrar("Mercurium", "Suporte Mercurium", "suporte@mercurium.com.br", SENHA, "Recife")
cadastrar("Rawtech Engenharia", "Wendell Xavier", "wendell@rawtech.com.br", "Obra-Segura-2026", "Recife",
          [{"nome": "Ana Ribeiro", "cargo": "Engenheira", "perfil": "gestor", "email": "ana@rawtech.com.br"},
           {"nome": "Bruno Costa", "cargo": "Encarregado", "perfil": "encarregado", "email": "bruno@rawtech.com.br"},
           {"nome": "Carla Mendes", "cargo": "Eletricista", "perfil": "funcionario", "email": "carla@rawtech.com.br"}])
for em in ["ana@rawtech.com.br", "bruno@rawtech.com.br"]: requests.post(A+"/convites/aceitar", json={"token": token(em, "convite"), "senha": "Senha-Demo-2026"})
cadastrar("Construtora Alfa", "Lúcia Prado", "lucia@alfa.com.br", "Alfa-Obras-2026", "Olinda")
dono = requests.Session(); dono.post(A+"/entrar", json={"email": "suporte@mercurium.com.br", "senha": SENHA})
def teste_na_mercurium():
    for c, n in [("TST-01", "Galpão Logístico (teste)"), ("TST-02", "Subestação 1000 kVA (teste)")]: dono.post(A+"/projetos", json={"codigo": c, "nome": n})
    dono.post(A+"/funcionarios", json={"nome": "Marcos Silva (teste)", "cargo": "Eletricista", "tipo_trabalho": "campo"})
teste_na_mercurium()
# histórico de acessos dos últimos 30 dias (demonstração)
random.seed(7); q("DELETE FROM acessos")
us = {r.split("\t")[0]: r.split("\t")[1:] for r in q("SELECT email, id, empresa_id FROM usuarios").splitlines()}
perfil = {"wendell@rawtech.com.br": (0.8, 0), "ana@rawtech.com.br": (0.75, 0.3), "bruno@rawtech.com.br": (0.9, 1), "lucia@alfa.com.br": (0.25, 0)}
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
for em, (chance, cel) in perfil.items():
    uid, eid = us[em]
    for k in range(29, -1, -1):
        d = hoje - dt.timedelta(days=k)
        if d.weekday() >= 5 and random.random() < 0.8: continue
        if em == "lucia@alfa.com.br" and k < 9: continue          # a Alfa parou de entrar
        if random.random() > chance and k: continue
        v = random.randint(1, 4); c = 1 if random.random() < cel else 0
        q(f"INSERT INTO acessos VALUES ({uid}, '{d}', {eid}, {v}, {min(v, 2)}, '{d} 11:{random.randint(10,59)}:00', '{d} 20:{random.randint(10,59)}:00', {c}, {1-c})")

def roteiro(pg, g, celular):
    pg.goto(B + "/entrar.html?voltar=painel"); pg.wait_for_selector("#v-entrar:not([hidden])"); pg.wait_for_timeout(400); g.pausa(1200)
    g.digitar("#e-email", "suporte@mercurium.com.br", 5); g.digitar("#e-senha", SENHA, 6)
    pg.click("#f-entrar button[type=submit]"); pg.wait_for_selector("#conteudo:not([hidden])"); pg.wait_for_timeout(700); g.pausa(3200)
    pg.hover("#a-grafico svg g:nth-last-of-type(2)"); g.pausa(1400)
    for _ in range(2 if not celular else 5): pg.mouse.wheel(0, 360); pg.wait_for_timeout(350); g.pausa(1100)
    pg.select_option("#a-quem", "nao"); pg.wait_for_timeout(300); g.pausa(2000); pg.select_option("#a-quem", ""); pg.wait_for_timeout(200)
    pg.mouse.wheel(0, -3000); pg.wait_for_timeout(300)
    pg.select_option("#a-dias", "7"); pg.wait_for_timeout(700); g.pausa(1800); pg.select_option("#a-dias", "30"); pg.wait_for_timeout(700)
    g.clicar("[data-aba=empresas]", depois=2600)
    if celular:
        for _ in range(2): pg.mouse.wheel(0, 380); pg.wait_for_timeout(350); g.pausa(1000)
        pg.mouse.wheel(0, -2000); pg.wait_for_timeout(300)
    g.clicar("#plataforma .bt-perigo", depois=1300)
    g.digitar(".janela .digite", "APAGAR", 2); g.pausa(500)
    g.clicar(".janela .bt-perigo", depois=500); pg.wait_for_selector("#plataforma.limpa"); pg.wait_for_timeout(400); g.pausa(2400)
    linha = "#e-corpo tr:has-text('Rawtech') >> text=Acessos"
    pg.locator(linha).scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    g.clicar(linha, depois=2600)

with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for celular, nome, larg, vp, esc in [(False, "painel-acessos-computador", 1100, {"width": 1366, "height": 800}, 1), (True, "painel-acessos-celular", 488, {"width": 390, "height": 844}, 1.25)]:
        c = nav.new_context(viewport=vp, device_scale_factor=esc, is_mobile=celular, has_touch=celular); pg = c.new_page(); rotas(pg)
        g = Gravador(pg, larg); roteiro(pg, g, celular); g.salvar(f"/home/claude/gifs/{nome}.gif"); print(nome, len(g.quadros))
        c.close(); teste_na_mercurium()          # repõe os dados de teste para a próxima gravação
    nav.close()
