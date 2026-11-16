"""Dados para a tela Equipe: cronograma da ELE-014 + mais pessoas, cargos com documentos exigidos, certificados e ausências."""
import sys, io, base64, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from dados_crono import criar
from PIL import Image
A = "http://127.0.0.1:8900/api"
def montar():
    pid, ids = criar()
    s = requests.Session(); s.post(A+"/entrar", json={"email": "wendell@rawtech.com.br", "senha": "Obra-Segura-2026"})
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
    F = {x["nome"].split()[0]: x["id"] for x in s.get(A+"/funcionarios").json()["funcionarios"]}
    for nome, cargo in [("Diego Souza", "Eletricista"), ("João Paulo", "Eletricista"), ("Marcos Silva", "Ajudante")]:
        F[nome.split()[0]] = s.post(A+"/funcionarios", json={"nome": nome, "cargo": cargo, "tipo_trabalho": "campo", "encarregado_id": F["Bruno"], "telefone": "(81) 98888-0000"}).json()["id"]
    s.patch(A+f"/funcionarios/{F['Carla']}", json={"encarregado_id": F["Bruno"], "telefone": "(81) 99999-0000"})
    T = {t["nome"]: t["id"] for t in s.get(A+"/tipos-documento").json()["tipos"]}
    nr10, nr35, aso, nr33, aut = T["NR-10 Básico"], T["Trabalho em altura"], T["ASO – periódico (exposto a riscos)"], T["Espaço confinado – trabalhador autorizado e vigia"], T["Autorização para serviços em eletricidade"]
    s.put(A+"/cargos-documentos", json={"cargo": "Eletricista", "tipos": [nr10, nr35, aso, aut]})
    s.put(A+"/cargos-documentos", json={"cargo": "Encarregado", "tipos": [nr10, nr35, aso]})
    s.put(A+"/cargos-documentos", json={"cargo": "Ajudante", "tipos": [nr35, aso]})
    b = io.BytesIO(); Image.new("RGB", (900, 640), (235, 232, 220)).save(b, "JPEG"); foto = "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
    pdf = "data:application/pdf;base64," + base64.b64encode(b"%PDF-1.4\n%%EOF").decode()
    doc = lambda f, t, dias, arq=None: s.post(A+f"/funcionarios/{F[f]}/documentos", json={"tipo_documento_id": t, "emissao": D(-dias), **({"arquivo": {"dados": arq}} if arq else {})})
    for f in ["Carla", "Diego", "João", "Bruno"]:
        doc(f, nr10, 400, pdf); doc(f, aut, 400, pdf)
    doc("Carla", nr35, 717, foto); doc("Carla", aso, 40, foto)
    doc("Diego", nr35, 200, foto); doc("Diego", aso, 380, foto)              # ASO vencido
    doc("João", nr35, 100, foto); doc("João", aso, 60, foto)
    doc("Bruno", nr35, 300, foto); doc("Bruno", aso, 340, foto); doc("Bruno", nr33, 20, pdf)
    doc("Marcos", aso, 50, foto)                                                   # falta NR-35
    s.put(A+f"/ausencias/funcionario/{F['João']}", json={"periodos": [{"inicio": D(-5), "fim": D(15), "tipo": "Férias"}]})
    s.put(A+f"/atividades/{ids['a23']}/exigencias", json={"tipos": [nr33]})
    for nome, (ini, dur) in {"Diego": (2, 8), "Marcos": (0, 12)}.items():
        s.post(A+"/atividades", json={"projeto_id": pid, "descricao": f"Apoio de campo ({nome})", "inicio": D(ini), "duracao_dias": dur, "responsavel_id": F[nome]})
    s.post(A+"/atividades", json={"projeto_id": pid, "descricao": "Lançamento de cabos (Marcos)", "inicio": D(0), "duracao_dias": 6, "responsavel_id": F["Marcos"]})
    return pid, ids, F
if __name__ == "__main__": print(montar())
