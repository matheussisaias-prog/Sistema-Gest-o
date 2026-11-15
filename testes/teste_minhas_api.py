"""Minhas atividades (servidor): lista por grupos, avanço com foto (obrigatória para funcionário), Travou com aviso ao gestor, liberar, fotos protegidas, envio repetido sem duplicar."""
import sys, io, json, base64, requests
sys.path.insert(0, "/home/claude/telas"); from dados_crono import criar
from PIL import Image
A = "http://127.0.0.1:8900/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
def foto(cor=(90, 110, 140), w=1200, h=900):
    b = io.BytesIO(); Image.new("RGB", (w, h), cor).save(b, "JPEG", quality=80); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
pid, ids = criar()
def sessao(e, s):
    x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026")
ana = sessao("ana@rawtech.com.br", "Ana-Ribeiro-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026")
car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
emails = "/home/claude/teste-api/emails.jsonl"
n_emails = lambda: sum(1 for _ in open(emails, encoding="utf-8"))

# ── lista ──
m = car.get(A+"/minhas-atividades").json()
todas = [a for g in m["grupos"].values() for a in g]
check("Funcionária: só as atividades dela", todas and all(a["responsavel_nome"] == "Carla Mendes" for a in todas), [a["responsavel_nome"] for a in todas])
check("Funcionária: foto obrigatória e sem 'Da minha equipe'", m["foto_obrigatoria"] is True and m["pode_equipe"] is False and m["ver"] == "minhas")
check("Funcionária não vê a equipe mesmo pedindo", car.get(A+"/minhas-atividades?ver=equipe").json()["ver"] == "minhas")
check("Grupos: atrasadas, hoje, semana, próximas, concluídas", set(m["grupos"]) == {"atrasadas", "hoje", "semana", "proximas", "concluidas"})
check("Resumo bate com os grupos", m["resumo"]["hoje"] == len(m["grupos"]["hoje"]) and m["resumo"]["atrasadas"] == len(m["grupos"]["atrasadas"]))
check("Motivos do Travou", [x["id"] for x in m["motivos"]] == ["material", "liberacao", "clima", "equipamento", "outro"])
e = enc.get(A+"/minhas-atividades?ver=equipe").json()
ee = [a for g in e["grupos"].values() for a in g]
check("Encarregado: 'Da minha equipe' traz as de todos da obra", {a["responsavel_nome"] for a in ee} >= {"Carla Mendes", "Bruno Costa"} and e["obras_encarregado"] == ["ELE-014"])
em = enc.get(A+"/minhas-atividades").json()
check("Encarregado: 'Minhas' só as dele", all(a["responsavel_nome"] == "Bruno Costa" for g in em["grupos"].values() for a in g))
w = adm.get(A+"/minhas-atividades").json()
check("Administrador sem ficha de funcionário começa pela equipe", w["ver"] == "equipe" and w["tem_ficha"] is False)
check("Filtro por obra", all(a["projeto_id"] == pid for g in adm.get(A+f"/minhas-atividades?obra={pid}").json()["grupos"].values() for a in g))
check("Etapas não aparecem (só atividades de verdade)", not any(a["descricao"] in ("Mobilização", "Infraestrutura") for a in ee))

# ── avanço ──
a22 = ids["a22"]        # Eletrodutos (Carla)
r = car.patch(A+f"/atividades/{a22}", json={"avanco": 50})
check("Funcionária não muda avanço pela via antiga (sem foto)", r.status_code == 403 and "foto" in r.json()["erro"], r.text)
r = car.post(A+f"/atividades/{a22}/avanco", json={"avanco": 50})
check("Funcionária sem foto: recusado com mensagem", r.status_code == 400 and "foto" in r.json()["erro"].lower())
r = car.post(A+f"/atividades/{a22}/avanco", json={"avanco": 50, "comentario": "Trecho A pronto", "id_local": "cel-abc-1",
     "fotos": [{"dados": foto(), "tirada_em": "2026-11-16T10:42:00Z", "latitude": -8.05, "longitude": -34.9}]})
check("Funcionária com foto: avanço salvo", r.status_code == 200 and r.json()["avanco"] == 50 and r.json()["fotos"] == 1, r.text)
r2 = car.post(A+f"/atividades/{a22}/avanco", json={"avanco": 50, "id_local": "cel-abc-1", "fotos": [{"dados": foto()}]})
check("Mesmo envio de novo (sem internet) não duplica", r2.json().get("repetido") is True)
fs = car.get(A+f"/atividades/{a22}/fotos").json()["fotos"]
check("A foto fica na atividade, com GPS, comentário e de → para", len(fs) == 1 and fs[0]["gps"] and fs[0]["de"] == 30 and fs[0]["para"] == 50 and fs[0]["comentario"] == "Trecho A pronto", fs)
img = car.get(A+f"/fotos/{fs[0]['id']}"); mini = car.get(A+f"/fotos/{fs[0]['id']}?mini=1")
check("Foto e miniatura servidas como imagem", img.status_code == 200 and img.headers["Content-Type"] == "image/jpeg" and mini.status_code == 200 and len(mini.content) < len(img.content))
check("Foto sem login: 401", requests.get(A+f"/fotos/{fs[0]['id']}").status_code == 401)
a31 = adm.get(A+f"/obras/{pid}/cronograma").json()["atividades"]; a_bruno = [x for x in a31 if x["responsavel_nome"] == "Bruno Costa" and not x["etapa"]][0]["id"]
r = car.post(A+f"/atividades/{a_bruno}/avanco", json={"avanco": 10, "fotos": [{"dados": foto()}]})
check("Funcionária não atualiza atividade de outra pessoa", r.status_code in (403, 404), r.status_code)
r = enc.post(A+f"/atividades/{a_bruno}/avanco", json={"avanco": 70})
check("Encarregado: avanço sem foto é aceito (foto opcional)", r.status_code == 200 and r.json()["situacao"] == "Em andamento")
r = enc.post(A+f"/atividades/{a22}/avanco", json={"avanco": 100, "fotos": [{"dados": foto((40, 160, 90))}]})
check("Concluir (100%) marca Concluído", r.json()["situacao"] == "Concluído")
c = car.get(A+"/minhas-atividades").json()
check("Concluída vai para 'Concluídas nos últimos 7 dias'", any(x["id"] == a22 for x in c["grupos"]["concluidas"]) and c["grupos"]["concluidas"][0]["ultimo"]["com_foto"])
r = car.post(A+f"/atividades/{a22}/avanco", json={"avanco": 40, "fotos": [{"dados": "data:image/jpeg;base64,bm9wZQ=="}]})
check("Arquivo que não é imagem: recusado", r.status_code == 400 and "JPG" in r.json()["erro"])
etapa = [x for x in a31 if x["etapa"]][0]["id"]
check("Etapa não recebe avanço direto", adm.post(A+f"/atividades/{etapa}/avanco", json={"avanco": 10}).status_code == 400)
check("Avanço fora de 0–100 é limitado", adm.post(A+f"/atividades/{a_bruno}/avanco", json={"avanco": 180}).json()["avanco"] == 100)

# ── travou ──
a23 = ids["a23"]        # Malha (Carla)
antes = n_emails()
r = car.post(A+f"/atividades/{a23}/impedimento", json={"motivo": "material", "descricao": "Faltam 40 caixas 4x4", "id_local": "cel-trav-1", "fotos": [{"dados": foto((200, 120, 40))}]})
check("Travou: registrado com foto", r.status_code == 200 and r.json()["fotos"] == 1, r.text)
check("Avisa o gestor da obra (Wendell)", r.json()["avisados"] == ["Wendell Xavier"])
ultimo = json.loads(open(emails, encoding="utf-8").read().splitlines()[-1])
check("E-mail ao gestor com motivo e o que falta", n_emails() == antes + 1 and ultimo["para"] == "wendell@rawtech.com.br" and "Travou: Malha de aterramento" in ultimo["assunto"] and "Faltam 40 caixas" in ultimo["texto"])
check("Repetir o envio não cria outro impedimento", car.post(A+f"/atividades/{a23}/impedimento", json={"motivo": "material", "id_local": "cel-trav-1"}).json().get("repetido") is True)
lst = car.get(A+"/minhas-atividades").json()
t = [x for g in lst["grupos"].values() for x in g if x["id"] == a23][0]["travada"]
check("A atividade aparece travada, com motivo e quem informou", t and t["tipo"] == "Falta de material" and "Faltam 40 caixas" in t["descricao"] and t["por"] == "Carla Mendes")
check("Resumo conta a travada", lst["resumo"]["travadas"] == 1)
check("'Outro' exige contar o que travou", car.post(A+f"/atividades/{a23}/impedimento", json={"motivo": "outro"}).status_code == 400)
check("Motivo inválido: recusado", car.post(A+f"/atividades/{a23}/impedimento", json={"motivo": "xyz"}).status_code == 400)
check("Funcionária não libera a trava", car.patch(A+f"/ocorrencias/{t['id']}/liberar", json={}).status_code == 403)
check("Encarregado libera", enc.patch(A+f"/ocorrencias/{t['id']}/liberar", json={}).status_code == 200)
check("Liberada: some a trava", not [x for g in car.get(A+"/minhas-atividades").json()["grupos"].values() for x in g if x["id"] == a23][0]["travada"])
print(f"RESULTADO: {ok} ok, {f} falhas")
