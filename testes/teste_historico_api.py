"""Histórico e Importar (servidor): linha do tempo em português (avanço, Travou, cronograma com antes → depois, RDO, recursos,
equipe, usuários e empresa), filtros (obra, pessoa, tipo, período, busca), páginas, ranking, Excel, limite do plano,
encarregado só nas obras dele, funcionário fora, isolamento; importar MS Project e Excel (prévia com responsáveis achados,
obra nova com as datas do arquivo, obra existente acrescentando e substituindo), modelo, lista de importações."""
import sys, io, json, base64, subprocess, datetime as dt, requests, openpyxl, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, "/home/claude/telas"); from dados_rdo import montar, foto
from comum import token
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
    x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026"); ana = sessao("ana@rawtech.com.br", "Ana-Ribeiro-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026"); car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
fid_bruno = int(q("SELECT id FROM funcionarios WHERE nome = 'Bruno Costa'"))
adm.patch(A+f"/atividades/{ids['e2']}", json={"inicio": D(20), "responsavel_id": fid_bruno})
adm.post(A+"/convites", json={"nome": "Marcos Silva", "perfil": "encarregado", "canal": "whatsapp", "telefone": "81998765432"})
H = adm.get(A+"/historico").json(); T = [i["texto"] for i in H["itens"]]
check("Funcionário não vê o histórico", car.get(A+"/historico").status_code == 403)
check("Linha do tempo: total, pessoas, ranking, plano e limite", H["total"] >= 20 and H["pessoas_no_periodo"] >= 3 and H["ranking"][0]["nome"] == "Wendell Xavier" and H["limite_dias"] == 365 and H["plano"] == "Teste grátis")
check("Avanço com foto em português", any(t == "atualizou “Eletrodutos e caixas de passagem” de 30% para 40%" for t in T) and any(i["sub"] == "com 2 fotos" for i in H["itens"]), T[:20])
check("Travou com o motivo", any("travou: Chuva / tempo" in t for t in T))
m = [i for i in H["itens"] if i["texto"] == "mudou “Montagem do transformador 1”"][0]; Dt = {x["campo"]: x for x in m["detalhes"]}
check("Cronograma: antes → depois com nomes e datas", Dt["Responsável"]["depois"] == "Bruno Costa" and Dt["Início"]["antes"] and Dt["Início"]["depois"] == f"{D(20)[8:10]}/{D(20)[5:7]}" and m["obra"]["codigo"] == "ELE-014", m)
check("Link da atividade para abrir a obra no ponto", m["link"] == {"tipo": "atividade", "id": ids["e2"], "obra_id": pid})
check("RDO: fechou com o código, entregou, folha assinada", any(t.startswith("fechou o RDO nº") for t in T) and any("ao cliente" in t for t in T) and any(t.startswith("anexou a folha assinada") for t in T))
check("Recursos e usuários em português", any(t.startswith("mudou os recursos de") for t in T) and "convidou Marcos Silva como encarregado" in T and "trocou a logo da empresa" in T)
check("Login não aparece (é ruído)", not any("entrou" == i["texto"] for i in H["itens"]))
# filtros
def H_(**p): return adm.get(A+"/historico", params=p).json()
check("Filtro por obra", all((i["obra"] or {}).get("codigo") == "NR12-007" for i in H_(obra=p2)["itens"]) and H_(obra=p2)["total"] > 0)
check("Filtro por pessoa", {i["usuario"] for i in H_(pessoa=int(q("SELECT id FROM usuarios WHERE nome='Carla Mendes'")))["itens"]} == {"Carla Mendes"})
check("Filtro por tipo: avanços e Travou", {i["tipo"] for i in H_(tipo="av")["itens"]} == {"av"} and H_(tipo="rdo")["total"] >= 8 and all(i["tipo"] == "usu" for i in H_(tipo="usu")["itens"]))
check("Busca por nome da atividade", H_(q="Malha")["total"] >= 1 and all("Malha" in json.dumps(i, ensure_ascii=False) for i in H_(q="Malha")["itens"]))
check("Período: amanhã em diante vem vazio", H_(de=D(1))["total"] == 0 and H_(de=D(0))["total"] == H["total"])
q("UPDATE historico SET quando = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 45 DAY) WHERE tabela = 'convites'")
q("UPDATE empresas SET plano = 'essencial' WHERE id = 1")
H2 = adm.get(A+"/historico").json()
check("Plano Essencial: só os últimos 30 dias (o antigo fica guardado)", H2["limite_dias"] == 30 and not any("convidou" in i["texto"] for i in H2["itens"]) and q("SELECT COUNT(*) FROM historico WHERE tabela='convites'") != "0")
check("Pedir antes do limite não fura o plano", not any("convidou" in i["texto"] for i in H_(de=D(-60))["itens"]))
q("UPDATE empresas SET plano = 'empresa' WHERE id = 1")
check("Plano Empresa: tudo", adm.get(A+"/historico").json()["limite_dias"] is None and any("convidou" in i["texto"] for i in H_(tipo="usu")["itens"]))
# páginas
for k in range(70): q(f"INSERT INTO historico (empresa_id, usuario_id, tabela, registro_id, acao, antes, depois) VALUES (1, 1, 'atividades', {ids['a13']}, 'alterou', '{{\"peso\":1}}', '{{\"peso\":{k+2}}}')")
P1 = adm.get(A+"/historico").json(); P2 = adm.get(A+"/historico", params={"pagina": 2}).json()
check("Páginas de 60 com 'mostrar mais'", len(P1["itens"]) == 60 and P1["mais"] and P2["itens"] and not {i["id"] for i in P1["itens"]} & {i["id"] for i in P2["itens"]})
x = adm.get(A+"/historico/excel", params={"tipo": "rdo"}); wb = openpyxl.load_workbook(io.BytesIO(x.content)); ws = wb.active
check("Excel com o que está filtrado", x.status_code == 200 and ws["A1"].value == "Quando" and ws.max_row - 1 == H_(tipo="rdo")["total"] and all("RDO" in (ws.cell(r, 5).value or "") for r in range(2, ws.max_row + 1)))
# encarregado
E = enc.get(A+"/historico").json()
check("Encarregado: só as obras dele, sem usuários/empresa e sem filtro de pessoa", E["total"] > 0 and all((i["obra"] or {}).get("codigo") == "ELE-014" for i in E["itens"]) and E["pessoas"] == [] and not any(i["tipo"] == "usu" for i in E["itens"]))
check("Encarregado não pede obra dos outros", enc.get(A+"/historico", params={"obra": p2}).json()["total"] == 0)
# ── importar ──
xml = adm.get(A+f"/obras/{pid}/exportar?formato=mspdi").text
check("Exportar MS Project leva os responsáveis como recursos", "<Assignments>" in xml and "Bruno Costa" in xml)
pv = adm.post(A+"/importar/previa", json={"formato": "mspdi", "conteudo": xml, "arquivo": "ELE-014.xml"}).json()
check("Prévia do MS Project: atividades, etapas, ligações, nome e início do projeto", pv["atividades"] >= 15 and pv["etapas"] >= 3 and pv["ligacoes"] >= 8 and pv["info"]["nome"].startswith("ELE-014") and pv["info"]["inicio"])
check("Prévia: responsáveis achados na Equipe", pv["responsaveis"]["total"] >= 2 and pv["responsaveis"]["achados"] == pv["responsaveis"]["total"] and any(l["responsavel"] == "Bruno Costa" and l["achado"] for l in pv["linhas"]))
xml2 = xml.replace("<Name>Ana Ribeiro</Name>", "<Name>J. Paulo</Name>")
pv2 = adm.post(A+"/importar/previa", json={"formato": "mspdi", "conteudo": xml2}).json()
check("Nome que não está na Equipe aparece como não encontrado", any(x["nome"] == "J. Paulo" and not x["achado"] for x in pv2["responsaveis"]["lista"]) and pv2["responsaveis"]["achados"] < pv2["responsaveis"]["total"])
check("Arquivo inválido: mensagem clara", "XML" in adm.post(A+"/importar/previa", json={"formato": "mspdi", "conteudo": "<x/>"}).json()["erro"] and adm.post(A+"/importar/previa", json={"formato": "doc", "conteudo": "x"}).status_code == 400)
check("Gestora importa; encarregado não", ana.post(A+"/importar/previa", json={"formato": "mspdi", "conteudo": xml}).status_code == 200 and enc.post(A+"/importar/previa", json={"formato": "mspdi", "conteudo": xml}).status_code == 403)
check("Obra nova sem nome recusada; código repetido recusado", adm.post(A+"/importar/obra", json={"formato": "mspdi", "conteudo": xml, "destino": "nova", "obra": {"nome": " "}}).status_code == 400
      and adm.post(A+"/importar/obra", json={"formato": "mspdi", "conteudo": xml, "destino": "nova", "obra": {"nome": "X", "codigo": "ELE-014"}}).status_code == 409)
ini = "2027-03-01"
r = adm.post(A+"/importar/obra", json={"formato": "mspdi", "conteudo": xml2, "arquivo": "Subestacao.xml", "destino": "nova", "obra": {"codigo": "SUB-015", "nome": "Subestação Galpão 5", "cliente": "Metalúrgica Nordeste", "inicio": ini}}).json()
np_ = r["projeto_id"]; C = adm.get(A+f"/obras/{np_}/cronograma").json()
check("Obra nova criada com o cronograma do arquivo", r["ok"] and r["nova"] and r["atividades"] == pv["atividades"] and r["ligacoes"] >= 8 and len(C["atividades"]) == pv["atividades"])
pr = q(f"SELECT CONCAT_WS('|', codigo, nome, cliente, inicio, fim, situacao, gestor_id) FROM projetos WHERE id = {np_}").split("|")
check("Obra nova: código, cliente, início pedido, fim calculado e em planejamento", pr[0] == "SUB-015" and pr[2] == "Metalúrgica Nordeste" and pr[3] >= ini and pr[4] > pr[3] and pr[5] == "Planejamento" and pr[6] == "1", pr)
check("Datas deslocadas juntas para o novo início", min(a["inicio"] for a in C["atividades"] if a["inicio"]) >= ini)
check("Responsáveis ligados; quem não está na Equipe fica sem", any(a.get("responsavel_nome") == "Bruno Costa" or a.get("responsavel_id") == fid_bruno for a in C["atividades"]) and q(f"SELECT COUNT(*) FROM atividades WHERE projeto_id = {np_} AND responsavel_id = (SELECT id FROM funcionarios WHERE nome = 'Ana Ribeiro')") == "0")
# planilha → obra existente
xb = base64.b64encode(adm.get(A+f"/obras/{p2}/exportar?formato=xlsx").content).decode()
antes = int(q(f"SELECT COUNT(*) FROM atividades WHERE projeto_id = {np_} AND excluido_em IS NULL"))
r2 = adm.post(A+"/importar/obra", json={"formato": "xlsx", "conteudo": xb, "arquivo": "NR12.xlsx", "destino": "existente", "projeto_id": np_, "substituir": False}).json()
check("Excel: acrescenta numa obra existente", r2["ok"] and int(q(f"SELECT COUNT(*) FROM atividades WHERE projeto_id = {np_} AND excluido_em IS NULL")) == antes + r2["atividades"])
r3 = adm.post(A+"/importar/obra", json={"formato": "xlsx", "conteudo": xb, "arquivo": "NR12.xlsx", "destino": "existente", "projeto_id": np_, "substituir": True}).json()
check("Excel: substitui o cronograma", r3["ok"] and int(q(f"SELECT COUNT(*) FROM atividades WHERE projeto_id = {np_} AND excluido_em IS NULL")) == r3["atividades"])
csv = "Atividade;Duração;Início;Responsável;Predecessoras\nMobilização;2;02/03/2027;Bruno Costa;\nMontagem;5;;Carla Mendes;1\nEntrega;1;;;2\n"
r4 = adm.post(A+"/importar/previa", json={"formato": "csv", "conteudo": csv}).json()
check("CSV do Excel (ponto e vírgula, data brasileira)", r4["atividades"] == 3 and r4["ligacoes"] == 2 and r4["responsaveis"]["achados"] == 2 and r4["linhas"][0]["inicio"] == "2027-03-02")
check("CSV em Windows-1252 (acentos) lido certo", adm.post(A+"/importar/previa", json={"formato": "csv", "conteudo": "Atividade;Duração\nMobilização;2\n".encode("cp1252").decode("latin-1")}).json()["linhas"][0]["descricao"] == "Mobilização")
L = adm.get(A+"/importacoes").json()
check("Lista de importações: arquivo, destino, quem", [x["destino"] for x in L["importacoes"][:3]] == ["substituiu", "acrescentou", "nova"] and L["importacoes"][2]["arquivo"] == "Subestacao.xml" and L["importacoes"][0]["usuario"] == "Wendell Xavier")
check("Histórico mostra a importação", any("importou o cronograma da obra" in i["texto"] and "Subestacao.xml" in i["sub"] for i in adm.get(A+"/historico", params={"obra": np_}).json()["itens"]))
m = adm.get(A+"/importar/modelo"); wm = openpyxl.load_workbook(io.BytesIO(m.content)).active
check("Planilha modelo com as colunas certas e que importa", [c.value for c in wm[1]][:6] == ["EAP", "Atividade", "Duração (dias úteis)", "Início", "Responsável", "Predecessoras"]
      and adm.post(A+"/importar/previa", json={"formato": "xlsx", "conteudo": base64.b64encode(m.content).decode()}).json()["etapas"] == 3)
# isolamento
o = requests.Session()
o.post(A+"/cadastro", json={"empresa": {"nome": "Outra Histórico"}, "admin": {"nome": "Outro Admin", "email": "hist@outra.test", "senha": "senha-forte-1"}, "equipe": []})
o.post(A+"/confirmar-email", json={"token": token("hist@outra.test", "confirmar")}); o.post(A+"/entrar", json={"email": "hist@outra.test", "senha": "senha-forte-1"})
Ho = o.get(A+"/historico").json()
check("Outra empresa só vê o próprio histórico", all(i["usuario"] in ("Outro Admin", "Sistema") for i in Ho["itens"]) and o.get(A+"/historico", params={"obra": pid}).json()["total"] == 0)
check("Outra empresa não importa em obra alheia", o.post(A+"/importar/obra", json={"formato": "csv", "conteudo": csv, "destino": "existente", "projeto_id": pid}).status_code == 404 and o.get(A+"/importacoes").json()["importacoes"] == [])
print(f"RESULTADO: {ok} ok, {f} falhas"); sys.exit(1 if f else 0)
