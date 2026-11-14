"""Teste de ponta a ponta do servidor TaskFlow PRO (PHP + MariaDB local)."""
import json, re, sys, requests

B = "http://127.0.0.1:8900/api"
EMAILS = "/home/claude/teste-api/emails.jsonl"
ok = falhas = 0

def check(nome, cond, extra=""):
    global ok, falhas
    if cond: ok += 1; print(f"OK    {nome}")
    else: falhas += 1; print(f"FALHA {nome} {extra}")

def emails():
    try: return [json.loads(l) for l in open(EMAILS, encoding="utf-8")]
    except FileNotFoundError: return []

def token_do_email(para, chave):
    for e in reversed(emails()):
        if e["para"] == para:
            m = re.search(chave + r"=([0-9a-f]{64})", e["texto"])
            if m: return m.group(1)
    return None

def sessao(): return requests.Session()
J = lambda s, m, rota, **kw: getattr(s, m)(B + rota, **kw)

an = sessao()
r = J(an, "get", "/saude"); check("Saúde responde sem banco instalado? (deve falhar ao consultar)", r.status_code in (200, 500))
r = J(an, "post", "/instalar", json={"token": "errado"}); check("Instalador recusa token errado", r.status_code == 403)
r = J(an, "post", "/instalar", json={"token": "token-de-instalacao-de-teste-123456"})
d = r.json(); check("Instalador cria o banco", r.status_code == 200 and d.get("tabelas") == 25 and d.get("documentos_nr") == 43, d)
check("Trava de prazo da NR instalada no banco", d.get("trava_no_banco") is True, d)
r = J(an, "post", "/instalar", json={"token": "token-de-instalacao-de-teste-123456"}); check("Instalador não roda duas vezes", r.status_code == 409)
r = J(an, "get", "/saude"); check("Saúde: banco conectado", r.json().get("banco") is True)

# CSRF: só aceita JSON
r = an.post(B + "/entrar", data={"email": "x", "senha": "y"}); check("Recusa formulário (não-JSON)", r.status_code == 415)

# ── Cadastro da Rawtech ──
cad = {
  "empresa": {"nome": "Rawtech", "cnpj": "11.222.333/0001-81", "cidade": "Recife", "uf": "pe"},
  "admin": {"nome": "Wendell", "email": "admin@rawtech.test", "senha": "senha-forte-1"},
  "equipe": [
    {"nome": "João Paulo", "cargo": "Encarregado", "perfil": "encarregado", "email": "jp@rawtech.test"},
    {"nome": "David", "cargo": "Eletricista", "perfil": "funcionario", "email": "david@rawtech.test"},
    {"nome": "Carlos", "cargo": "Ajudante", "perfil": "funcionario"},
    {"nome": "Ana", "cargo": "Planejamento", "perfil": "gestor", "email": "ana@rawtech.test", "tipo_trabalho": "escritorio"},
  ],
}
r = J(an, "post", "/cadastro", json={**cad, "admin": {**cad["admin"], "senha": "curta"}}); check("Recusa senha curta", r.status_code == 400)
r = J(an, "post", "/cadastro", json={**cad, "equipe": cad["equipe"] + [{"nome": "X", "perfil": "cliente"}]}); check("Recusa perfil cliente", r.status_code == 400)
r = J(an, "post", "/cadastro", json=cad); d = r.json()
check("Cadastro da empresa", r.status_code == 200 and d.get("convites_enviados") == 3, d)
r = J(an, "post", "/cadastro", json=cad); check("CNPJ repetido recusado", r.status_code == 409)
check("E-mail de confirmação + 3 convites enviados", len(emails()) == 4)

adm = sessao()
r = J(adm, "post", "/entrar", json={"email": "admin@rawtech.test", "senha": "senha-forte-1"}); check("Não entra sem confirmar e-mail", r.status_code == 403)
tok = token_do_email("admin@rawtech.test", "confirmar")
r = J(an, "post", "/confirmar-email", json={"token": tok}); check("Confirma e-mail", r.status_code == 200)
r = J(an, "post", "/confirmar-email", json={"token": tok}); check("Link de confirmação não vale duas vezes", r.status_code == 400)
r = J(adm, "post", "/entrar", json={"email": "ADMIN@rawtech.test", "senha": "senha-forte-1"}); check("Administrador entra (e-mail sem diferenciar maiúscula)", r.status_code == 200 and r.json()["usuario"]["perfil"] == "administrador", r.text)
ck = r.headers.get("Set-Cookie", "")
check("Cookie de sessão HttpOnly e SameSite=Strict", "HttpOnly" in ck and "SameSite=Strict" in ck, ck)
r = J(adm, "get", "/eu"); check("/eu traz a empresa", r.json()["usuario"]["empresa"] == "Rawtech")

# ── Convites ──
jp, david, ana = sessao(), sessao(), sessao()
r = J(jp, "post", "/convites/aceitar", json={"token": token_do_email("jp@rawtech.test", "convite"), "senha": "senha-do-jp-1"}); check("Encarregado aceita convite", r.status_code == 200 and r.json()["usuario"]["perfil"] == "encarregado", r.text)
r = J(david, "post", "/convites/aceitar", json={"token": token_do_email("david@rawtech.test", "convite"), "senha": "senha-do-david"}); check("Funcionário aceita convite", r.status_code == 200)
r = J(ana, "post", "/convites/aceitar", json={"token": token_do_email("ana@rawtech.test", "convite"), "senha": "senha-da-ana-1"}); check("Gestora aceita convite", r.status_code == 200)
r = J(an, "post", "/convites/aceitar", json={"token": token_do_email("jp@rawtech.test", "convite"), "senha": "outra-senha-1"}); check("Convite não vale duas vezes", r.status_code == 400)
r = J(jp, "post", "/convites", json={"nome": "Z", "email": "z@x.test", "perfil": "gestor"}); check("Só administrador convida", r.status_code == 403)

# ── Equipe e obras ──
f = {x["nome"]: x["id"] for x in J(adm, "get", "/funcionarios").json()["funcionarios"]}
check("Equipe criada no cadastro (4 pessoas)", len(f) == 4, f)
r = J(david, "get", "/funcionarios"); check("Funcionário não lista a equipe", r.status_code == 403)
r = J(jp, "get", "/funcionarios"); check("Encarregado lista a equipe sem custo/hora", r.status_code == 200 and "custo_hora" not in r.json()["funcionarios"][0])

r = J(ana, "post", "/projetos", json={"codigo": "MAN-001", "nome": "Manipuladores", "inicio": "2026-10-15", "fim": "2026-12-24"}); p1 = r.json().get("id"); check("Gestora cria obra", r.status_code == 200)
r = J(ana, "post", "/projetos", json={"codigo": "RET-001", "nome": "Retífica 01"}); p2 = r.json().get("id")
r = J(ana, "post", "/projetos", json={"codigo": "MAN-001", "nome": "dup"}); check("Código de obra repetido recusado", r.status_code == 409)
r = J(jp, "post", "/projetos", json={"nome": "x"}); check("Encarregado não cria obra", r.status_code == 403)
r = J(ana, "post", "/projetos", json={"nome": "x", "inicio": "2026-02-30"}); check("Data inválida recusada", r.status_code == 400)

r = J(ana, "post", "/atividades", json={"projeto_id": p1, "descricao": "Compra de material", "responsavel_id": f["João Paulo"], "inicio": "2026-10-31", "fim": "2026-11-19", "duracao_horas": 152}); a1 = r.json().get("id"); check("Cria atividade", r.status_code == 200, r.text)
r = J(ana, "post", "/atividades", json={"projeto_id": p1, "descricao": "Fabricação", "responsavel_id": f["David"], "inicio": "2026-11-09", "fim": "2026-12-09"}); a2 = r.json().get("id")
r = J(ana, "post", "/atividades", json={"projeto_id": p2, "descricao": "Pintura", "responsavel_id": f["Carlos"]}); a3 = r.json().get("id")
r = J(ana, "post", "/atividades", json={"projeto_id": p1, "descricao": "x", "inicio": "2026-12-01", "fim": "2026-11-01"}); check("Fim antes do início recusado", r.status_code == 400)

# Encarregado só vê obras de que é membro
r = J(jp, "get", "/projetos"); check("Encarregado sem obra não vê nada", r.json()["projetos"] == [])
jp_uid = J(jp, "get", "/eu").json()["usuario"]["id"]
r = J(ana, "post", f"/projetos/{p1}/membros", json={"usuario_id": jp_uid, "papel": "encarregado"}); check("Gestora põe encarregado na obra", r.status_code == 200)
r = J(jp, "get", "/projetos"); check("Encarregado vê só a obra dele", [p["id"] for p in r.json()["projetos"]] == [p1])
r = J(jp, "get", "/atividades"); check("Encarregado vê só as atividades da obra dele", sorted(a["id"] for a in r.json()["atividades"]) == sorted([a1, a2]))
r = J(jp, "patch", f"/atividades/{a2}", json={"avanco": 30, "situacao": "Em andamento"}); check("Encarregado lança avanço", r.status_code == 200)
r = J(jp, "patch", f"/atividades/{a2}", json={"fim": "2027-01-01"}); check("Encarregado não muda prazo", r.status_code == 403)
r = J(jp, "patch", f"/atividades/{a3}", json={"avanco": 10}); check("Encarregado não mexe em obra alheia", r.status_code == 404)

# Funcionário só vê as próprias atividades
r = J(david, "get", "/atividades"); check("Funcionário vê só a dele", [a["id"] for a in r.json()["atividades"]] == [a2])
r = J(david, "patch", f"/atividades/{a2}", json={"avanco": 45}); check("Funcionário lança o próprio avanço", r.status_code == 200)
r = J(david, "patch", f"/atividades/{a1}", json={"avanco": 45}); check("Funcionário não mexe na atividade de outro", r.status_code == 404)
r = J(david, "patch", f"/atividades/{a2}", json={"avanco": 120}); check("Avanço acima de 100 recusado", r.status_code == 400)
r = J(david, "patch", f"/atividades/{a2}", json={"responsavel_id": f["Carlos"]}); check("Funcionário não troca responsável", r.status_code == 403)

# ── Outra empresa: isolamento total ──
out = sessao()
J(an, "post", "/cadastro", json={"empresa": {"nome": "Outra Engenharia"}, "admin": {"nome": "Beto", "email": "beto@outra.test", "senha": "senha-do-beto"}})
J(an, "post", "/confirmar-email", json={"token": token_do_email("beto@outra.test", "confirmar")})
J(out, "post", "/entrar", json={"email": "beto@outra.test", "senha": "senha-do-beto"})
r = J(out, "get", "/projetos"); check("Outra empresa não vê obras da Rawtech", r.json()["projetos"] == [])
r = J(out, "get", "/atividades"); check("Outra empresa não vê atividades da Rawtech", r.json()["atividades"] == [])
r = J(out, "patch", f"/projetos/{p1}", json={"nome": "invadido"}); check("Outra empresa não altera obra da Rawtech", r.status_code == 404)
r = J(out, "delete", f"/atividades/{a1}"); check("Outra empresa não exclui atividade da Rawtech", r.status_code == 404)
r = J(out, "post", "/atividades", json={"projeto_id": p1, "descricao": "x"}); check("Outra empresa não cria atividade em obra da Rawtech", r.status_code == 404)
r = J(out, "post", "/projetos", json={"codigo": "MAN-001", "nome": "Mesmo código, outra empresa"}); check("Mesmo código permitido em outra empresa", r.status_code == 200)

# ── Login: bloqueio e senha ──
for i in range(5): J(an, "post", "/entrar", json={"email": "jp@rawtech.test", "senha": "errada"})
r = J(an, "post", "/entrar", json={"email": "jp@rawtech.test", "senha": "senha-do-jp-1"}); check("Bloqueia após 5 senhas erradas (15 min)", r.status_code == 429, r.text)
r = J(an, "post", "/entrar", json={"email": "ninguem@x.test", "senha": "qualquer-1"}); check("E-mail inexistente: mesma mensagem", r.status_code == 401 and "incorretos" in r.json()["erro"])
r = J(an, "post", "/esqueci-senha", json={"email": "ninguem@x.test"}); check("Esqueci-senha não revela se o e-mail existe", r.status_code == 200)
J(an, "post", "/esqueci-senha", json={"email": "admin@rawtech.test"})
r = J(an, "post", "/redefinir-senha", json={"token": token_do_email("admin@rawtech.test", "redefinir"), "senha": "nova-senha-adm"}); check("Redefine a senha", r.status_code == 200)
r = J(adm, "get", "/eu"); check("Redefinir senha encerra as sessões abertas", r.status_code == 401)
r = J(adm, "post", "/entrar", json={"email": "admin@rawtech.test", "senha": "nova-senha-adm"}); check("Entra com a senha nova", r.status_code == 200)
r = J(adm, "post", "/sair"); r = J(adm, "get", "/eu"); check("Sair encerra a sessão", r.status_code == 401)


# ── Fale conosco ──
ok2 = falhas2 = 0
def c2(n, c, x=""):
    global ok2, falhas2
    if c: ok2 += 1; print("OK   ", n)
    else: falhas2 += 1; print("FALHA", n, x)
v = requests.Session()
r = v.post(B+"/fale-conosco", json={"nome":"Visitante","email":"v@x.test","assunto":"Comercial","mensagem":"Quero conhecer o sistema para minha empresa."}); c2("Fale conosco sem login", r.status_code == 200, r.text)
r = v.post(B+"/fale-conosco", json={"nome":"V","email":"invalido","mensagem":"mensagem longa o bastante"}); c2("Recusa e-mail inválido", r.status_code == 400)
r = v.post(B+"/fale-conosco", json={"nome":"V","email":"v@x.test","mensagem":"curta"}); c2("Recusa mensagem curta", r.status_code == 400)
r = v.post(B+"/fale-conosco", json={"nome":"Robô","email":"r@x.test","mensagem":"spam spam spam spam","site":"http://spam"}); c2("Robô (campo isca) é ignorado em silêncio", r.status_code == 200)
for i in range(4): v.post(B+"/fale-conosco", json={"nome":"V","email":"v@x.test","mensagem":"mensagem número %d ok" % i})
r = v.post(B+"/fale-conosco", json={"nome":"V","email":"v@x.test","mensagem":"mais uma mensagem aqui"}); c2("Limite de 5 por hora sem login", r.status_code == 429, r.status_code)
li = requests.Session(); li.post(B+"/entrar", json={"email":"admin@rawtech.test","senha":"nova-senha-adm"})
r = li.post(B+"/fale-conosco", json={"assunto":"Problema no sistema","mensagem":"O Gantt não abriu hoje de manhã."}); c2("Fale conosco logado usa nome e e-mail da conta", r.status_code == 200, r.text)
import subprocess
linhas = subprocess.run(["mariadb","-uroot","--socket=/tmp/mdb/s.sock","--default-character-set=utf8mb4","tf_api","-N","-e","SELECT CONCAT(nome,'|',email,'|',origem,'|',IFNULL(empresa_id,'-')) FROM fale_conosco ORDER BY id"], capture_output=True, text=True).stdout.split()
c2("Gravado com origem e empresa", any(l.startswith("Wendell|admin@rawtech.test|sistema|1") for l in linhas) and "Robô" not in " ".join(linhas), linhas)
print(f"FALE CONOSCO: {ok2} ok, {falhas2} falhas")
print(f"RESULTADO: {ok} ok, {falhas} falhas")
