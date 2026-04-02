/* ══════════════════════════════════════════════════════════════
   TASKFLOW — PATCH sendWAMessage
   Substitua a função sendWAMessage existente no script.js
   por esta versão que usa o servidor local Python.

   COMO USAR:
   1. Rode o callmebot_server.py no seu PC
   2. Substitua a função sendWAMessage no script.js pelo código abaixo
   ══════════════════════════════════════════════════════════════ */

/**
 * Envia mensagem via servidor local Python (sem proxy externo)
 * O servidor callmebot_server.py deve estar rodando em localhost:5000
 *
 * @param {string} text - Mensagem a enviar
 * @param {object} cfg  - { phone, apikey } (ignorado — servidor usa config fixo)
 */
async function sendWAMessage(text, cfg) {
  const LOCAL_SERVER = 'http://localhost:5000/send';

  try {
    const res = await fetch(LOCAL_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.warn('Servidor local retornou erro HTTP:', res.status);
      return false;
    }

    const data = await res.json();

    if (data.ok) {
      console.log('✅ Mensagem enviada via servidor local!');
      return true;
    } else {
      console.warn('CallMeBot recusou:', data.response || data.error);
      // Mostra dica se tiver
      if (data.hint) console.warn('Dica:', data.hint);
      return false;
    }

  } catch (err) {
    // Servidor local não está rodando
    console.error('❌ Servidor local não encontrado:', err.message);
    showToast('⚠ Inicie o callmebot_server.py no seu PC para enviar mensagens!', 'error');
    return false;
  }
}
