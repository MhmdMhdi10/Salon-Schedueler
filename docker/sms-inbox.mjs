import { createServer } from 'node:http';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 4000);
const dataFile = process.env.SMS_INBOX_DATA_FILE || '/data/messages.json';
const maxMessages = 500;

function loadMessages() {
  try {
    const value = JSON.parse(readFileSync(dataFile, 'utf8'));
    return Array.isArray(value) ? value.slice(0, maxMessages) : [];
  } catch {
    return [];
  }
}

let messages = loadMessages();

function saveMessages() {
  mkdirSync(dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify(messages, null, 2));
  renameSync(temporaryFile, dataFile);
}

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('payload-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const page = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>صندوق پیامک توسعه</title>
  <style>
    :root{color-scheme:dark;--bg:#07110f;--panel:#101b19;--line:#21322e;--text:#f4f8f7;--muted:#91a7a1;--brand:#11d7bd;--danger:#ff6b79}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% -20%,#10443b 0,transparent 35%),var(--bg);color:var(--text);font-family:Tahoma,Arial,sans-serif;min-height:100vh}
    main{width:min(1100px,calc(100% - 28px));margin:auto;padding:32px 0 60px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:22px}
    h1{font-size:clamp(22px,4vw,34px);margin:0 0 8px}.sub{margin:0;color:var(--muted);font-size:14px}.actions{display:flex;align-items:center;gap:10px}
    button{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:12px;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer}button:hover{border-color:var(--danger);color:var(--danger)}
    .health{display:inline-flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid #1d5147;border-radius:999px;background:#0d2c27;color:var(--brand);font-size:13px;font-weight:700}.dot{width:8px;height:8px;border-radius:50%;background:var(--brand);box-shadow:0 0 12px var(--brand)}
    .toolbar{display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:14px}.search{width:100%;border:1px solid var(--line);background:#0c1614;color:var(--text);border-radius:13px;padding:13px 15px;font:inherit;outline:none}.search:focus{border-color:var(--brand)}
    .count{display:flex;align-items:center;padding:0 15px;border:1px solid var(--line);border-radius:13px;background:var(--panel);color:var(--muted);font-size:13px;white-space:nowrap}
    .list{display:grid;gap:12px}.card{border:1px solid var(--line);border-radius:17px;background:linear-gradient(145deg,rgba(255,255,255,.025),transparent),var(--panel);padding:17px;box-shadow:0 12px 35px rgba(0,0,0,.18)}
    .meta{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}.phone{font-size:17px;font-weight:900;direction:ltr}.time{font-size:12px;color:var(--muted)}
    .message{white-space:pre-wrap;line-height:1.9;background:#09120f;border:1px solid #192723;border-radius:12px;padding:13px 14px;font-size:15px}.footer{display:flex;align-items:center;justify-content:space-between;margin-top:12px;color:var(--muted);font-size:12px}
    .status{display:inline-flex;align-items:center;gap:6px;color:var(--brand)}.status:before{content:'✓';display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#123d35}.code{direction:ltr;font:900 20px ui-monospace,monospace;letter-spacing:3px;color:var(--brand)}
    .empty{text-align:center;padding:75px 20px;border:1px dashed var(--line);border-radius:18px;color:var(--muted)}.empty strong{display:block;color:var(--text);font-size:18px;margin-bottom:8px}
    @media(max-width:650px){header{align-items:flex-start;flex-direction:column}.actions{width:100%;justify-content:space-between}.toolbar{grid-template-columns:1fr}.count{min-height:42px}.meta{align-items:flex-start;flex-direction:column-reverse}}
  </style>
</head>
<body>
  <main>
    <header><div><h1>صندوق پیامک توسعه</h1><p class="sub">نمایش پیامک‌هایی که برنامه در محیط Docker ارسال می‌کند</p></div><div class="actions"><span class="health"><span class="dot"></span>متصل و آماده</span><button id="clear" type="button">پاک‌کردن همه</button></div></header>
    <section class="toolbar"><input id="search" class="search" placeholder="جست‌وجوی شماره یا متن پیامک…"><div id="count" class="count">۰ پیامک</div></section>
    <section id="list" class="list" aria-live="polite"></section>
  </main>
  <script>
    const list = document.querySelector('#list');
    const count = document.querySelector('#count');
    const search = document.querySelector('#search');
    const clear = document.querySelector('#clear');
    let messages = [];
    const fa = new Intl.NumberFormat('fa-IR');
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
    function render() {
      const query = search.value.trim().toLowerCase();
      const visible = messages.filter((item) => !query || item.phone.toLowerCase().includes(query) || item.message.toLowerCase().includes(query));
      count.textContent = fa.format(visible.length) + ' پیامک';
      if (!visible.length) {
        list.innerHTML = '<div class="empty"><strong>هنوز پیامکی ثبت نشده</strong>از داخل سایت یک کد ورود یا اعلان ارسال کن؛ اینجا خودکار نمایش داده می‌شود.</div>';
        return;
      }
      list.innerHTML = visible.map((item) => {
        const otp = item.message.match(/(?:^|\\D)(\\d{6})(?:\\D|$)/)?.[1];
        const sentAt = new Intl.DateTimeFormat('fa-IR', {dateStyle:'medium',timeStyle:'medium'}).format(new Date(item.sentAt));
        return '<article class="card"><div class="meta"><span class="phone">' + escapeHtml(item.phone) + '</span><time class="time">' + escapeHtml(sentAt) + '</time></div><div class="message">' + escapeHtml(item.message) + '</div><div class="footer"><span class="status">تحویل به شبیه‌ساز موفق</span>' + (otp ? '<span class="code" title="کد تأیید">' + escapeHtml(otp) + '</span>' : '') + '</div></article>';
      }).join('');
    }
    async function refresh() {
      try { messages = await fetch('/api/messages', {cache:'no-store'}).then((response) => response.json()); render(); } catch {}
    }
    search.addEventListener('input', render);
    clear.addEventListener('click', async () => { if (!messages.length || !confirm('همه پیامک‌های تست پاک شوند؟')) return; await fetch('/api/messages', {method:'DELETE'}); await refresh(); });
    refresh(); setInterval(refresh, 2000);
  </script>
</body>
</html>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/healthz') return json(response, 200, { ok: true });
  if (request.method === 'GET' && url.pathname === '/api/messages') return json(response, 200, messages);
  if (request.method === 'DELETE' && url.pathname === '/api/messages') {
    messages = [];
    saveMessages();
    return json(response, 200, { ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/api/messages') {
    try {
      const body = await readJson(request);
      if (typeof body.phone !== 'string' || !body.phone.trim() || typeof body.message !== 'string' || !body.message.trim()) {
        return json(response, 422, { error: 'phone and message are required' });
      }
      const item = {
        id: randomUUID(),
        phone: body.phone.trim().slice(0, 32),
        message: body.message.trim().slice(0, 5000),
        provider: typeof body.provider === 'string' ? body.provider.slice(0, 80) : 'dev',
        sentAt: new Date().toISOString(),
      };
      messages = [item, ...messages].slice(0, maxMessages);
      saveMessages();
      return json(response, 201, item);
    } catch {
      return json(response, 400, { error: 'invalid JSON payload' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    return response.end(page);
  }
  return json(response, 404, { error: 'not found' });
});

server.listen(port, '0.0.0.0', () => console.log(`[sms-inbox] dashboard ready on :${port}`));
