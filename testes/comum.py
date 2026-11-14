import os, re, json
F = "/home/claude/fontes/node_modules"
FA = F + "/@fortawesome/fontawesome-free"
def fontes_css():
    css = ""
    for fam, pasta, pesos in [("Outfit", "outfit", [400,500,600,700,800]), ("DM Sans", "dm-sans", [400,500,600])]:
        for w in pesos:
            css += f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:block;src:url(https://fontes.local/{pasta}/files/{pasta}-latin-{w}-normal.woff2) format('woff2');}}\n"
    return css
def rotas(page):
    def g(route):
        u = route.request.url
        if "fonts.googleapis.com" in u: return route.fulfill(body=fontes_css(), content_type="text/css")
        if "fontes.local" in u:
            p = F + "/@fontsource/" + u.split("fontes.local/")[1]
            return route.fulfill(body=open(p,"rb").read(), content_type="font/woff2")
        if "cdnjs.cloudflare.com" in u and "font-awesome" in u:
            rel = u.split("/6.5.0/")[1].split("?")[0]
            ct = "text/css" if rel.endswith(".css") else "font/woff2"
            return route.fulfill(body=open(FA + "/" + rel, "rb").read(), content_type=ct)
        if u.startswith("http://127.0.0.1"): return route.continue_()
        return route.abort()
    page.route("**/*", g)
EMAILS = "/home/claude/teste-api/emails.jsonl"
def token(para, chave):
    for l in reversed(open(EMAILS, encoding="utf-8").read().splitlines()):
        e = json.loads(l)
        if e["para"] == para:
            m = re.search(chave + r"=([0-9a-f]{64})", e["texto"])
            if m: return m.group(1)
