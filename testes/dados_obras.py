"""Dados de exemplo da tela Obras (datas relativas a hoje), usados no teste e na gravação."""
import sys, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from comum import token
A = "http://127.0.0.1:8900/api"
def criar():
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
    s = requests.Session()
    s.post(A+"/cadastro", json={"empresa": {"nome": "Rawtech Engenharia"}, "admin": {"nome": "Wendell Xavier", "email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"},
        "equipe": [{"nome": "Paulo Melo", "cargo": "Engenheiro eletricista", "perfil": "gestor", "email": "paulo@rawtech.com.br"},
                   {"nome": "João Paulo", "cargo": "Encarregado", "perfil": "encarregado", "email": "jp@rawtech.com.br"},
                   {"nome": "David Lima", "cargo": "Eletricista", "perfil": "funcionario", "email": "david@rawtech.com.br"},
                   {"nome": "Carlos Souza", "cargo": "Montador", "perfil": "funcionario"}]})
    s.post(A+"/confirmar-email", json={"token": token("wendell@rawtech.com.br", "confirmar")}); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
    for em, se in [("paulo@rawtech.com.br", "Paulo-Melo-2026"), ("jp@rawtech.com.br", "Joao-Paulo-2026"), ("david@rawtech.com.br", "David-Lima-2026")]:
        requests.post(A+"/convites/aceitar", json={"token": token(em, "convite"), "senha": se})
    us = {u["nome"]: u["id"] for u in s.get(A+"/usuarios").json()["usuarios"]}
    f = {x["nome"]: x["id"] for x in s.get(A+"/funcionarios").json()["funcionarios"]}
    obras = [
        ("MON-021", "Eletrocalhas e leitos · Bloco B", "Construtora Litoral", "Jaboatão/PE", "Montagem", "Em andamento", -75, 27, 186000, "#dc2626", "Paulo Melo",
         [("Leitos e suportes", -75, 27, 40, "Em andamento", "Carlos Souza", 2), ("Eletrocalhas do 1º andar", -30, -5, 50, "Em andamento", "David Lima", 1)]),
        ("NR12-007", "Adequação NR-12 · Linha de prensas", "Autopeças Goiana", "Goiana/PE", "NR-12", "Em andamento", -40, 60, 215000, "#d97706", "Wendell Xavier",
         [("Proteções fixas e móveis", -40, 60, 30, "Em andamento", "João Paulo", 1)]),
        ("ELE-014", "Subestação 13,8 kV · Galpão 3", "Metalúrgica Nordeste", "Recife/PE", "Elétrica", "Em andamento", -12, 76, 480000, "#2563eb", "Wendell Xavier",
         [("Base dos transformadores", -12, 76, 34, "Em andamento", "David Lima", 1)]),
        ("SPDA-003", "SPDA e aterramento · Centro de distribuição", "Logística Atlântico", "Cabo de Santo Agostinho/PE", "SPDA", "Pausado", -90, 13, 94000, "#7c3aed", "Paulo Melo",
         [("Malha de aterramento", -90, 13, 70, "Em andamento", "Carlos Souza", 1)]),
        ("ELE-016", "Quadro geral de baixa tensão", "Hospital São Lucas", "Olinda/PE", "Elétrica", "Planejamento", 16, 104, 298000, "#0891b2", "Wendell Xavier", []),
        ("ILU-009", "Iluminação industrial · Galpão 1", "Metalúrgica Nordeste", "Recife/PE", "Elétrica", "Concluído", -150, -20, 120000, "#059669", "Paulo Melo",
         [("Luminárias LED", -150, -20, 100, "Concluído", "David Lima", 1)]),
    ]
    ids = {}
    for cod, nome, cli, loc, tipo, sit, i, fi, val, cor, gest, ativ in obras:
        r = s.post(A+"/projetos", json={"codigo": cod, "nome": nome, "cliente": cli, "local_obra": loc, "tipo_servico": tipo, "situacao": sit, "inicio": D(i), "fim": D(fi),
                                         "valor_contrato": val, "cor": cor, "gestor_id": us[gest], "rt_funcionario_id": f["Paulo Melo"]}).json()
        ids[cod] = r["id"]
        for d, ai, af, av, asit, resp, peso in ativ:
            s.post(A+"/atividades", json={"projeto_id": r["id"], "descricao": d, "inicio": D(ai), "fim": D(af), "avanco": av, "situacao": asit, "responsavel_id": f[resp], "peso": peso})
    s.post(A+f"/projetos/{ids['NR12-007']}/membros", json={"usuario_id": us["João Paulo"], "papel": "encarregado"})
    return ids
if __name__ == "__main__": print(criar())
