/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · sincronizacao.js
   Sincronização opcional com GitHub Gist e proteção dos dados do navegador entre versões
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   GITHUB GIST SYNC — configuração
══════════════════════════════════════════════════ */
const APP_VERSION = '2026.11.15.3';
const STORAGE_VERSION_KEY = 'tf_app_version';
const GIST_ID    = localStorage.getItem('tf_gist_id') || '';
const GIST_TOKEN = localStorage.getItem('tf_gist_token') || '';
const GIST_FILE  = localStorage.getItem('tf_gist_file') || 'taskflow.json';
const GIST_API   = GIST_ID ? `https://api.github.com/gists/${GIST_ID}` : '';

let _gistSaveTimer = null;

function isGistSyncEnabled() {
  return !!(GIST_ID && GIST_TOKEN);
}

function backupAndResetStaleBrowserData() {
  // Antes: ao mudar APP_VERSION, apagava atividades e projetos do navegador.
  // Agora: so registra a versao nova e guarda uma copia de seguranca. Nenhum dado e apagado.
  try {
    const current = localStorage.getItem(STORAGE_VERSION_KEY);
    if (current === APP_VERSION) return;
    const backup = {};
    ['tf_activities','tf_projects'].forEach((key) => { const v = localStorage.getItem(key); if (v !== null) backup[key] = v; });
    if (Object.keys(backup).length) {
      localStorage.setItem('tf_backup_ultima_versao', JSON.stringify({ versaoAnterior: current || 'desconhecida', data: new Date().toISOString(), backup }));
    }
    localStorage.setItem(STORAGE_VERSION_KEY, APP_VERSION);
  } catch (e) {
    console.warn('Storage version check error:', e);
  }
}

async function gistLoad() {
  if (!isGistSyncEnabled()) return null;
  try {
    const res = await fetch(GIST_API, {
      headers: { 'Authorization': `token ${GIST_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error('Gist load failed');
    const data = await res.json();
    const raw = data.files[GIST_FILE]?.content;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) {
    console.warn('Gist load error:', e);
    return null;
  }
}

async function gistSave(payload) {
  if (!isGistSyncEnabled()) return;
  try {
    await fetch(GIST_API, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GIST_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: { [GIST_FILE]: { content: JSON.stringify(payload, null, 2) } }
      })
    });
  } catch(e) {
    console.warn('Gist save error:', e);
  }
}

function scheduleGistSave() {
  if (!isGistSyncEnabled()) return;
  clearTimeout(_gistSaveTimer);
  _gistSaveTimer = setTimeout(() => {
    const payload = {
      activities,
      projects,
      employees: typeof employees !== 'undefined' ? employees : [],
      teamCalendar: typeof teamCalendar !== 'undefined' ? teamCalendar : {},
      resourceRegistry: typeof resourceRegistry !== 'undefined' ? resourceRegistry : [],
      projectFolders: typeof projectFolders !== 'undefined' ? projectFolders : [],
    };
    gistSave(payload);
  }, 1500);
}
