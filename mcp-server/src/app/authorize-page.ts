// Consent page of the OAuth flow, in the app's style: light grey ground, white panel, thin italic type,
// sharp corners, black primary button. No scripts, no external resources.
import { OWNER } from '../config.js'
import type { Lang } from './http.js'

const T = {
  de: {
    title: 'Zugriff erlauben',
    lead: (c: string) => `<b>${c}</b> möchte auf Jarvis zugreifen: Chats lesen und in deinem Namen handeln.`,
    password: 'Passwort',
    allow: 'Erlauben',
    deny: 'Ablehnen',
    wrong: 'Das Passwort stimmt nicht.',
    blocked: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.',
    noPassword: 'Es ist noch kein Passwort gesetzt. Lege es in der Jarvis-Oberfläche im Heimnetz fest.',
    expired: 'Diese Anfrage ist abgelaufen. Bitte die Verbindung im Programm neu starten.',
    hint: 'Du kannst den Zugriff jederzeit in der App unter Geräte widerrufen.',
  },
  en: {
    title: 'Allow access',
    lead: (c: string) => `<b>${c}</b> wants to access Jarvis: read chats and act on your behalf.`,
    password: 'Password',
    allow: 'Allow',
    deny: 'Deny',
    wrong: 'That password is not correct.',
    blocked: 'Too many failed attempts. Please try again in 15 minutes.',
    noPassword: 'No password has been set yet. Set one in the Jarvis interface on your home network.',
    expired: 'This request has expired. Please start connecting again from the client.',
    hint: 'You can revoke access at any time in the app under Devices.',
  },
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function renderAuthorizePage(o: { lang: Lang; requestId?: string; clientName?: string; hasPassword?: boolean; error?: 'password' | 'blocked'; expired?: boolean }): string {
  const t = T[o.lang]
  let body: string
  if (o.expired || !o.requestId) body = `<p class="msg">${t.expired}</p>`
  else if (!o.hasPassword) body = `<p class="lead">${t.lead(esc(o.clientName ?? ''))}</p><p class="msg">${t.noPassword}</p>`
  else
    body = `<p class="lead">${t.lead(esc(o.clientName ?? ''))}</p>
      <form method="post" action="/oauth/decision">
        <input type="hidden" name="request_id" value="${esc(o.requestId)}">
        <label for="pw">${t.password}</label>
        <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
        ${o.error ? `<p class="err" role="alert">${o.error === 'blocked' ? t.blocked : t.wrong}</p>` : ''}
        <button class="primary" name="decision" value="allow" type="submit">${t.allow}</button>
        <button class="ghost" name="decision" value="deny" type="submit" formnovalidate>${t.deny}</button>
      </form>
      <p class="hint">${t.hint}</p>`
  return `<!doctype html>
<html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Jarvis · ${t.title}</title>
<style>
:root{--ground:#E9ECEF;--card:#fff;--ink:#15171A;--ink-2:#41474F;--muted:#5F6670;--line:#E4E7EB;--line-2:#D3D8DE;--block:#121416;--warn:#D9483B;--font:Urbanist,system-ui,sans-serif;color-scheme:light}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px 16px;background:var(--ground);color:var(--ink);font:400 15px/1.45 var(--font);-webkit-font-smoothing:antialiased}
main{width:100%;max-width:400px;background:var(--card);padding:28px 24px 24px;box-shadow:0 1px 1px rgba(20,26,36,.03),0 8px 22px -12px rgba(20,26,36,.14)}
.meta{font:italic 400 12px var(--font);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
h1{font:italic 300 30px/1.1 var(--font);letter-spacing:-.02em;margin:6px 0 16px}
.lead{margin:0 0 20px;color:var(--ink-2)}.lead b{font-weight:600;color:var(--ink)}
label{display:block;font:italic 400 13px var(--font);color:var(--muted);margin-bottom:6px}
input[type=password]{width:100%;font:inherit;padding:12px;border:1px solid var(--line-2);border-radius:0;background:#fff}
input[type=password]:focus{outline:1.5px solid var(--ink);outline-offset:0}
button{display:block;width:100%;font:inherit;border-radius:0;padding:14px;margin-top:12px;cursor:pointer}
.primary{background:var(--block);color:#F2F3F5;border:0;font-style:italic;margin-top:20px}
.ghost{background:transparent;color:var(--ink-2);border:1px solid var(--line-2)}
.err{color:var(--warn);margin:10px 0 0;font-size:14px}.msg{margin:0;color:var(--ink-2)}
.hint{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
</style></head>
<body><main><div class="meta">Jarvis${OWNER !== 'dich' ? ` · ${esc(OWNER)}` : ''}</div><h1>${t.title}</h1>${body}</main></body></html>`
}
