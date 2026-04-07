"""
╔══════════════════════════════════════════════════════════════╗
║         TASKFLOW — SERVIDOR LOCAL CALLMEBOT                  ║
║  Roda no seu PC e faz as chamadas ao CallMeBot sem proxy     ║
║  Uso: python callmebot_server.py                             ║
╚══════════════════════════════════════════════════════════════╝
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
from urllib.request import urlopen
from urllib.error import URLError, HTTPError
import json
import os
import sys

# ── Configuração ──────────────────────────────────────────────
PHONE   = os.environ.get("CALLMEBOT_PHONE", "")
APIKEY  = os.environ.get("CALLMEBOT_APIKEY", "")
PORT    = int(os.environ.get("PORT", 5000))
HOST    = "0.0.0.0"


def mask_secret(value: str, visible: int = 3) -> str:
    if not value:
        return "(não configurada)"
    if len(value) <= visible:
        return "*" * len(value)
    return value[:visible] + "*" * (len(value) - visible)

# ─────────────────────────────────────────────────────────────
class CallMeBotHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        print(f"[TaskFlow] {self.address_string()} — {format % args}")

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        """Responde ao preflight CORS do navegador"""
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        # ── Rota: /send?text=SUA+MENSAGEM ─────────────────────
        if parsed.path == "/send":
            params = parse_qs(parsed.query)
            text   = params.get("text", ["Teste TaskFlow ✅"])[0]
            self._send_whatsapp(text)

        # ── Rota: /test ────────────────────────────────────────
        elif parsed.path == "/test":
            self._send_whatsapp("✅ *TaskFlow* — Servidor local funcionando! Notificações de atividades atrasadas ativadas.")

        # ── Rota: /status ──────────────────────────────────────
        elif parsed.path == "/status":
            self._json_response(200, {"status": "ok", "phone": mask_secret(PHONE), "server": f"{HOST}:{PORT}", "configured": bool(PHONE and APIKEY)})

        else:
            self._json_response(404, {"error": "Rota não encontrada. Use /send?text=... ou /test"})

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/send":
            length  = int(self.headers.get("Content-Length", 0))
            body    = self.rfile.read(length)
            try:
                data = json.loads(body)
                text = data.get("text", "")
            except Exception:
                text = body.decode("utf-8", errors="ignore")

            if not text:
                self._json_response(400, {"error": "Campo 'text' obrigatório"})
                return

            self._send_whatsapp(text)
        else:
            self._json_response(404, {"error": "Rota não encontrada"})

    # ── Envia mensagem via CallMeBot ───────────────────────────
    def _send_whatsapp(self, text):
        if not PHONE or not APIKEY:
            self._json_response(500, {"ok": False, "error": "CALLMEBOT_PHONE ou CALLMEBOT_APIKEY não configurados.", "hint": "Defina as variáveis de ambiente antes de iniciar o servidor."})
            return

        encoded = quote(text)
        url     = f"https://api.callmebot.com/whatsapp.php?phone={PHONE}&text={encoded}&apikey={APIKEY}"

        print(f"\n📤 Enviando mensagem...")
        print(f"   Para   : {mask_secret(PHONE)}")
        print(f"   Texto  : {text[:80]}{'...' if len(text) > 80 else ''}")

        try:
            with urlopen(url, timeout=15) as resp:
                body = resp.read().decode("utf-8", errors="ignore")
                code = resp.getcode()

            print(f"   Status : {code}")
            print(f"   Resposta: {body[:120]}")

            body_lower = body.lower()
            if code == 200 and any(kw in body_lower for kw in ["message queued", "ok", "sent", "queued"]):
                print("   ✅ Mensagem enviada com sucesso!\n")
                self._json_response(200, {"ok": True, "response": body})
            else:
                print(f"   ⚠ CallMeBot retornou: {body}\n")
                self._json_response(200, {"ok": False, "response": body,
                                          "hint": "Verifique se a API Key está correta e o número está ativado."})

        except HTTPError as e:
            msg = f"Erro HTTP {e.code}: {e.reason}"
            print(f"   ❌ {msg}\n")
            self._json_response(500, {"ok": False, "error": msg})

        except URLError as e:
            msg = f"Sem conexão com CallMeBot: {e.reason}"
            print(f"   ❌ {msg}\n")
            self._json_response(500, {"ok": False, "error": msg,
                                      "hint": "Verifique sua conexão com a internet."})

        except Exception as e:
            print(f"   ❌ Erro inesperado: {e}\n")
            self._json_response(500, {"ok": False, "error": str(e)})

    # ── Helper JSON ────────────────────────────────────────────
    def _json_response(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(body)


# ── Inicialização ──────────────────────────────────────────────
def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║       TASKFLOW — Servidor CallMeBot Local        ║")
    print("╠══════════════════════════════════════════════════╣")
    print(f"║  Endereço : http://{HOST}:{PORT}                    ║")
    print(f"║  Número   : {mask_secret(PHONE)}              ║")
    print(f"║  API Key  : {mask_secret(APIKEY)}                          ║")
    print("╠══════════════════════════════════════════════════╣")
    if not PHONE or not APIKEY:
        print("║  Aviso    : configure CALLMEBOT_PHONE e         ║")
        print("║             CALLMEBOT_APIKEY no ambiente.       ║")
        print("╠══════════════════════════════════════════════════╣")
    print("║  Rotas disponíveis:                              ║")
    print("║    /test            → Envia mensagem de teste    ║")
    print("║    /send?text=...   → Envia mensagem customizada ║")
    print("║    /status          → Verifica se está rodando   ║")
    print("╠══════════════════════════════════════════════════╣")
    print("║  Para testar agora, abra no navegador:           ║")
    print(f"║  http://{HOST}:{PORT}/test                          ║")
    print("╚══════════════════════════════════════════════════╝")
    print("\n  Aguardando requisições... (Ctrl+C para parar)\n")

    try:
        server = HTTPServer((HOST, PORT), CallMeBotHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\n  Servidor encerrado.")
        sys.exit(0)
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n❌ Porta {PORT} já está em uso.")
            print(f"   Feche o outro processo ou mude PORT no início do arquivo.")
        else:
            raise

if __name__ == "__main__":
    main()
