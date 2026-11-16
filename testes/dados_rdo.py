"""Dados para a tela RDO: Recursos (ELE-014 + NR12-007, equipamentos reservados) + campo do dia (avanços com foto, Travou),
RDOs de dias anteriores em cada situação e uma logo da empresa."""
import sys, io, base64, datetime as dt, requests
sys.path.insert(0, "/home/claude/telas"); from dados_recursos import montar as montar_rec
from PIL import Image, ImageDraw
A = "http://127.0.0.1:8900/api"
def foto(cor=(110, 120, 130)):
    im = Image.new("RGB", (1200, 900), cor); d = ImageDraw.Draw(im)
    for k in range(0, 1200, 150): d.rectangle([k, 520, k + 80, 900], fill=(70, 75, 80)); d.line([k, 0, k + 300, 520], fill=(160, 160, 150), width=12)
    b = io.BytesIO(); im.save(b, "JPEG", quality=80); return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
def logo():
    im = Image.new("RGBA", (900, 300), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 30, 250, 270], 40, fill=(15, 61, 110, 255)); d.polygon([(70, 220), (130, 80), (190, 220)], outline=(245, 158, 11, 255), width=22)
    d.rectangle([290, 110, 860, 170], fill=(15, 61, 110, 255)); d.rectangle([290, 195, 700, 220], fill=(71, 85, 105, 255))
    b = io.BytesIO(); im.save(b, "PNG"); return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()
def sessao(e, s):
    x = requests.Session(); x.post(A+"/entrar", json={"email": e, "senha": s}); return x
def montar(com_logo=True):
    pid, p2, ids, R = montar_rec()
    adm = sessao("wendell@rawtech.com.br", "Obra-Segura-2026"); car = sessao("carla@rawtech.com.br", "Carla-Mendes-2026"); enc = sessao("bruno@rawtech.com.br", "Bruno-Costa-2026")
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date(); D = lambda n: (hoje + dt.timedelta(days=n)).isoformat()
    adm.patch(A+f"/projetos/{pid}", json={"local_obra": "Galpão 3 · Recife/PE"})
    if com_logo: adm.post(A+"/empresa/logo", json={"dados": logo()})
    car.post(A+f"/atividades/{ids['a22']}/avanco", json={"avanco": 40, "comentario": "Trecho A concluído", "fotos": [{"dados": foto()}]})
    enc.post(A+f"/atividades/{ids['a21']}/avanco", json={"avanco": 70, "fotos": [{"dados": foto((120, 100, 85))}, {"dados": foto((95, 110, 100))}]})
    car.post(A+f"/atividades/{ids['a23']}/impedimento", json={"motivo": "clima", "descricao": "Chuva forte desde as 14h"})
    # RDOs antigos em cada situação (dias úteis anteriores)
    dias = []; d = hoje - dt.timedelta(days=1)
    while len(dias) < 4:
        if d.weekday() < 5: dias.append(d.isoformat())
        d -= dt.timedelta(days=1)
    rd = {}
    for k, dia in zip(["ass", "entr", "fech", "rasc"], reversed(dias)):
        rid = adm.post(A+f"/obras/{pid}/rdos", json={"data": dia}).json()["id"]; rd[k] = rid
        adm.patch(A+f"/rdos/{rid}", json={"clima_manha": "Bom", "clima_tarde": "Nublado", "observacoes": "Serviço normal."})
        if k in ("ass", "entr", "fech"): adm.post(A+f"/rdos/{rid}/fechar")
        if k in ("ass", "entr"): adm.post(A+f"/rdos/{rid}/entregue", json={"data": dia})
        if k == "ass": adm.post(A+f"/rdos/{rid}/assinado", json={"foto": {"dados": foto((240, 240, 230))}, "assinante": "Eng. Paulo Andrade", "data": dia})
    return pid, p2, ids, R, rd
if __name__ == "__main__": print(montar())
