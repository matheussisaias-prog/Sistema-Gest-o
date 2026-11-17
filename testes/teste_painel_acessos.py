"""Painel da plataforma (servidor): acessos por pessoa e por dia, empresa da administração fora das listas,
apagar dados de teste da administração, excluir empresa cliente, excluir mensagem do Fale conosco."""
import sys, os, subprocess, requests
sys.path.insert(0, "/home/claude/telas"); from comum import token
A = "http://127.0.0.1:8900/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
SQL = ["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-N", "-e"]
def q(s): return subprocess.run(SQL + [s], capture_output=True, text=True, check=True).stdout.strip()
PC = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130"}
CEL = {"User-Agent": "Mozilla/5.0 (Linux; Android 14; SM-A546) Mobile Chrome/130"}
def entrar(e, s, ua=PC):
    x = requests.Session(); x.headers.update(ua); x.r = x.post(A+"/entrar", json={"email": e, "senha": s}); return x
def cadastrar(emp, nome, email, senha, equipe=()):
    requests.post(A+"/cadastro", json={"empresa": {"nome": emp, "cidade": "Recife", "uf": "PE"}, "admin": {"nome": nome, "email": email, "senha": senha}, "equipe": list(equipe)})
    requests.post(A+"/confirmar-email", json={"token": token(email, "confirmar")})

# ── dados: Mercurium (administração, com dados de teste), Rawtech (cliente cujo admin também é dono pela configuração), Alfa e Beta ──
cadastrar("Mercurium", "Suporte Mercurium", "suporte@mercurium.com.br", "Suporte-Merc-2026",
          [{"nome": "Teste Interno", "cargo": "Testador", "perfil": "gestor", "email": "teste@mercurium.com.br"}])
requests.post(A+"/convites/aceitar", json={"token": token("teste@mercurium.com.br", "convite"), "senha": "Teste-Interno-2026"})
cadastrar("Rawtech Engenharia", "Wendell Xavier", "wendell@rawtech.com.br", "Obra-Segura-2026")
cadastrar("Construtora Alfa", "Ana Lima", "ana@alfa.test", "senha-da-ana-1", [{"nome": "Bia Campo", "cargo": "Encarregada", "perfil": "encarregado", "email": "bia@alfa.test"}])
requests.post(A+"/convites/aceitar", json={"token": token("bia@alfa.test", "convite"), "senha": "senha-da-bia-1"})
cadastrar("Beta Obras", "Beto Reis", "beto@beta.test", "senha-do-beto-1")
dono = entrar("suporte@mercurium.com.br", "Suporte-Merc-2026")
mid = int(q("SELECT id FROM empresas WHERE nome = 'Mercurium'"))
for c, n in [("TST-01", "Galpão (teste)"), ("TST-02", "Subestação (teste)")]: dono.post(A+"/projetos", json={"codigo": c, "nome": n})
dono.post(A+"/funcionarios", json={"nome": "Paulo Nunes (teste)", "cargo": "Eletricista", "tipo_trabalho": "campo"})
pasta = f"/home/claude/teste-api/tf-arquivos-gestao/{mid}/fotos"; os.makedirs(pasta, exist_ok=True); open(pasta + "/x.jpg", "w").write("x")

# ── antes da limpeza: a empresa de quem está no painel fica à parte ──
r = dono.get(A+"/painel/empresas").json(); emp = {e["nome"]: e for e in r["empresas"]}
check("Clientes listados sem a Mercurium", set(emp) == {"Rawtech Engenharia", "Construtora Alfa", "Beta Obras"}, list(emp))
check("Mercurium aparece como administração, com os dados de teste contados", r["plataforma"]["nome"] == "Mercurium" and r["plataforma"]["dados"]["obras"] == 2
      and r["plataforma"]["dados"]["funcionarios"] >= 1 and r["plataforma"]["dados"]["outros_usuarios"] == 1, r["plataforma"].get("dados"))
check("Cliente não vê acessos", entrar("ana@alfa.test", "senha-da-ana-1").get(A+"/painel/acessos").status_code == 403)

# ── acessos ──
ana = entrar("ana@alfa.test", "senha-da-ana-1", CEL); ana.get(A+"/eu"); ana.get(A+"/projetos")
ana_pc = entrar("ana@alfa.test", "senha-da-ana-1", PC)
bia = entrar("bia@alfa.test", "senha-da-bia-1", CEL); bia.get(A+"/eu")
aid = int(q("SELECT id FROM usuarios WHERE email = 'ana@alfa.test'"))
antes = int(q(f"SELECT SUM(visitas) FROM acessos WHERE usuario_id = {aid}"))
ana.get(A+"/eu")
check("Requisições seguidas não contam como novo acesso", int(q(f"SELECT SUM(visitas) FROM acessos WHERE usuario_id = {aid}")) == antes)
q(f"UPDATE sessoes SET usado_em = UTC_TIMESTAMP() - INTERVAL 40 MINUTE WHERE usuario_id = {aid}")
ana.get(A+"/eu")
check("Voltar depois de 40 min parado conta um novo acesso", int(q(f"SELECT SUM(visitas) FROM acessos WHERE usuario_id = {aid}")) == antes + 1)
q(f"INSERT INTO acessos (usuario_id, dia, empresa_id, visitas, entradas, primeiro, ultimo, celular, computador) SELECT {aid}, DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) - INTERVAL 3 DAY, empresa_id, 2, 1, UTC_TIMESTAMP() - INTERVAL 3 DAY, UTC_TIMESTAMP() - INTERVAL 3 DAY, 0, 1 FROM usuarios WHERE id = {aid}")
A30 = dono.get(A+"/painel/acessos?dias=30").json(); R = A30["resumo"]; P = {p["email"]: p for p in A30["pessoas"]}
check("Série com um ponto por dia do período", len(A30["serie"]) == 30 and A30["serie"][-1]["dia"] == A30["hoje"])
check("Hoje: Ana e Bia (a administração não conta)", R["hoje"] == 2 and R["pessoas"] == 2, R)
check("Cadastrados: só clientes (Rawtech 1 + Alfa 2 + Beta 1)", R["cadastrados"] == 4, R)
check("Empresas usando: 1 de 3", R["empresas_ativas"] == 1 and R["empresas"] == 3, R)
check("Celular e computador por pessoa (Bia aceitou o convite no computador)", R["celular"] == 2 and R["computador"] == 2, R)
check("Ana: acessos somados, 2 dias, celular e computador", P["ana@alfa.test"]["acessos"] == antes + 1 + 2 and P["ana@alfa.test"]["dias"] == 2
      and P["ana@alfa.test"]["celular"] == 1 and P["ana@alfa.test"]["computador"] == 1, P["ana@alfa.test"])
check("Quem nunca entrou aparece com zero", P["beto@beta.test"]["acessos"] == 0 and P["beto@beta.test"]["ultimo"] is None, P["beto@beta.test"])
check("Suporte e teste da Mercurium fora da lista", "suporte@mercurium.com.br" not in P and "teste@mercurium.com.br" not in P)
check("Gráfico: 3 dias atrás tem a Ana", next(d for d in A30["serie"] if d["dia"] != A30["hoje"] and d["pessoas"]) ["acessos"] == 2)
alfa = emp["Construtora Alfa"]["id"]
A7 = dono.get(A+f"/painel/acessos?dias=7&empresa={alfa}").json()
check("Filtro por empresa e 7 dias", len(A7["serie"]) == 7 and {p["empresa"] for p in A7["pessoas"]} == {"Construtora Alfa"} and A7["resumo"]["empresas"] == 1)
check("Período inválido volta para 30", dono.get(A+"/painel/acessos?dias=5").json()["dias"] == 30)
emp = {e["nome"]: e for e in dono.get(A+"/painel/empresas").json()["empresas"]}
check("Empresas: ativos 7 dias e acessos 30 dias", emp["Construtora Alfa"]["pessoas_7d"] == 2 and emp["Construtora Alfa"]["acessos_30d"] >= 5 and emp["Beta Obras"]["pessoas_7d"] == 0)

# ── apagar os dados de teste da administração ──
check("Limpeza pede a palavra APAGAR", dono.post(A+"/painel/plataforma/limpar", json={"confirmar": "apagar tudo"}).status_code == 400)
check("Cliente não limpa nada", ana_pc.post(A+"/painel/plataforma/limpar", json={"confirmar": "APAGAR"}).status_code == 403)
teste = entrar("teste@mercurium.com.br", "Teste-Interno-2026")
r = dono.post(A+"/painel/plataforma/limpar", json={"confirmar": "APAGAR"})
check("Apaga os dados de teste", r.status_code == 200 and r.json()["apagados"].get("projetos") == 2 and r.json()["apagados"].get("usuarios") == 1, r.text)
cont = q(f"SELECT (SELECT COUNT(*) FROM projetos WHERE empresa_id={mid}) + (SELECT COUNT(*) FROM funcionarios WHERE empresa_id={mid}) + (SELECT COUNT(*) FROM atividades WHERE empresa_id={mid}) + (SELECT COUNT(*) FROM historico WHERE empresa_id={mid} AND tabela <> 'empresas')")
check("Nada de obra, equipe ou atividade sobrou", cont == "0", cont)
check("Usuário de teste da Mercurium saiu e caiu a sessão dele", teste.get(A+"/eu").status_code == 401 and q("SELECT COUNT(*) FROM usuarios WHERE email='teste@mercurium.com.br'") == "0")
check("Arquivos da empresa apagados", not os.path.exists(pasta))
eu = dono.get(A+"/eu").json()["usuario"]
check("Suporte continua entrando e é a conta da administração", eu["dono_plataforma"] == 1 and eu["empresa_plataforma"] == 1)
r = dono.get(A+"/painel/empresas").json()
check("Administração aparece limpa", r["plataforma"]["dados"]["total"] == 0 and r["plataforma"]["plataforma"] == 1, r["plataforma"]["dados"])
check("Dados dos clientes intactos", q("SELECT COUNT(*) FROM usuarios WHERE email IN ('ana@alfa.test','bia@alfa.test','wendell@rawtech.com.br')") == "3")
w = entrar("wendell@rawtech.com.br", "Obra-Segura-2026"); weu = w.get(A+"/eu").json()["usuario"]
check("Dono que é cliente (Rawtech) continua no sistema normal", weu["dono_plataforma"] == 1 and weu["empresa_plataforma"] == 0)
check("Para ele, a Rawtech aparece como cliente e a Mercurium como administração", "Rawtech Engenharia" in {e["nome"] for e in w.get(A+"/painel/empresas").json()["empresas"]}
      and w.get(A+"/painel/empresas").json()["plataforma"]["nome"] == "Mercurium")
check("Não suspende a administração", dono.patch(A+f"/painel/empresas/{mid}", json={"situacao": "suspenso"}).status_code == 400)

# ── excluir empresa cliente ──
beta = emp["Beta Obras"]["id"]
check("Excluir pede o nome da empresa", dono.delete(A+f"/painel/empresas/{beta}", json={"confirmar": "Beta"}).status_code == 400)
check("Administração não pode ser excluída", dono.delete(A+f"/painel/empresas/{mid}", json={"confirmar": "Mercurium"}).status_code == 400)
check("Cliente não exclui empresa", ana_pc.delete(A+f"/painel/empresas/{beta}", json={"confirmar": "Beta Obras"}).status_code == 403)
r = dono.delete(A+f"/painel/empresas/{beta}", json={"confirmar": "beta obras"})
check("Exclui a Beta (nome sem diferenciar maiúsculas)", r.status_code == 200, r.text)
check("Beta sumiu do banco e o login dela não entra", q(f"SELECT COUNT(*) FROM empresas WHERE id={beta}") == "0" and entrar("beto@beta.test", "senha-do-beto-1").r.status_code == 401)
check("Beta fora da lista e dos cadastrados", "Beta Obras" not in {e["nome"] for e in dono.get(A+"/painel/empresas").json()["empresas"]}
      and dono.get(A+"/painel/acessos").json()["resumo"]["cadastrados"] == 3)
check("Exclusão fica no histórico da administração", q(f"SELECT COUNT(*) FROM historico WHERE empresa_id={mid} AND tabela='empresas' AND acao='excluiu'") == "1")

# ── Fale conosco: excluir mensagem de teste ──
requests.post(A+"/fale-conosco", json={"nome": "Teste Task Flow", "email": "x@teste.test", "assunto": "Outro", "mensagem": "Mensagem de teste do formulário de contato."})
m = dono.get(A+"/fale-conosco").json()["mensagens"][0]["id"]
check("Cliente não apaga mensagem", ana_pc.delete(A+f"/fale-conosco/{m}").status_code == 403)
check("Administração apaga a mensagem de teste", dono.delete(A+f"/fale-conosco/{m}").status_code == 200 and not dono.get(A+"/fale-conosco").json()["mensagens"])
print(f"RESULTADO: {ok} ok, {f} falhas")
