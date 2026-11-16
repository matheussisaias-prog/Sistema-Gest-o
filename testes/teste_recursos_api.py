"""Recursos (servidor): cadastro (próprio/alugado), lista com situação, alertas, ocupação e indicadores; conflitos; mapa;
ficha (locação com custo, reservas depois da devolução); calibração/manutenção com certificado; paradas; locação (estender,
devolver); fornecedores; recursos da atividade (reserva acompanha as datas, histórico, pendências, sugestões); permissões e isolamento."""
import sys, json, base64, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from dados_recursos import montar
from comum import token
A = "http://127.0.0.1:8900/api"; ok = f = 0
def check(n, c, x=""):
    global ok, f
    if c: ok += 1; print("OK   ", n)
    else: f += 1; print("FALHA", n, x)
PDF = "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF").decode()
hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
def um_ano(d): x = dt.date.fromisoformat(d); return x.replace(year=x.year + 1).isoformat()
pid, p2, ids, R = montar()
def sessao(e, s):
    x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026"); ana = sessao("ana@rawtech.com.br", "Ana-Ribeiro-2026")
enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026"); car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026")
L = adm.get(A+"/recursos").json(); X = {r["codigo"]: r for r in L["recursos"]}
k = L["indicadores"]
check("Lista: 7 recursos com indicadores", k["total"] == 7 and k["alugados"] == 1 and k["devolucoes"] == 1 and k["vencidos"] == 1 and k["conflitos"] == 1, k)
check("Plataforma alugada: em uso, devolver em 5 dias e reserva depois da devolução",
      X["PLT-02"]["situacao"]["tipo"] == "em_uso" and {"Devolver em 5 dias", "Reserva depois da devolução"} <= {a["texto"] for a in X["PLT-02"]["alertas"]}, X["PLT-02"]["alertas"])
check("Custo da locação: R$ 380/dia × 13 dias até hoje; previsto 18 dias", X["PLT-02"]["locacao"]["custo_ate_agora"] == 4940 and X["PLT-02"]["locacao"]["custo_previsto"] == 6840, X["PLT-02"]["locacao"])
check("Megômetro com calibração vencida", any(a["texto"] == "Calibração vencida" and a["nivel"] == "grave" for a in X["MEG-03"]["alertas"]))
check("Terrômetro: calibração vence em 18 dias", any(a["texto"] == "Calibração vence em 18 dias" for a in X["TER-01"]["alertas"]), X["TER-01"]["alertas"])
check("Gerador em manutenção hoje (parada)", X["GER-01"]["situacao"]["tipo"] == "manutencao" and X["GER-01"]["situacao"]["texto"] == f"Em manutenção até {D(5)[8:10]}/{D(5)[5:7]}")
check("Caminhonete com conflito (duas obras nos mesmos dias)", any(a["tipo"] == "conflito" for a in X["CAM-02"]["alertas"]) and set(X["CAM-02"]["obras"]) == {"ELE-014", "NR12-007"})
cf = L["conflitos"][0]
check("Lista de conflitos traz o recurso e as duas atividades", cf["recurso"]["codigo"] == "CAM-02" and {a["descricao"] for a in cf["atividades"]} == {"Aterramento das prensas", "Lançamento de cabos MT"})
check("Ocupação de 14 dias calculada (0 a 100+)", X["MUN-02"]["ocupacao"] == 0 and 0 < X["PLT-02"]["ocupacao"] <= 100)
check("Selo 'em dia' quando o controle está ok", any(a["texto"] == "Inspeção em dia" and a["nivel"] == "ok" for a in X["MUN-02"]["alertas"]))
check("Fornecedor criado junto com a locação", [x["nome"] for x in L["fornecedores"]] == ["LocaMáq Equipamentos"])
# permissões
le = enc.get(A+"/recursos")
check("Encarregado vê a lista, sem custos", le.status_code == 200 and "custo" not in le.json()["recursos"][0] and "custo_ate_agora" not in [r for r in le.json()["recursos"] if r["codigo"] == "PLT-02"][0]["locacao"] and not le.json()["pode_editar"])
check("Encarregado não cadastra recurso", enc.post(A+"/recursos", json={"nome": "X"}).status_code == 403)
check("Funcionário não vê recursos", car.get(A+"/recursos").status_code == 403 and car.get(A+f"/recursos/{R['MUN-01']}").status_code == 403)
check("Gestora cadastra", ana.post(A+"/recursos", json={"nome": "Furadeira de impacto", "tipo": "ferramenta", "codigo": "FUR-01"}).status_code == 200)
check("Código repetido é recusado", adm.post(A+"/recursos", json={"nome": "Outra", "codigo": "FUR-01"}).status_code == 400)
check("Nome obrigatório e tipo inválido recusados", adm.post(A+"/recursos", json={"tipo": "veiculo"}).status_code == 400 and adm.post(A+"/recursos", json={"nome": "A", "tipo": "nave"}).status_code == 400)
check("Cadastro antigo (só nome) continua funcionando", adm.post(A+"/recursos", json={"nome": "Escada 7 m"}).status_code == 200)
# ficha
fi = adm.get(A+f"/recursos/{R['PLT-02']}").json()
check("Ficha: reservas com 'depois da devolução'", fi["reservas"][0]["descricao"] == "Eletrodutos e caixas de passagem" and fi["reservas"][0]["depois_devolucao"])
check("Ficha: locação com fornecedor e contrato", fi["locacoes"][0]["fornecedor"] == "LocaMáq Equipamentos" and fi["locacoes"][0]["contrato"] == "LM-2026-0418" and fi["locacoes"][0]["dias_para_devolver"] == 5)
check("Ficha: controle com certificado", fi["controles"][0]["tem_arquivo"] and fi["controles"][0]["situacao"] == "ok" and fi["controles"][0]["vence_em"] == um_ano(D(-18)))
cid = fi["controles"][0]["id"]
r = adm.get(A+f"/controles/{cid}/arquivo")
check("Certificado abre em PDF (privado, sem cache)", r.status_code == 200 and r.content.startswith(b"%PDF") and "no-store" in r.headers.get("Cache-Control", ""))
check("Funcionário não abre certificado de recurso", car.get(A+f"/controles/{cid}/arquivo").status_code == 403)
# controles
r = adm.post(A+f"/recursos/{R['MEG-03']}/controles", json={"tipo": "calibracao", "item": "Calibração (RBC)", "feito_em": D(-1), "validade_meses": 12, "instituicao": "Lab. Metrologia PE", "arquivo": {"dados": PDF}})
check("Nova calibração do megômetro: vence em 12 meses", r.status_code == 200 and r.json()["vence_em"] == um_ano(D(-1)), r.text)
X2 = {x["codigo"]: x for x in adm.get(A+"/recursos").json()["recursos"]}
check("Megômetro volta a ficar em dia (vale o lançamento mais novo)", not any(a["nivel"] == "grave" for a in X2["MEG-03"]["alertas"]) and any(a["texto"] == "Calibração em dia" for a in X2["MEG-03"]["alertas"]))
fm = adm.get(A+f"/recursos/{R['MEG-03']}").json()
check("Histórico de calibrações guardado", len(fm["controles"]) == 1 and len(fm["controles_historico"]) == 1)
check("Data no futuro recusada", adm.post(A+f"/recursos/{R['MEG-03']}/controles", json={"tipo": "calibracao", "feito_em": D(3), "validade_meses": 12}).status_code == 400)
check("Vencimento antes da data recusado", adm.post(A+f"/recursos/{R['MEG-03']}/controles", json={"tipo": "manutencao", "feito_em": D(-3), "vence_em": D(-5)}).status_code == 400)
check("Tipo de controle inválido recusado", adm.post(A+f"/recursos/{R['MEG-03']}/controles", json={"tipo": "pintura", "feito_em": D(-3)}).status_code == 400)
check("Arquivo que não é PDF/imagem recusado", adm.post(A+f"/recursos/{R['MEG-03']}/controles", json={"tipo": "manutencao", "feito_em": D(-3), "arquivo": {"dados": "data:text/plain;base64," + base64.b64encode(b"<script>").decode()}}).status_code == 400)
check("Encarregado não lança calibração", enc.post(A+f"/recursos/{R['MEG-03']}/controles", json={"tipo": "manutencao", "feito_em": D(-3)}).status_code == 403)
nid = adm.post(A+f"/recursos/{R['MEG-03']}/controles", json={"tipo": "manutencao", "item": "Troca das pontas", "feito_em": D(-2)}).json()["id"]
check("Manutenção sem vencimento e exclusão", adm.delete(A+f"/controles/{nid}").status_code == 200 and len(adm.get(A+f"/recursos/{R['MEG-03']}").json()["controles"]) == 1)
# paradas
r = adm.post(A+f"/recursos/{R['TER-01']}/paradas", json={"inicio": D(4), "fim": D(6), "motivo": "Conserto do display"})
check("Parada sobre uma reserva avisa as atividades afetadas", r.status_code == 200 and any("Malha de aterramento" in x for x in r.json()["reservas_afetadas"]), r.text)
X3 = {x["codigo"]: x for x in adm.get(A+"/recursos").json()["recursos"]}
check("Alerta 'reservado durante manutenção'", any(a["tipo"] == "parada" for a in X3["TER-01"]["alertas"]), X3["TER-01"]["alertas"])
check("Parada com fim antes do início recusada", adm.post(A+f"/recursos/{R['TER-01']}/paradas", json={"inicio": D(6), "fim": D(4)}).status_code == 400)
check("Excluir parada", adm.delete(A+f"/paradas/{r.json()['id']}").status_code == 200)
# locação
lid = fi["locacoes"][0]["id"]
check("Estender a locação até depois da última reserva", adm.patch(A+f"/locacoes/{lid}", json={"devolucao_prevista": D(12)}).status_code == 200
      and not any(a["texto"] == "Reserva depois da devolução" for a in [x for x in adm.get(A+"/recursos").json()["recursos"] if x["codigo"] == "PLT-02"][0]["alertas"]))
check("Devolução no futuro recusada", adm.patch(A+f"/locacoes/{lid}", json={"devolvido_em": D(2)}).status_code == 400)
check("Segunda locação em aberto recusada", adm.post(A+f"/recursos/{R['PLT-02']}/locacoes", json={"retirada": D(0), "devolucao_prevista": D(4)}).status_code == 400)
check("Registrar devolução", adm.patch(A+f"/locacoes/{lid}", json={"devolvido_em": D(0)}).status_code == 200)
pl = [x for x in adm.get(A+"/recursos").json()["recursos"] if x["codigo"] == "PLT-02"][0]
check("Devolvido: sai de 'em uso' e não conta mais como alugado", pl["situacao"]["texto"] == "Devolvido ao fornecedor" and pl["locacao"] is None)
ck = adm.get(A+f"/atividades/{ids['a22']}/checar-recurso?recurso={R['PLT-02']}").json()
check("Reservar um alugado já devolvido avisa", any("devolvido" in p["texto"] for p in ck["pendencias"]), ck["pendencias"])
check("Nova locação do mesmo recurso (outro período)", adm.post(A+f"/recursos/{R['PLT-02']}/locacoes", json={"fornecedor_nome": "Mills", "retirada": D(1), "devolucao_prevista": D(20), "custo": 2100, "custo_unidade": "semana"}).status_code == 200)
fo = adm.get(A+"/fornecedores").json()["fornecedores"]
check("Fornecedor novo criado pelo nome; locação em aberto contada", {x["nome"]: x["em_aberto"] for x in fo} == {"LocaMáq Equipamentos": 0, "Mills": 1}, fo)
check("Custo por semana vira custo por dia", [x for x in adm.get(A+f"/recursos/{R['PLT-02']}").json()["locacoes"] if x["devolvido_em"] is None][0]["custo_previsto"] == 6000.0)
check("Retirada depois do início da atividade avisa", any("Retirada só em" in p["texto"] for p in adm.get(A+f"/atividades/{ids['a22']}/checar-recurso?recurso={R['PLT-02']}").json()["pendencias"]))
fid = adm.post(A+"/fornecedores", json={"nome": "Sotreq", "telefone": "(81) 3000-0000"}).json()["id"]
check("Fornecedores: cadastrar, repetido recusado, editar, excluir", adm.post(A+"/fornecedores", json={"nome": "Sotreq"}).status_code == 400
      and adm.patch(A+f"/fornecedores/{fid}", json={"contato": "Rita"}).status_code == 200 and adm.delete(A+f"/fornecedores/{fid}").status_code == 200 and enc.get(A+"/fornecedores").status_code == 403)
# recursos da atividade
ck = adm.get(A+f"/atividades/{ids['e2']}/checar-recurso?recurso={R['MUN-01']}").json()
check("Checar munck 12 t na Montagem do trafo: já reservado na NR12-007", ck["pendencias"][0]["nivel"] == "grave" and "NR12-007 · Remoção do painel antigo" in ck["pendencias"][0]["texto"], ck)
check("Sugere o munck 8 t (livre, mesmo nome-base) e não a caminhonete", [s["codigo"] for s in ck["sugestoes"]] == ["MUN-02"], ck["sugestoes"])
ck = adm.get(A+f"/atividades/{ids['a23']}/checar-recurso?recurso={R['GER-01']}").json()
check("Gerador em manutenção no período: pendência grave", any(p["tipo"] == "parada" and p["nivel"] == "grave" for p in ck["pendencias"]))
check("Encarregado não checa nem reserva", enc.get(A+f"/atividades/{ids['e2']}/checar-recurso?recurso={R['MUN-01']}").status_code == 403 and enc.put(A+f"/atividades/{ids['e2']}/recursos", json={"recursos": [R["MUN-01"]]}).status_code == 403)
r = adm.put(A+f"/atividades/{ids['e2']}/recursos", json={"recursos": [R["MUN-01"]], "pendencias": {str(R["MUN-01"]): "Já reservado em NR12-007 · Remoção do painel antigo"}})
check("Reservar mesmo assim", r.status_code == 200 and r.json()["recursos"][0]["codigo"] == "MUN-01" and r.json()["recursos"][0]["pendencias_ao_reservar"])
h = adm.get(A+f"/atividades/{ids['e2']}/historico").json()["historico"][0]
check("Histórico registra recurso e pendências", "MUN-01" in h["depois"].get("recursos", "") and "NR12-007" in h["depois"].get("reservou_com_pendencias", ""), h)
L2 = adm.get(A+"/recursos").json()
check("Novo conflito aparece na lista", L2["indicadores"]["conflitos"] == 2 and any(a["tipo"] == "conflito" for a in [x for x in L2["recursos"] if x["codigo"] == "MUN-01"][0]["alertas"]))
check("Trocar pelo sugerido tira o conflito", adm.put(A+f"/atividades/{ids['e2']}/recursos", json={"recursos": [R["MUN-02"]]}).status_code == 200 and adm.get(A+"/recursos").json()["indicadores"]["conflitos"] == 1)
g = adm.get(A+f"/atividades/{ids['e2']}/recursos").json()
check("GET recursos da atividade com disponíveis", [x["codigo"] for x in g["recursos"]] == ["MUN-02"] and len(g["disponiveis"]) >= 8 and g["pode_editar"])
check("Recurso de outra empresa/inexistente recusado", adm.put(A+f"/atividades/{ids['e2']}/recursos", json={"recursos": [99999]}).status_code == 400)
# a reserva acompanha a data da atividade
adm.patch(A+f"/atividades/{ids['n3']}", json={"inicio": D(40), "duracao_dias": 2})
check("Mudou a data da atividade: o conflito some sozinho", adm.get(A+"/recursos").json()["indicadores"]["conflitos"] == 0)
# mapa
m = adm.get(A+"/recursos-mapa").json()
lm = {l["codigo"]: l for l in m["linhas"]}
check("Mapa: 4 semanas a partir da segunda-feira", dt.date.fromisoformat(m["inicio"]).weekday() == 0 and (dt.date.fromisoformat(m["fim"]) - dt.date.fromisoformat(m["inicio"])).days == 27)
check("Mapa: reservas, parada, calibração e locação", lm["GER-01"]["paradas"] and lm["PLT-02"]["locacao"] and lm["MUN-01"]["reservas"] and lm["TER-01"]["reservas"], lm["GER-01"])
check("Mapa com 8 semanas", (dt.date.fromisoformat(adm.get(A+"/recursos-mapa?semanas=8").json()["fim"]) - dt.date.fromisoformat(m["inicio"])).days == 55)
check("Mapa: data inválida recusada", adm.get(A+"/recursos-mapa?inicio=2026-13-40").status_code == 400)
# editar / excluir
check("Limpar o custo (unidade vazia) é aceito", adm.patch(A+f"/recursos/{R['MUN-01']}", json={"custo": None, "custo_unidade": None}).status_code == 200)
check("Editar recurso (modelo, inativar)", adm.patch(A+f"/recursos/{R['CAM-02']}", json={"modelo": "Chevrolet S10 2024", "ativo": False}).status_code == 200
      and [x for x in adm.get(A+"/recursos").json()["recursos"] if x["codigo"] == "CAM-02"][0]["situacao"]["tipo"] == "inativo")
check("Inativo some do mapa", "CAM-02" not in {l["codigo"] for l in adm.get(A+"/recursos-mapa").json()["linhas"]})
check("Excluir recurso tira das atividades", adm.delete(A+f"/recursos/{R['MUN-02']}").status_code == 200 and adm.get(A+f"/atividades/{ids['e2']}/recursos").json()["recursos"] == [])
# isolamento
o = requests.Session()
o.post(A+"/cadastro", json={"empresa": {"nome": "Outra Engenharia"}, "admin": {"nome": "Outro Admin", "email": "rec@outra.test", "senha": "senha-forte-1"}, "equipe": []})
o.post(A+"/confirmar-email", json={"token": token("rec@outra.test", "confirmar")}); o.post(A+"/entrar", json={"email": "rec@outra.test", "senha": "senha-forte-1"})
check("Outra empresa não vê nem mexe nos recursos", o.get(A+"/recursos").json()["recursos"] == [] and o.get(A+f"/recursos/{R['MUN-01']}").status_code == 404
      and o.post(A+f"/recursos/{R['MUN-01']}/controles", json={"tipo": "manutencao", "feito_em": D(-1)}).status_code == 404 and o.get(A+f"/controles/{cid}/arquivo").status_code == 404
      and o.patch(A+f"/locacoes/{lid}", json={"devolvido_em": D(0)}).status_code == 404 and o.get(A+"/fornecedores").json()["fornecedores"] == [])
print(f"RESULTADO: {ok} ok, {f} falhas")
