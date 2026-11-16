"""Empresa e usuários (servidor): lista (usuários, convites, fichas, limite do plano), convites por e-mail e por link para
WhatsApp (entrar com o celular), reenviar/cancelar, trocar perfil, desativar/reativar, link de nova senha, limite do plano,
dados da empresa, regras do campo (foto, comentário, Travou, prazo e assinatura do RDO), calendário padrão, plano,
permissões e isolamento."""
import sys, json, subprocess, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from dados_rdo import montar, foto
from comum import token, EMAILS
A = "http://127.0.0.1:8900/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
SQL = ["mariadb", "-uroot", "--socket=/tmp/mdb/s.sock", "tf_api", "-N", "-e"]
def q(s): return subprocess.run(SQL + [s], capture_output=True, text=True, check=True).stdout.strip()
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
pid, p2, ids, R, rd = montar()
def sessao(e, s):
    x = requests.Session(); r = x.post(A+"/entrar", json={"email": e, "senha": s}); x.status = r.status_code; x.resp = r; return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026"); ana = sessao("ana@rawtech.com.br", "Ana-Ribeiro-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026"); car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
emails = lambda: len(open(EMAILS, encoding="utf-8").read().splitlines())
# ── lista e permissões ──
L = adm.get(A+"/empresa/usuarios").json(); U = {x["nome"]: x for x in L["usuarios"]}
check("Lista: usuários com perfil, cargo e último acesso; 'você' marcado", {"Wendell Xavier", "Ana Ribeiro", "Bruno Costa", "Carla Mendes"} <= set(U) and U["Wendell Xavier"]["eu"] and U["Ana Ribeiro"]["perfil"] == "gestor" and U["Carla Mendes"]["ultimo_acesso"])
check("Indicadores: escritório (2 de 5 no teste), campo, convites", L["indicadores"]["escritorio"] == 2 and L["plano"]["escritorio"] == 5 and L["indicadores"]["campo"] == 2 and L["indicadores"]["convites"] == 0, L["indicadores"])
gl = ana.get(A+"/empresa/usuarios")
check("Gestora vê a lista, sem poder editar", gl.status_code == 200 and gl.json()["pode_editar"] is False)
check("Gestora não convida, não muda perfil, não desativa", ana.post(A+"/convites", json={"nome": "X", "perfil": "funcionario", "canal": "email", "email": "x@x.com"}).status_code == 403
      and ana.patch(A+f"/usuarios/{U['Bruno Costa']['id']}", json={"perfil": "gestor"}).status_code == 403 and ana.post(A+f"/usuarios/{U['Carla Mendes']['id']}/desativar").status_code == 403)
check("Encarregado e funcionário não entram na tela", enc.get(A+"/empresa/usuarios").status_code == 403 and car.get(A+"/empresa").status_code == 403)
# ── convite por e-mail ──
check("E-mail obrigatório no convite por e-mail", adm.post(A+"/convites", json={"nome": "Diego", "perfil": "funcionario", "canal": "email"}).status_code == 400)
check("E-mail já cadastrado recusado", adm.post(A+"/convites", json={"nome": "Ana", "perfil": "gestor", "canal": "email", "email": "ana@rawtech.com.br"}).status_code == 409)
n0 = emails(); r = adm.post(A+"/convites", json={"nome": "Diego Souza", "perfil": "funcionario", "canal": "email", "email": "diego@rawtech.com.br"})
check("Convite por e-mail enviado", r.status_code == 200 and r.json()["canal"] == "email" and "link" not in r.json() and emails() == n0 + 1)
tk = token("diego@rawtech.com.br", "convite")
info = requests.get(A+"/convites/info", params={"token": tk}).json()
check("Página do convite: nome, empresa, perfil e com o que vai entrar", info["nome"] == "Diego Souza" and info["empresa"] == "Rawtech Engenharia" and info["entrar_com"] == "diego@rawtech.com.br" and not info["por_telefone"], info)
# ── convite pelo WhatsApp, entrar com o celular ──
check("WhatsApp sem e-mail e sem celular: recusado", adm.post(A+"/convites", json={"nome": "Marcos", "perfil": "encarregado", "canal": "whatsapp"}).status_code == 400)
check("Celular inválido recusado", adm.post(A+"/convites", json={"nome": "Marcos", "perfil": "encarregado", "canal": "whatsapp", "telefone": "1234"}).status_code == 400)
r = adm.post(A+"/convites", json={"nome": "Marcos Silva", "perfil": "encarregado", "canal": "whatsapp", "telefone": "(81) 99876-5432"}); W = r.json()
check("Link para WhatsApp: link, mensagem pronta e wa.me com o número", r.status_code == 200 and "convite=" in W["link"] and W["whatsapp"].startswith("https://wa.me/5581998765432?text=")
      and "Marcos" in W["mensagem"] and "(81) 99876-5432" in W["mensagem"] and "encarregado" in W["mensagem"], W)
tw = W["link"].split("convite=")[1]
info = requests.get(A+"/convites/info", params={"token": tw}).json()
check("Convite sem e-mail: vai entrar com o celular", info["por_telefone"] and info["entrar_com"] == "(81) 99876-5432")
L = adm.get(A+"/empresa/usuarios").json(); C = {c["nome"]: c for c in L["convites"]}
check("Convites em aberto na lista (canal e celular)", C["Marcos Silva"]["canal"] == "whatsapp" and C["Marcos Silva"]["telefone"] == "(81) 99876-5432" and C["Diego Souza"]["canal"] == "email" and L["indicadores"]["convites"] == 2)
check("Celular repetido em outro convite substitui o anterior", adm.post(A+"/convites", json={"nome": "Marcos Silva", "perfil": "encarregado", "canal": "whatsapp", "telefone": "81998765432"}).status_code == 200
      and len([c for c in adm.get(A+"/empresa/usuarios").json()["convites"] if c["nome"] == "Marcos Silva"]) == 1 and requests.get(A+"/convites/info", params={"token": tw}).status_code == 400)
cid = [c for c in adm.get(A+"/empresa/usuarios").json()["convites"] if c["nome"] == "Marcos Silva"][0]["id"]
r = adm.post(A+f"/convites/{cid}/reenviar"); tw2 = r.json()["link"].split("convite=")[1]
check("Reenviar: link novo", r.status_code == 200 and requests.get(A+"/convites/info", params={"token": tw2}).status_code == 200)
check("Trocar o perfil do convite", adm.patch(A+f"/convites/{cid}", json={"perfil": "funcionario"}).status_code == 200 and requests.get(A+"/convites/info", params={"token": tw2}).json()["perfil"] == "Funcionário")
m = requests.Session(); r = m.post(A+"/convites/aceitar", json={"token": tw2, "senha": "Marcos-Silva-2026"})
check("Aceitar o convite: entra direto", r.status_code == 200 and r.json()["usuario"]["telefone"] == "81998765432" and r.json()["usuario"]["email"] is None)
for login in ["(81) 99876-5432", "81998765432", "+55 81 99876-5432"]:
    check(f"Entrar com o celular: {login}", requests.post(A+"/entrar", json={"email": login, "senha": "Marcos-Silva-2026"}).status_code == 200)
check("Senha errada pelo celular: mesma mensagem genérica", requests.post(A+"/entrar", json={"email": "81998765432", "senha": "errada-123"}).json()["erro"].startswith("E-mail (ou celular) ou senha incorretos"))
check("Convite já usado não serve de novo", requests.post(A+"/convites/aceitar", json={"token": tw2, "senha": "Outra-Senha-2026"}).status_code == 400)
check("Celular de usuário existente recusado em novo convite", adm.post(A+"/convites", json={"nome": "X", "perfil": "funcionario", "canal": "whatsapp", "telefone": "81998765432"}).status_code == 409)
did = [c for c in adm.get(A+"/empresa/usuarios").json()["convites"] if c["nome"] == "Diego Souza"][0]["id"]
check("Cancelar convite: link deixa de valer", adm.delete(A+f"/convites/{did}").status_code == 200 and requests.get(A+"/convites/info", params={"token": tk}).status_code == 400)
# ficha da Equipe
fid = int(q("INSERT INTO funcionarios (empresa_id, nome, cargo, telefone) VALUES (1, 'Pedro Lima', 'Ajudante', '81991234567'); SELECT LAST_INSERT_ID();"))
L = adm.get(A+"/empresa/usuarios").json()
check("Fichas da Equipe sem acesso aparecem para ligar", any(x["id"] == fid and x["telefone"] == "(81) 99123-4567" for x in L["fichas"]))
r = adm.post(A+"/convites", json={"nome": "Pedro Lima", "perfil": "funcionario", "canal": "whatsapp", "telefone": "81991234567", "funcionario_id": fid})
check("Convite ligado à ficha some das fichas livres", r.status_code == 200 and not any(x["id"] == fid for x in adm.get(A+"/empresa/usuarios").json()["fichas"]))
# ── perfil, limite do plano, desativar ──
U = {x["nome"]: x for x in adm.get(A+"/empresa/usuarios").json()["usuarios"]}
check("Não muda o próprio perfil", adm.patch(A+f"/usuarios/{U['Wendell Xavier']['id']}", json={"perfil": "gestor"}).status_code == 400)
check("Perfil inválido recusado", adm.patch(A+f"/usuarios/{U['Bruno Costa']['id']}", json={"perfil": "dono"}).status_code == 400)
q("UPDATE empresas SET plano = 'essencial' WHERE id = 1")
r = adm.patch(A+f"/usuarios/{U['Bruno Costa']['id']}", json={"perfil": "gestor"})
check("Plano Essencial (2 no escritório): promover a gestor é barrado com o motivo", r.status_code == 409 and "Essencial" in r.json()["erro"], r.text)
check("Convite de gestor também barrado no limite", adm.post(A+"/convites", json={"nome": "Novo Gestor", "perfil": "gestor", "canal": "email", "email": "novo@rawtech.com.br"}).status_code == 409)
check("Mercurium muda o plano no painel", adm.patch(A+"/painel/empresas/1", json={"plano": "profissional"}).status_code == 200 and adm.get(A+"/empresa").json()["plano"] == "Profissional"
      and adm.patch(A+"/painel/empresas/1", json={"plano": "ouro"}).status_code == 400 and ana.patch(A+"/painel/empresas/1", json={"plano": "empresa"}).status_code == 403)
check("Com vaga: promove a gestor e volta", adm.patch(A+f"/usuarios/{U['Bruno Costa']['id']}", json={"perfil": "gestor"}).status_code == 200 and enc.get(A+"/empresa/usuarios").status_code == 200
      and adm.patch(A+f"/usuarios/{U['Bruno Costa']['id']}", json={"perfil": "encarregado"}).status_code == 200)
check("Não desativa a si mesmo", adm.post(A+f"/usuarios/{U['Wendell Xavier']['id']}/desativar").status_code == 400)
cid_ = U["Carla Mendes"]["id"]
check("Desativar a Carla: a sessão dela cai na hora", adm.post(A+f"/usuarios/{cid_}/desativar").status_code == 200 and car.get(A+"/minhas-atividades").status_code == 401)
r = requests.post(A+"/entrar", json={"email": "carla@rawtech.com.br", "senha": "Carla-Mendes-2026"})
check("Desativada não entra (mensagem clara)", r.status_code == 403 and "desativado" in r.json()["erro"])
L = adm.get(A+"/empresa/usuarios").json(); X = [x for x in L["usuarios"] if x["nome"] == "Carla Mendes"][0]
check("Lista: desativada com a data, fora do campo", X["situacao"] == "desativado" and X["desativado_em"] and L["indicadores"]["desativados"] == 1)
check("O nome dela continua nos avanços (RDO montado)", "Carla Mendes" in json.dumps(adm.get(A+f"/rdos/{rd['rasc']}").json(), ensure_ascii=False) or q(f"SELECT COUNT(*) FROM avancos WHERE usuario_id = {cid_}") != "0")
check("Esqueci a senha não manda link para desativada", (lambda n: requests.post(A+"/esqueci-senha", json={"email": "carla@rawtech.com.br"}).status_code == 200 and emails() == n)(emails()))
check("Reativar: volta a entrar", adm.post(A+f"/usuarios/{cid_}/reativar").status_code == 200 and requests.post(A+"/entrar", json={"email": "carla@rawtech.com.br", "senha": "Carla-Mendes-2026"}).status_code == 200)
mid = [x for x in adm.get(A+"/empresa/usuarios").json()["usuarios"] if x["nome"] == "Marcos Silva"][0]["id"]
r = adm.post(A+f"/usuarios/{mid}/link-senha"); ls = r.json()
check("Link de nova senha (24 h) para mandar pelo WhatsApp", r.status_code == 200 and "redefinir=" in ls["link"] and ls["whatsapp"].startswith("https://wa.me/5581998765432"))
check("Nova senha pelo link e entra com ela", requests.post(A+"/redefinir-senha", json={"token": ls["link"].split("redefinir=")[1], "senha": "Marcos-Nova-2026"}).status_code == 200
      and requests.post(A+"/entrar", json={"email": "81998765432", "senha": "Marcos-Nova-2026"}).status_code == 200)
# ── dados da empresa ──
check("CNPJ com menos de 14 números recusado", adm.patch(A+"/empresa", json={"cnpj": "123"}).status_code == 400)
check("E-mail de contato inválido recusado", adm.patch(A+"/empresa", json={"email_contato": "contato@"}).status_code == 400)
check("Nome em branco recusado", adm.patch(A+"/empresa", json={"nome": " "}).status_code == 400)
r = adm.patch(A+"/empresa", json={"razao_social": "Rawtech Instalações Ltda", "cnpj": "11.222.333/0001-81", "telefone": "(81) 3333-0000", "endereco": "Av. Recife, 1200", "cidade": "Recife", "uf": "pe", "email_contato": "contato@rawtech.com.br", "site": "rawtech.com.br"})
E = r.json()["empresa"]
check("Salvar dados da empresa (CNPJ formatado, UF maiúscula)", r.status_code == 200 and E["cnpj"] == "11.222.333/0001-81" and E["uf"] == "PE" and E["endereco"] == "Av. Recife, 1200")
check("Cabeçalho dos documentos já usa os dados novos", adm.get(A+"/empresa/cabecalho").json().get("razao_social") == "Rawtech Instalações Ltda")
check("Gestora não altera os dados", ana.patch(A+"/empresa", json={"nome": "Outra"}).status_code == 403)
# ── regras do campo ──
check("Regras padrão: foto do funcionário, Travou por e-mail, prazo 1 dia, assinatura", adm.get(A+"/empresa").json()["regras"] == {"foto": "funcionario", "comentario_concluir": False, "travou_email": True, "rdo_prazo": 1, "rdo_lembrete": True, "rdo_assinatura": True})
check("Opção inválida recusada", adm.put(A+"/empresa/regras", json={"foto": "chefe"}).status_code == 400 and adm.put(A+"/empresa/regras", json={"rdo_prazo": 9}).status_code == 400)
car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
adm.put(A+"/empresa/regras", json={"foto": "campo"})
check("Foto 'funcionário e encarregado': encarregado sem foto é barrado", enc.post(A+f"/atividades/{ids['a21']}/avanco", json={"avanco": 75}).status_code == 400 and enc.get(A+"/minhas-atividades").json()["foto_obrigatoria"])
adm.put(A+"/empresa/regras", json={"foto": "ninguem"})
check("Foto 'ninguém': funcionária salva sem foto", car.post(A+f"/atividades/{ids['a22']}/avanco", json={"avanco": 45}).status_code == 200 and not car.get(A+"/minhas-atividades").json()["foto_obrigatoria"])
adm.put(A+"/empresa/regras", json={"foto": "funcionario", "comentario_concluir": True})
check("Comentário obrigatório para concluir", enc.post(A+f"/atividades/{ids['a21']}/avanco", json={"avanco": 100}).status_code == 400
      and enc.post(A+f"/atividades/{ids['a21']}/avanco", json={"avanco": 100, "comentario": "Base entregue"}).status_code == 200 and car.get(A+"/minhas-atividades").json()["comentario_concluir"])
adm.put(A+"/empresa/regras", json={"comentario_concluir": False, "travou_email": False})
n0 = emails(); r = car.post(A+f"/atividades/{ids['a23']}/impedimento", json={"motivo": "material", "descricao": "Falta cabo"})
check("Travou sem e-mail: só o aviso no sistema", r.status_code == 200 and r.json()["avisados"] and emails() == n0)
P1 = adm.get(A+"/rdos").json()["pendencias"]; adm.put(A+"/empresa/regras", json={"rdo_prazo": 3, "rdo_assinatura": False}); P3 = adm.get(A+"/rdos").json()["pendencias"]
check("Prazo de 3 dias: dias recentes sem RDO deixam de ser pendência", len([p for p in P3 if p["tipo"] == "sem"]) < len([p for p in P1 if p["tipo"] == "sem"]), (len(P1), len(P3)))
check("Sem assinatura obrigatória: entregue sai das pendências", any(p["tipo"] == "entr" for p in P1) and not any(p["tipo"] == "entr" for p in P3))
dias = adm.get(A+f"/rdos?obra={pid}").json()["dias"]
check("Calendário do RDO: dia recente aparece 'no prazo'", any(x["estado"] == "prazo" for x in dias) or hoje.weekday() == 0)
adm.put(A+"/empresa/regras", json={"rdo_prazo": 1, "rdo_assinatura": True, "travou_email": True})
check("Encarregado recebe o RDO de hoje e o lembrete", enc.get(A+"/minhas-atividades").json()["rdo_lembrete"] is True and car.get(A+"/minhas-atividades").json()["rdo_lembrete"] is False)
# ── calendário padrão ──
C = adm.get(A+"/empresa/calendario").json()
check("Calendário padrão: seg a sex 8 h, feriados nacionais, usado pelas obras", C["horas_semana"] == [8, 8, 8, 8, 8, 0, 0] and C["feriados_nacionais"] and C["obras"] >= 2 and f"{C['ano']}-12-25" in C["nacionais"])
check("Dias inválidos recusados sem gravar nada", adm.put(A+"/empresa/calendario", json={"horas_semana": [8]*5 + [0, 0], "dias": [{"inicio": D(3), "nome": ""}]}).status_code == 400 and adm.get(A+"/empresa/calendario").json()["dias"] == [])
check("Semana sem nenhum dia de trabalho recusada", adm.put(A+"/empresa/calendario", json={"horas_semana": [0]*7}).status_code == 400)
novo = {"horas_semana": [8, 8, 8, 8, 8, 8, 0], "feriados_nacionais": True, "dias": [{"inicio": "2026-06-24", "fim": "2026-06-24", "nome": "São João", "tipo": "feriado", "todo_ano": True}]}
s = adm.put(A+"/empresa/calendario", json={**novo, "simular": True}).json()
check("Simular: quantas atividades não iniciadas mudam (sem gravar)", s["mudam"] > 0 and s["obras"] >= 1 and adm.get(A+"/empresa/calendario").json()["horas_semana"][5] == 0, s)
fim_antes = q(f"SELECT fim FROM atividades WHERE id = {ids['e1']}")
r = adm.put(A+"/empresa/calendario", json=novo).json()
check("Salvar: sábado entra e as não iniciadas são recalculadas", r["ok"] and r["mudaram"] == s["mudam"] and q(f"SELECT fim FROM atividades WHERE id = {ids['e1']}") < fim_antes)
C = adm.get(A+"/empresa/calendario").json()
check("Calendário salvo com o feriado de todo ano", C["horas_semana"][5] == 8 and C["dias"][0]["nome"] == "São João" and C["dias"][0]["todo_ano"])
check("Gestora não altera o calendário padrão", ana.put(A+"/empresa/calendario", json=novo).status_code == 403)
# ── plano ──
P = adm.get(A+"/empresa/plano").json()
check("Plano: nome, preço, uso de obras, escritório, campo e espaço", P["plano"]["nome"] == "Profissional" and P["plano"]["preco"] == 697 and P["uso"]["obras"][1] == 10 and P["uso"]["escritorio"][1] == 5
      and P["uso"]["campo"][0] >= 2 and P["uso"]["espaco_gb"][0] > 0 and len(P["planos"]) == 5)
# ── isolamento ──
o = requests.Session()
o.post(A+"/cadastro", json={"empresa": {"nome": "Outra Usuários"}, "admin": {"nome": "Outro Admin", "email": "emp@outra.test", "senha": "senha-forte-1"}, "equipe": []})
o.post(A+"/confirmar-email", json={"token": token("emp@outra.test", "confirmar")}); o.post(A+"/entrar", json={"email": "emp@outra.test", "senha": "senha-forte-1"})
check("Outra empresa não vê nem mexe nos usuários e convites daqui", [x["nome"] for x in o.get(A+"/empresa/usuarios").json()["usuarios"]] == ["Outro Admin"]
      and o.patch(A+f"/usuarios/{U['Bruno Costa']['id']}", json={"perfil": "gestor"}).status_code == 404 and o.post(A+f"/usuarios/{U['Bruno Costa']['id']}/desativar").status_code == 404
      and o.delete(A+f"/convites/{cid}").status_code == 404 and o.post(A+f"/usuarios/{mid}/link-senha").status_code == 404)
check("Outra empresa tem o próprio calendário e regras", o.get(A+"/empresa/calendario").json()["horas_semana"][5] == 0 and o.get(A+"/empresa").json()["regras"]["foto"] == "funcionario")
print(f"RESULTADO: {ok} ok, {f} falhas"); sys.exit(1 if f else 0)
