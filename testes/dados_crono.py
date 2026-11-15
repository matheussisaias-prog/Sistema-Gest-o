"""Obra de exemplo com cronograma completo (etapas, ligações, linha de base), datas relativas a hoje."""
import sys, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from comum import token
A = "http://127.0.0.1:8900/api"
def criar():
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
    seg = hoje - dt.timedelta(days=hoje.weekday())                     # segunda desta semana
    D = lambda n: (seg + dt.timedelta(days=n)).isoformat()
    s = requests.Session()
    s.post(A+"/cadastro", json={"empresa": {"nome": "Rawtech Engenharia"}, "admin": {"nome": "Wendell Xavier", "email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"},
        "equipe": [{"nome": "Ana Ribeiro", "cargo": "Engenheira eletricista", "perfil": "gestor", "email": "ana@rawtech.com.br"},
                   {"nome": "Bruno Costa", "cargo": "Encarregado", "perfil": "encarregado", "email": "bruno@rawtech.com.br"},
                   {"nome": "Carla Mendes", "cargo": "Eletricista", "perfil": "funcionario", "email": "carla@rawtech.com.br"}]})
    s.post(A+"/confirmar-email", json={"token": token("wendell@rawtech.com.br", "confirmar")}); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
    for em, se in [("ana@rawtech.com.br", "Ana-Ribeiro-2026"), ("bruno@rawtech.com.br", "Bruno-Costa-2026"), ("carla@rawtech.com.br", "Carla-Mendes-2026")]:
        requests.post(A+"/convites/aceitar", json={"token": token(em, "convite"), "senha": se})
    us = {u["nome"]: u["id"] for u in s.get(A+"/usuarios").json()["usuarios"]}
    f = {x["nome"].split()[0]: x["id"] for x in s.get(A+"/funcionarios").json()["funcionarios"]}
    pid = s.post(A+"/projetos", json={"codigo": "ELE-014", "nome": "Subestação 13,8 kV · Galpão 3", "cliente": "Metalúrgica Nordeste", "local_obra": "Recife/PE",
        "tipo_servico": "Elétrica", "situacao": "Em andamento", "inicio": D(-14), "fim": D(75), "valor_contrato": 480000, "cor": "#2563eb", "numero_contrato": "PC 4500123456",
        "gestor_id": us["Wendell Xavier"], "rt_funcionario_id": f["Ana"], "art_numero": "PE20260012345"}).json()["id"]
    s.post(A+f"/projetos/{pid}/membros", json={"usuario_id": us["Bruno Costa"], "papel": "encarregado"})
    ordem = [0]
    def at(desc, pai=None, ini=None, dur=None, resp=None, av=0, sit="Pendente", peso=1):
        ordem[0] += 10
        r = s.post(A+"/atividades", json={"projeto_id": pid, "descricao": desc, "pai_id": pai, "inicio": ini, "duracao_dias": dur, "responsavel_id": f.get(resp), "avanco": av, "situacao": sit, "peso": peso, "ordem": ordem[0]}).json()
        return r["id"]
    e1 = at("Mobilização", ini=D(-14), dur=1)
    a11 = at("Mobilização de equipe e canteiro", e1, D(-14), 3, "Bruno", 100, "Concluído")
    a12 = at("Integração NR-10 e NR-35", e1, D(-11), 1, "Ana", 100, "Concluído")
    a13 = at("Levantamento de campo e as-built", e1, D(-13), 7, "Ana", 60, "Em andamento")
    e2 = at("Infraestrutura", ini=D(-7), dur=1)
    a21 = at("Base dos transformadores", e2, D(-7), 10, "Bruno", 60, "Em andamento", 2)
    a22 = at("Eletrodutos e caixas de passagem", e2, D(-6), 14, "Carla", 30, "Em andamento")
    a23 = at("Malha de aterramento", e2, D(0), 10, "Carla")
    e3 = at("Montagem eletromecânica", ini=D(21), dur=1)
    a31 = at("Transformadores 1 MVA (2 un.)", e3, D(21), 10, "Bruno")
    a32 = at("Cubículo de média tensão", e3, D(28), 14, "Carla")
    a33 = at("QGBT e alimentadores", e3, D(42), 10, "Bruno")
    e4 = at("Comissionamento", ini=D(63), dur=1)
    a41 = at("Ensaios e testes", e4, D(63), 8, "Ana")
    a42 = at("Energização", e4, D(73), 0, "Ana")
    for x, y, t, fo in [(a11, a12, "TC", 0), (a12, a21, "TC", 0), (a12, a22, "CC", 1), (a21, a23, "TC", 0), (a23, a31, "TC", 0), (a31, a32, "CC", 5), (a32, a33, "TC", 0), (a33, a41, "TC", 0), (a41, a42, "TC", 0)]:
        s.post(A+"/dependencias", json={"antes_id": x, "depois_id": y, "tipo": t, "folga_dias": fo})
    s.post(A+f"/obras/{pid}/linhas-base", json={})
    s.patch(A+f"/atividades/{a22}", json={"duracao_dias": 16})          # escorregou depois da linha de base
    return pid, {"a21": a21, "a22": a22, "a23": a23, "a13": a13}
if __name__ == "__main__": print(criar())
