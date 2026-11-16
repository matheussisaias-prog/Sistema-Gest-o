"""Dados para a tela Recursos: cronograma da ELE-014 + obra NR12-007, recursos próprios e alugados, calibrações, paradas e reservas."""
import sys, io, base64, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from dados_crono import criar
A = "http://127.0.0.1:8900/api"
PDF = "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF").decode()
def montar():
    pid, ids = criar()
    s = requests.Session(); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
    p2 = s.post(A+"/projetos", json={"codigo": "NR12-007", "nome": "Adequação NR-12 · Linha de prensas", "cliente": "Metalúrgica Boa Vista", "situacao": "Em andamento", "inicio": D(-5), "fim": D(40)}).json()["id"]
    at = lambda pid_, desc, ini, dur: s.post(A+"/atividades", json={"projeto_id": pid_, "descricao": desc, "inicio": D(ini), "duracao_dias": dur}).json()["id"]
    ids["n1"] = at(p2, "Içamento do QGBT", 8, 1)        # depois da Base dos transformadores (a21), que também usa o munck 12 t
    ids["n2"] = at(p2, "Remoção do painel antigo", 12, 1)
    ids["n3"] = at(p2, "Aterramento das prensas", 6, 3)
    ids["e1"] = at(pid, "Lançamento de cabos MT", 6, 10)
    ids["e2"] = at(pid, "Montagem do transformador 1", 12, 2)
    R = {}
    def rec(cod, nome, tipo, prop="proprio", loc=None, **kw):
        R[cod] = s.post(A+"/recursos", json={"codigo": cod, "nome": nome, "tipo": tipo, "propriedade": prop, **({"locacao": loc} if loc else {}), **kw}).json()["id"]
    rec("PLT-02", "Plataforma tesoura 12 m", "equipamento", "alugado", {"fornecedor_nome": "LocaMáq Equipamentos", "contrato": "LM-2026-0418", "retirada": D(-12), "devolucao_prevista": D(5), "custo": 380, "custo_unidade": "dia"}, modelo="Genie GS-3246")
    rec("MUN-01", "Caminhão munck 12 t", "veiculo", custo=950, custo_unidade="dia")
    rec("MUN-02", "Caminhão munck 8 t", "veiculo")
    rec("MEG-03", "Megômetro 5 kV", "ferramenta", modelo="Fluke 1555")
    rec("GER-01", "Gerador 150 kVA", "equipamento")
    rec("TER-01", "Terrômetro digital", "ferramenta", modelo="Minipa MTR-1522")
    rec("CAM-02", "Caminhonete S10", "veiculo")
    c = lambda cod, tipo, item, feito, meses, arq=None: s.post(A+f"/recursos/{R[cod]}/controles", json={"tipo": tipo, "item": item, "feito_em": D(feito), "validade_meses": meses, **({"arquivo": {"dados": arq}} if arq else {})})
    c("MEG-03", "calibracao", "Calibração (RBC)", -380, 12, PDF)            # vencida
    c("TER-01", "calibracao", "Calibração (RBC)", -347, 12, PDF)            # vence em ~18 dias
    c("PLT-02", "inspecao", "Inspeção anual (NR-12 / NR-18)", -18, 12, PDF)
    c("GER-01", "manutencao", "Manutenção preventiva", -75, 3)              # vence em ~17 dias
    c("MUN-01", "manutencao", "Revisão do guindaste", -60, 6)
    c("MUN-02", "inspecao", "Inspeção do guindaste", -30, 12)
    c("CAM-02", "manutencao", "Revisão 10.000 km", -20, 6)
    s.post(A+f"/recursos/{R['GER-01']}/paradas", json={"inicio": D(-2), "fim": D(5), "motivo": "Troca do regulador de tensão"})
    res = lambda aid, *cods: s.put(A+f"/atividades/{aid}/recursos", json={"recursos": [R[x] for x in cods]})
    res(ids["a22"], "PLT-02")             # termina depois da devolução da plataforma
    res(ids["a21"], "MUN-01")
    res(ids["n1"], "MUN-01")
    res(ids["n2"], "MUN-01")              # quem reservar o munck 12 t na Montagem do transformador 1 entra em conflito
    res(ids["a23"], "TER-01")
    res(ids["e1"], "CAM-02")
    res(ids["n3"], "CAM-02")              # conflito já existente (mapa de reservas)
    return pid, p2, ids, R
if __name__ == "__main__": print(montar())
