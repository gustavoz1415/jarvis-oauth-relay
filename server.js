// Jarvis OAuth Relay: sem estado, sem banco, sem dependências (Node 18+).
// Faz a ponte entre o SmartThings (OAuth) e o app Jarvis Remote.
// Variáveis de ambiente no Render:
//   PUBLIC_URL          ex.: https://jarvis-oauth-relay.onrender.com (sem barra no fim)
//   ST_CLIENT_ID        (preenchido depois do cadastro em /setup)
//   ST_CLIENT_SECRET    (idem)
//   SETUP_SECRET        senha para abrir /setup (apague depois de cadastrar)
// Opcionais: ST_API_BASE, ST_AUTHORIZE_PATH (padrão /oauth/authorize)

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const CLIENT_ID = process.env.ST_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET || '';
const SETUP_SECRET = process.env.SETUP_SECRET || '';
const ST_API = (process.env.ST_API_BASE || 'https://api.smartthings.com').replace(/\/$/, '');
const AUTHORIZE_PATH = process.env.ST_AUTHORIZE_PATH || '/oauth/authorize';
const APP_SCHEME = 'jarvisremote://smartthings';
const APP_PACKAGE = 'app.jarvis.remote';
const SCOPES = ['r:devices:*', 'w:devices:*', 'x:devices:*', 'r:locations:*'];
const UPSTREAM_TIMEOUT_MS = 20000;

// Limite simples por IP: 30 requisições por minuto.
// Atrás do proxy do Render, usamos o último IP do X-Forwarded-For (o que o proxy acrescentou).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 30;
}

// Limite global para tentativas de cadastro: 10 a cada 15 minutos (protege o SETUP_SECRET).
const setupTries = [];
function setupLimited() {
  const now = Date.now();
  while (setupTries.length && now - setupTries[0] > 15 * 60000) setupTries.shift();
  setupTries.push(now);
  return setupTries.length > 10;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    if (!list.some((t) => now - t < 60000)) hits.delete(ip);
  }
}, 60000).unref();

function readBody(req, max = 10000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let failed = false;
    const chunks = [];
    req.on('data', (c) => {
      if (failed) return;
      size += c.length;
      if (size > max) { failed = true; reject(new Error('body_too_large')); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'",
  });
  res.end(html);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PAGE_HEAD =
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Jarvis</title><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:2rem auto;padding:0 1rem;line-height:1.5}' +
  'input,button{font-size:1.1rem;padding:.7rem;width:100%;box-sizing:border-box;margin:.3rem 0}code{word-break:break-all}</style></head><body>';
const PAGE_TAIL = '</body></html>';

// Troca de token com o SmartThings. TODO(verify): caminho do endpoint (/oauth/token ou /v1/oauth/token).
async function tokenRequest(params) {
  const basic = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
  for (const path of ['/oauth/token', '/v1/oauth/token']) {
    const r = await fetch(ST_API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + basic },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (r.status === 404) continue;
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { error: 'resposta_invalida' }; }
    return { status: r.status, data };
  }
  return { status: 502, data: { error: 'endpoint_de_token_nao_encontrado' } };
}

// O app Jarvis Remote não conhece o client_id (ele só existe aqui no relay).
// Por isso o app abre PUBLIC_URL/oauth/start?state=... e o relay redireciona para o SmartThings.
// TODO(verify): caminho exato da autorização no SmartThings (padrão /oauth/authorize).
function handleStart(url, res) {
  if (!CLIENT_ID || !PUBLIC_URL) {
    return sendHtml(res, 503, PAGE_HEAD + '<h2>Relay não configurado</h2><p>O cadastro do app no SmartThings ainda não foi concluído.</p>' + PAGE_TAIL);
  }
  const state = url.searchParams.get('state') || '';
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(state)) {
    return sendHtml(res, 400, PAGE_HEAD + '<h2>Pedido inválido</h2><p>Abra este endereço pelo botão “Conectar” do Jarvis Remote.</p>' + PAGE_TAIL);
  }
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: PUBLIC_URL + '/oauth/callback',
    scope: SCOPES.join(' '),
    state,
  });
  res.writeHead(302, { Location: ST_API + AUTHORIZE_PATH + '?' + q.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  res.end();
}

function handleCallback(url, res) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const error = url.searchParams.get('error');
  if (error || !code) {
    return sendHtml(res, 400, PAGE_HEAD + '<h2>Autorização cancelada</h2><p>O SmartThings não liberou o acesso (' +
      esc(error || 'sem código') + '). Volte ao Jarvis Remote e tente de novo.</p>' + PAGE_TAIL);
  }
  const qs = 'code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(state);
  const deep = APP_SCHEME + '?' + qs;
  const intent = 'intent://smartthings?' + qs + '#Intent;scheme=jarvisremote;package=' + APP_PACKAGE + ';end';
  const safe = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  sendHtml(res, 200, PAGE_HEAD + '<h2>Quase lá</h2><p>Abrindo o Jarvis Remote… Se nada acontecer, toque no botão.</p>' +
    '<a id="a" href="' + esc(deep) + '"><button>Abrir Jarvis Remote</button></a>' +
    '<script>var i=' + safe(intent) + ',d=' + safe(deep) +
    ',t=/Android/i.test(navigator.userAgent)?i:d;' +
    'document.getElementById("a").href=t;location.href=t;</script>' + PAGE_TAIL);
}

async function handleToken(req, res, kind) {
  if (!CLIENT_ID || !CLIENT_SECRET || !PUBLIC_URL) return sendJson(res, 503, { error: 'relay_nao_configurado' });
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) {
    return sendJson(res, e && e.message === 'body_too_large' ? 413 : 400, { error: e && e.message === 'body_too_large' ? 'corpo_grande_demais' : 'json_invalido' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { error: 'json_invalido' });
  let params;
  if (kind === 'token') {
    if (!body.code) return sendJson(res, 400, { error: 'falta_code' });
    params = { grant_type: 'authorization_code', client_id: CLIENT_ID, code: String(body.code), redirect_uri: PUBLIC_URL + '/oauth/callback' };
  } else {
    if (!body.refresh_token) return sendJson(res, 400, { error: 'falta_refresh_token' });
    params = { grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: String(body.refresh_token) };
  }
  try {
    const { status, data } = await tokenRequest(params);
    return sendJson(res, status, data);
  } catch (e) {
    return sendJson(res, 502, { error: 'falha_ao_falar_com_smartthings' });
  }
}

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function setupForm() {
  return PAGE_HEAD + '<h2>Cadastro único do Jarvis no SmartThings</h2>' +
    '<p>Cole o token pessoal do SmartThings (ele não é guardado).</p>' +
    '<form method="post" action="/setup/register">' +
    '<input name="secret" type="password" placeholder="SETUP_SECRET" required>' +
    '<input name="pat" type="password" placeholder="Token pessoal do SmartThings" required>' +
    '<input name="name" placeholder="Nome do app (minúsculas, ex.: jarvis-tv-casa)" value="jarvis-tv-casa" required>' +
    '<button type="submit">Cadastrar</button></form>' + PAGE_TAIL;
}

// TODO(verify): corpo exato do POST /v1/apps para um app OAuth-In (API_ONLY).
async function handleRegister(req, res) {
  if (!SETUP_SECRET || !PUBLIC_URL) return sendHtml(res, 404, PAGE_HEAD + '<p>Setup desativado.</p>' + PAGE_TAIL);
  if (setupLimited()) return sendHtml(res, 429, PAGE_HEAD + '<p>Muitas tentativas. Espere 15 minutos.</p>' + PAGE_TAIL);
  let form;
  try { form = new URLSearchParams(await readBody(req)); } catch (e) {
    return sendHtml(res, 400, PAGE_HEAD + '<p>Requisição inválida.</p>' + PAGE_TAIL);
  }
  if (!sameSecret(form.get('secret') || '', SETUP_SECRET)) return sendHtml(res, 403, PAGE_HEAD + '<p>Senha de setup incorreta.</p>' + PAGE_TAIL);
  const name = (form.get('name') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (!name) return sendHtml(res, 400, PAGE_HEAD + '<p>Nome do app inválido.</p>' + PAGE_TAIL);
  let lastStatus = 0;
  let lastText = '';
  try {
    for (const classification of ['CONNECTED_SERVICE', 'AUTOMATION']) {
      const payload = {
        appName: name,
        displayName: 'Jarvis TV',
        description: 'Assistente de voz Jarvis TV',
        singleInstance: true,
        appType: 'API_ONLY',
        apiOnly: { targetUrl: PUBLIC_URL },
        classifications: [classification],
        oauth: { clientName: 'Jarvis TV', scope: SCOPES, redirectUris: [PUBLIC_URL + '/oauth/callback'] },
      };
      const r = await fetch(ST_API + '/v1/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (form.get('pat') || '') },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      const text = await r.text();
      let data = {};
      try { data = JSON.parse(text); } catch (e) { /* resposta não era JSON */ }
      if (r.ok && data.oauthClientId) {
        return sendHtml(res, 200, PAGE_HEAD + '<h2>Cadastrado</h2><p>Copie agora para as variáveis de ambiente do Render (esta tela não aparece de novo):</p>' +
          '<p>ST_CLIENT_ID<br><code>' + esc(data.oauthClientId) + '</code></p>' +
          '<p>ST_CLIENT_SECRET<br><code>' + esc(data.oauthClientSecret || '') + '</code></p>' +
          '<p>Depois salve, deixe o Render reiniciar e apague a variável SETUP_SECRET.</p>' + PAGE_TAIL);
      }
      lastStatus = r.status;
      lastText = text;
      if (r.status === 401 || r.status === 403) break; // token inválido ou sem permissão: outra classificação não ajuda
    }
    return sendHtml(res, 502, PAGE_HEAD + '<h2>Não deu certo</h2><p>O SmartThings respondeu ' + lastStatus + '.</p><pre>' +
      esc(lastText.slice(0, 600)) + '</pre>' + PAGE_TAIL);
  } catch (e) {
    return sendHtml(res, 502, PAGE_HEAD + '<p>Falha ao falar com o SmartThings.</p>' + PAGE_TAIL);
  }
}

const server = http.createServer(async (req, res) => {
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',').map((s) => s.trim()).filter(Boolean);
  const ip = xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || '');
  if (limited(ip)) return sendJson(res, 429, { error: 'muitas_requisicoes' });
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) return sendJson(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/oauth/start') return handleStart(url, res);
    if (req.method === 'GET' && url.pathname === '/oauth/callback') return handleCallback(url, res);
    if (req.method === 'POST' && url.pathname === '/oauth/token') return await handleToken(req, res, 'token');
    if (req.method === 'POST' && url.pathname === '/oauth/refresh') return await handleToken(req, res, 'refresh');
    if (req.method === 'GET' && url.pathname === '/setup') {
      if (!SETUP_SECRET) return sendHtml(res, 404, PAGE_HEAD + '<p>Setup desativado.</p>' + PAGE_TAIL);
      return sendHtml(res, 200, setupForm());
    }
    if (req.method === 'POST' && url.pathname === '/setup/register') return await handleRegister(req, res);
    return sendJson(res, 404, { error: 'nao_encontrado' });
  } catch (e) {
    return sendJson(res, 500, { error: 'erro_interno' });
  }
});

server.listen(PORT, () => console.log('Jarvis OAuth Relay na porta ' + PORT));
