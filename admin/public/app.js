// Jarvis-Einstellungen: Single-Page-App ohne Build-Schritt und ohne externe Abhängigkeiten.
// Alle Texte aus Einstellungen oder Logs werden als Text eingefügt (nie als HTML).

// ---------------------------------------------------------------------------------------------
// Hilfsfunktionen

const ICONS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  tool: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
}

function icon(name, size = 18) {
  const span = document.createElement('span')
  span.className = 'ic'
  span.setAttribute('aria-hidden', 'true')
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`
  return span.firstChild
}

/** Element bauen: h('div', { class: 'x', onclick }, 'Text', kind) */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else if (k === 'value') el.value = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

const app = document.getElementById('app')
const mount = (...nodes) => app.replaceChildren(...nodes)

class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Fehler ${status}`)
    this.status = status
    this.data = data
  }
}

async function api(method, path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-jarvis': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, { error: 'Keine Verbindung zur Oberfläche. Läuft der Pi?' })
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (res.status === 401 && !path.startsWith('/auth')) {
    boot()
    throw new ApiError(401, data)
  }
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

function toast(msg, kind = '') {
  let box = document.querySelector('.toasts')
  if (!box) document.body.append((box = h('div', { class: 'toasts', role: 'status' })))
  const t = h('div', { class: `toast ${kind}` }, msg)
  box.append(t)
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500)
}

function alertBox(level, ...content) {
  const ic = { error: 'alert', warn: 'alert', info: 'info', ok: 'check' }[level] ?? 'info'
  return h('div', { class: `alert ${level}`, role: level === 'error' ? 'alert' : undefined }, icon(ic, 16), h('div', { class: 'body' }, ...content))
}

function modal({ title, body, foot, wide, onClose, dismissable = true }) {
  const close = () => {
    backdrop.remove()
    document.removeEventListener('keydown', onKey)
    onClose?.()
  }
  const onKey = (e) => e.key === 'Escape' && dismissable && close()
  const backdrop = h(
    'div',
    { class: 'backdrop', onclick: (e) => e.target === backdrop && dismissable && close() },
    h(
      'div',
      { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), dismissable ? h('button', { class: 'btn ghost icon-only', 'aria-label': 'Schließen', onclick: close }, icon('x')) : null),
      h('div', { class: 'modal-body' }, body),
      foot ? h('div', { class: 'modal-foot' }, foot) : null,
    ),
  )
  document.addEventListener('keydown', onKey)
  document.body.append(backdrop)
  backdrop.querySelector('input, button.primary, button')?.focus()
  return { close, el: backdrop }
}

/** Passwort erneut abfragen (für heikle Aktionen). Gibt das Passwort oder null zurück. */
function askPassword(title, text, confirmLabel = 'Bestätigen', danger = false) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Admin-Passwort' })
    let done = false
    const finish = (v) => {
      done = true
      m.close()
      resolve(v)
    }
    const go = () => input.value && finish(input.value)
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go())
    const m = modal({
      title,
      body: [typeof text === 'string' ? h('p', { class: 'muted' }, text) : text, h('label', { class: 'stack tight' }, h('span', { class: 'small muted' }, 'Zur Sicherheit dein Admin-Passwort'), input)],
      foot: [h('button', { class: 'btn ghost', onclick: () => finish(null) }, 'Abbrechen'), h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: go }, confirmLabel)],
      onClose: () => !done && resolve(null),
    })
    setTimeout(() => input.focus(), 30)
  })
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Kopiert.', 'ok')
  } catch {
    toast('Kopieren nicht möglich (Browser erlaubt es nur über HTTPS). Bitte markieren und kopieren.', 'error')
  }
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–')
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtNum = (n) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('de-DE'))
const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`)
function ago(iso) {
  if (!iso) return '–'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'gerade eben'
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`
  return `vor ${Math.round(s / 86400)} Tagen`
}
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`jarvis.${k}`)
      return v === null ? d : JSON.parse(v)
    } catch {
      return d
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`jarvis.${k}`, JSON.stringify(v))
    } catch {
      // egal
    }
  },
}

function brand() {
  return h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('chat', 17)), 'Jarvis')
}

// ---------------------------------------------------------------------------------------------
// Start, Zugang, Anmeldung

let S = { state: null }
let timers = []
const clearTimers = () => {
  timers.forEach((t) => clearInterval(t))
  timers = []
}

async function boot() {
  clearTimers()
  try {
    S.state = await api('GET', '/state')
  } catch (e) {
    return mount(h('div', { class: 'center' }, h('div', { class: 'card auth-card stack' }, brand(), alertBox('error', e.message), h('button', { class: 'btn', onclick: boot }, icon('refresh', 16), 'Erneut versuchen'))))
  }
  const st = S.state
  if (st.envProblem) return renderEnvProblem(st.envProblem)
  if (!st.configured) return renderAccessSetup()
  if (!st.loggedIn) return renderLogin()
  if (!st.initialized) return renderWizard()
  renderShell()
}

function renderEnvProblem(msg) {
  mount(
    h(
      'div',
      { class: 'center' },
      h(
        'div',
        { class: 'card auth-card stack' },
        brand(),
        h('h1', {}, 'Einstellungsdatei nicht erreichbar'),
        alertBox('error', msg),
        h('p', { class: 'muted small' }, 'Danach diese Seite neu laden. Die Dienste laufen unabhängig davon weiter.'),
        h('button', { class: 'btn', onclick: boot }, icon('refresh', 16), 'Neu laden'),
      ),
    ),
  )
}

function renderAccessSetup() {
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'mindestens 15 Zeichen' })
  const pw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'wiederholen' })
  const err = h('div')
  const btn = h('button', { class: 'btn primary l', type: 'submit' }, 'Zugang einrichten')
  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault()
        err.replaceChildren()
        if (pw.value !== pw2.value) return err.append(alertBox('error', 'Die Passwörter stimmen nicht überein.'))
        btn.disabled = true
        try {
          await api('POST', '/auth/setup', { password: pw.value })
          boot()
        } catch (ex) {
          err.append(alertBox('error', ex.message))
          btn.disabled = false
        }
      },
    },
    h('label', { class: 'stack tight' }, h('b', { class: 'small' }, 'Neues Admin-Passwort'), pw),
    h('label', { class: 'stack tight' }, pw2),
    err,
    btn,
  )
  mount(
    h(
      'div',
      { class: 'center' },
      h(
        'div',
        { class: 'card auth-card stack' },
        brand(),
        h('div', { class: 'stack tight' }, h('h1', {}, 'Willkommen'), h('p', { class: 'muted' }, 'Lege dein Besitzer-Passwort fest. Wer hier zuerst ein Passwort festlegt, wird Besitzer dieser Installation.')),
        form,
      ),
    ),
  )
  pw.focus()
}

function renderLogin() {
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Admin-Passwort' })
  const err = h('div')
  const btn = h('button', { class: 'btn primary l', type: 'submit' }, 'Anmelden')
  mount(
    h(
      'div',
      { class: 'center' },
      h(
        'div',
        { class: 'card auth-card stack' },
        brand(),
        h('h1', {}, 'Anmelden'),
        h(
          'form',
          {
            class: 'stack',
            onsubmit: async (e) => {
              e.preventDefault()
              err.replaceChildren()
              btn.disabled = true
              try {
                await api('POST', '/auth/login', { password: pw.value })
                boot()
              } catch (ex) {
                err.append(alertBox('error', ex.message))
                btn.disabled = false
                pw.select()
              }
            },
          },
          pw,
          err,
          btn,
          h('p', { class: 'small muted' }, 'Passwort vergessen? Auf dem Pi: ', h('code', {}, 'docker compose exec admin node dist/src/cli.js reset-password')),
        ),
      ),
    ),
  )
  pw.focus()
}

// ---------------------------------------------------------------------------------------------
// Felder (gemeinsam für Assistent und Einstellungen)

const ROTATABLE = new Set(['MCP_TOKEN', 'POSTGRES_PASSWORD', 'MCP_RO_PASSWORD'])

/**
 * Baut ein Eingabefeld. model: { value(key), secret(key), set(key, v|null), isChanged(key), initial }
 * Gibt { el, setError(msg) } zurück. Eingaben lösen model.set aus, ohne das ganze Formular neu zu zeichnen.
 */
function fieldControl(f, model) {
  const errEl = h('div', { class: 'err', role: 'alert' })
  const wrap = h('div', { class: 'field', 'data-key': f.key })
  const label = h('label', { class: 'label', for: `f-${f.key}` }, f.label)
  const id = `f-${f.key}`
  const cur = model.value(f.key)
  let control
  const markChanged = () => wrap.classList.toggle('changed', model.isChanged(f.key))

  const resetBtn = () =>
    !model.initial && f.type !== 'secret' && model.value(f.key) !== '' && model.value(f.key) !== f.default
      ? h('button', { class: 'btn ghost s', title: 'Auf Standard zurücksetzen', onclick: () => {
          model.set(f.key, null)
          rerender()
        } }, icon('reset', 14), 'Standard')
      : null

  const rerender = () => {
    const fresh = fieldControl(f, model)
    wrap.replaceWith(fresh.el)
    model.registerField?.(f.key, fresh)
  }

  switch (f.type) {
    case 'bool': {
      const on = (cur || f.default) === 'true'
      control = h('button', {
        class: 'switch', role: 'switch', id, 'aria-checked': String(on), 'aria-label': f.label,
        onclick: () => {
          const v = control.getAttribute('aria-checked') !== 'true'
          control.setAttribute('aria-checked', String(v))
          model.set(f.key, String(v))
          markChanged()
        },
      })
      wrap.append(h('div', { class: 'field-head' }, h('div', { class: 'stack tight grow' }, label, h('div', { class: 'help' }, f.help)), control), errEl)
      markChanged()
      return { el: wrap, setError: (m) => (errEl.textContent = m ?? '') }
    }
    case 'enum': {
      const val = cur || f.default
      if (f.options.length <= 4) {
        control = h('div', { class: 'seg', role: 'group', 'aria-label': f.label })
        for (const o of f.options) {
          control.append(
            h('button', {
              type: 'button', 'aria-pressed': String(o.value === val),
              onclick: () => {
                for (const b of control.children) b.setAttribute('aria-pressed', 'false')
                control.children[f.options.indexOf(o)].setAttribute('aria-pressed', 'true')
                model.set(f.key, o.value)
                markChanged()
              },
            }, o.label),
          )
        }
      } else {
        control = h('select', { class: 'input', id, onchange: () => (model.set(f.key, control.value), markChanged()) }, f.options.map((o) => h('option', { value: o.value, selected: o.value === val }, o.label)))
      }
      break
    }
    case 'secret':
      control = secretControl(f, model, rerender)
      break
    default: {
      const input = h('input', {
        class: `input${f.type === 'phone' || f.key.includes('MODEL') ? ' mono' : ''}`,
        id, value: cur, placeholder: f.placeholder ?? (f.default !== '' ? f.default : ''), spellcheck: 'false', autocomplete: 'off',
        inputmode: f.type === 'int' ? 'numeric' : f.type === 'float' ? 'decimal' : f.type === 'phone' ? 'tel' : undefined,
        oninput: () => {
          model.set(f.key, input.value.trim() === '' ? null : input.value)
          markChanged()
          if (chips) renderChips()
        },
      })
      let chips = null
      const renderChips = () => chips.replaceChildren(...input.value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => h('span', { class: 'chip' }, s)))
      control = h('div', { class: 'stack tight' }, h('div', { class: 'input-wrap' }, input, f.unit ? h('span', { class: 'unit' }, f.unit) : null))
      if (f.type === 'list') {
        chips = h('div', { class: 'chips' })
        control.append(chips)
        renderChips()
      }
      control.input = input
    }
  }

  const meta = h('div', { class: 'meta' })
  const metaParts = []
  if (f.default !== '' && f.type !== 'bool' && f.type !== 'secret') metaParts.push(h('span', {}, 'Standard: ', h('code', {}, f.options?.find((o) => o.value === f.default)?.label ?? f.default)))
  if (f.services?.length) metaParts.push(h('span', {}, `betrifft ${f.services.join(', ')}`))
  metaParts.forEach((p, i) => meta.append(...(i ? [h('span', { 'aria-hidden': 'true' }, '·'), p] : [p])))
  const rb = resetBtn()
  wrap.append(h('div', { class: 'field-head' }, h('div', { class: 'stack tight grow' }, label, h('div', { class: 'help' }, f.help)), rb), control, meta, errEl)
  markChanged()
  return {
    el: wrap,
    setError: (m) => {
      errEl.textContent = m ?? ''
      control.input?.classList.toggle('invalid', !!m)
    },
  }
}

function secretControl(f, model, rerender) {
  const st = model.secret(f.key)
  const pendingVal = model.pending?.(f.key)
  const editing = typeof pendingVal === 'string' || !st.set || model.initial
  const box = h('div', { class: 'stack tight' })
  if (editing && !(ROTATABLE.has(f.key) && st.set && !model.initial)) {
    const input = h('input', {
      class: 'input mono', type: 'password', autocomplete: 'new-password', spellcheck: 'false',
      value: typeof pendingVal === 'string' ? pendingVal : '', placeholder: st.set ? 'Neuen Wert eingeben' : f.generate ? 'leer lassen = automatisch erzeugen' : 'einfügen',
      oninput: () => {
        model.set(f.key, input.value.trim() === '' ? (st.set ? '' : null) : input.value)
        rerenderMark()
      },
    })
    const show = h('button', { class: 'btn s ghost', type: 'button', title: 'Eingabe anzeigen', onclick: () => (input.type = input.type === 'password' ? 'text' : 'password') }, icon('eye', 15))
    const row = h('div', { class: 'input-wrap' }, input, show)
    if (f.key === 'OPENAI_API_KEY') row.append(h('button', { class: 'btn s', type: 'button', onclick: () => testOpenAi(input.value, testOut) }, 'Testen'))
    if (st.set) row.append(h('button', { class: 'btn s ghost', type: 'button', onclick: () => (model.set(f.key, undefined), rerender()) }, 'Abbrechen'))
    const testOut = h('div')
    box.append(row, testOut)
    box.input = input
    const rerenderMark = () => box.closest('.field')?.classList.toggle('changed', model.isChanged(f.key))
    return box
  }
  const removing = pendingVal === null
  const actions = h('div', { class: 'row' })
  if (ROTATABLE.has(f.key)) {
    actions.append(h('button', { class: 'btn s', type: 'button', onclick: () => rotate(f) }, icon('refresh', 14), 'Wechseln'))
    if (f.key === 'MCP_TOKEN') actions.append(h('button', { class: 'btn s ghost', type: 'button', onclick: () => reveal(f.key) }, icon('eye', 14), 'Anzeigen'))
  } else if (!removing) {
    actions.append(h('button', { class: 'btn s', type: 'button', onclick: () => (model.set(f.key, ''), rerender()) }, 'Ändern'))
    if (f.key === 'OPENAI_API_KEY') actions.append(h('button', { class: 'btn s ghost', type: 'button', onclick: () => testOpenAi('', testOut) }, 'Testen'))
    if (!f.required) actions.append(h('button', { class: 'btn s danger', type: 'button', onclick: () => (model.set(f.key, null), rerender()) }, 'Entfernen'))
  } else {
    actions.append(h('button', { class: 'btn s ghost', type: 'button', onclick: () => (model.set(f.key, undefined), rerender()) }, 'Rückgängig'))
  }
  const testOut = h('div')
  box.append(
    h('div', { class: 'secret-box' },
      h('span', { class: 'state grow' }, removing ? [h('span', { class: 'dot warn' }), 'Wird entfernt'] : [h('span', { class: 'dot ok' }), 'Gesetzt ', h('code', { class: 'faint' }, st.hint ?? '')]),
      actions),
    testOut,
  )
  return box
}

async function testOpenAi(key, out) {
  out.replaceChildren(h('div', { class: 'row small muted' }, h('div', { class: 'spinner s' }), 'Prüfe beim Anbieter …'))
  try {
    const r = await api('POST', '/test/openai', { key: key || undefined })
    out.replaceChildren(alertBox(r.ok ? 'ok' : 'error', r.message))
  } catch (e) {
    out.replaceChildren(alertBox('error', e.message))
  }
}

async function reveal(key) {
  const pw = await askPassword('Token anzeigen', 'Der Token erlaubt vollen Zugriff auf deine Chats. Nicht in Screenshots zeigen.', 'Anzeigen')
  if (!pw) return
  try {
    const r = await api('POST', '/reveal', { key, password: pw })
    modal({ title: 'MCP-Token', body: [h('div', { class: 'copy-line' }, h('code', {}, r.value), h('button', { class: 'btn s', onclick: () => copy(r.value) }, icon('copy', 14), 'Kopieren'))] })
  } catch (e) {
    toast(e.message, 'error')
  }
}

async function rotate(f) {
  const texts = {
    MCP_TOKEN: 'Erzeugt einen neuen Token. Die bisherige Connector-URL funktioniert danach nicht mehr; in Claude den Connector mit der neuen URL neu einrichten.',
    POSTGRES_PASSWORD: 'Erzeugt ein neues Datenbank-Passwort, stellt die Datenbank um und startet die Dienste neu. Schlägt etwas fehl, wird alles automatisch zurückgesetzt.',
    MCP_RO_PASSWORD: 'Erzeugt ein neues Passwort für die Rollen mcp_ro, mcp_act und mcp_mem, stellt die Datenbank um und startet den MCP-Server neu. Bei Fehler automatisch zurück.',
  }
  const pw = await askPassword(`${f.label} wechseln`, texts[f.key], 'Jetzt wechseln')
  if (!pw) return
  try {
    const r = await api('POST', '/rotate', { key: f.key, password: pw })
    openJob(r.job, { onDone: () => route(S.page) })
  } catch (e) {
    if (e.data?.job) openJob(e.data.job)
    toast(e.message, 'error')
  }
}

// ---------------------------------------------------------------------------------------------
// Vorgänge (Anwenden, Neustart …) mit Live-Protokoll

const STATUS = {
  running: ['info', 'läuft'],
  ok: ['ok', 'erfolgreich'],
  failed: ['error', 'fehlgeschlagen'],
  rolled_back: ['warn', 'zurückgesetzt'],
  interrupted: ['error', 'unterbrochen'],
}

function statusBadge(s) {
  const [cls, txt] = STATUS[s] ?? ['', s]
  return h('span', { class: `badge ${cls}` }, s === 'running' ? h('span', { class: 'dot pulse' }) : null, txt)
}

function openJob(job, { onDone, title } = {}) {
  const log = h('div', { class: 'joblog', role: 'log' })
  const badge = h('span')
  const result = h('div')
  const closeBtn = h('button', { class: 'btn' }, 'Im Hintergrund weiterlaufen lassen')
  let n = 0
  let stopped = false
  const m = modal({
    title: title ?? job.title,
    wide: true,
    body: [h('div', { class: 'row between' }, badge, h('span', { class: 'small faint' }, `gestartet ${fmtTime(job.startedAt)}`)), log, result],
    foot: [closeBtn],
    onClose: () => (stopped = true),
  })
  closeBtn.onclick = () => m.close()
  const add = (lines) => {
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40
    for (const l of lines) log.append(h('div', { class: 'l' }, h('span', { class: 't' }, fmtTime(l.t)), h('span', { class: l.level }, l.msg)))
    if (atBottom) log.scrollTop = log.scrollHeight
  }
  const tick = async () => {
    if (stopped) return
    try {
      const r = await api('GET', `/jobs/${job.id}?since=${n}`)
      add(r.job.lines)
      n = r.total
      badge.replaceChildren(statusBadge(r.job.status))
      if (r.job.status !== 'running') {
        closeBtn.textContent = 'Schließen'
        closeBtn.className = 'btn primary'
        const msg = {
          ok: ['ok', 'Erledigt. Alles läuft.'],
          failed: ['error', 'Fehlgeschlagen. Details im Protokoll. Es wurde nichts Kaputtes hinterlassen, soweit ein früherer Stand existierte.'],
          rolled_back: ['warn', 'Die Änderung hat einen Dienst gestört und wurde automatisch zurückgenommen. Der vorherige Stand läuft wieder.'],
          interrupted: ['error', 'Der Vorgang wurde unterbrochen. Bitte unter Übersicht den Zustand prüfen.'],
        }[r.job.status]
        if (msg) result.replaceChildren(alertBox(msg[0], msg[1]))
        onDone?.(r.job)
        refreshJobIndicator()
        return
      }
    } catch (e) {
      if (e.status === 401) return
    }
    setTimeout(tick, 900)
  }
  tick()
  refreshJobIndicator()
  return m
}

let jobIndicator = null
async function refreshJobIndicator() {
  if (!jobIndicator) return
  try {
    const st = await api('GET', '/state')
    jobIndicator.replaceChildren()
    if (st.job) jobIndicator.append(h('button', { class: 'btn s', onclick: () => openJob(st.job) }, h('span', { class: 'dot pulse' }), st.job.title))
  } catch {
    // egal
  }
}

// ---------------------------------------------------------------------------------------------
// Assistent für die Ersteinrichtung

async function renderWizard() {
  const [settings, info] = await Promise.all([api('GET', '/settings'), api('GET', '/setup/info').catch(() => ({}))])
  const F = Object.fromEntries(settings.fields.map((f) => [f.key, f]))
  const values = { ...settings.values }
  for (const k of Object.keys(settings.secrets)) values[k] = ''
  const w = { step: 0, values, info, preview: null }

  const model = {
    initial: true,
    value: (k) => w.values[k] ?? '',
    secret: () => ({ set: false }),
    pending: (k) => w.values[k] || undefined,
    set: (k, v) => {
      if (v === null || v === undefined) delete w.values[k]
      else w.values[k] = v
    },
    isChanged: () => false,
    registerField: (k, ref) => (fieldRefs[k] = ref),
  }
  const changes = () => Object.fromEntries(Object.entries(w.values).filter(([, v]) => v !== '' && v !== undefined))

  const steps = [
    {
      title: 'Willkommen bei Jarvis',
      lead: 'In wenigen Schritten richtest du dein persönliches WhatsApp-Archiv ein. Alles bleibt auf deinem Pi; jede Einstellung lässt sich später ändern.',
      keys: ['OWNER_NAME', 'OWN_NAMES'],
      extra: () =>
        info.pgdataExists
          ? [alertBox('warn', h('b', {}, 'Bestehende Datenbank gefunden. '), 'Offenbar lief Jarvis hier schon einmal. Damit die Daten erreichbar bleiben, trage im Schritt „Datenbank" die alten Passwörter ein.')]
          : [],
    },
    ...(info.pgdataExists
      ? [{
          title: 'Datenbank',
          lead: 'Die vorhandene Datenbank wurde mit diesen Passwörtern angelegt. Du findest sie in einer alten .env oder in deinem Passwort-Manager.',
          keys: ['POSTGRES_PASSWORD', 'MCP_RO_PASSWORD'],
          validate: () => (w.values.POSTGRES_PASSWORD && w.values.MCP_RO_PASSWORD ? null : 'Bitte beide Passwörter der bestehenden Datenbank eintragen.'),
        }]
      : []),
    {
      title: 'KI-Anbieter (optional)',
      lead: 'Mit einem OpenAI-Schlüssel werden Sprachnachrichten schnell transkribiert, Bilder beschrieben und Themen sortiert. Ohne Schlüssel bleiben Archiv und Suche lokal; Sprachnachrichten werden nicht transkribiert.',
      keys: ['OPENAI_API_KEY'],
    },
    {
      title: 'Datenschutz',
      lead: 'Lege fest, was nie an die KI gehen darf. Das gilt ab der ersten Nachricht.',
      keys: ['ORGANIZER_EXCLUDE_NAMES', 'ORGANIZER_REDACT'],
    },
    {
      title: 'Funktionen',
      lead: 'Was soll Jarvis tun dürfen?',
      keys: ['ENABLE_ACTIONS', 'REQUIRE_CONFIRM', 'MAX_ACTIONS_PER_HOUR', 'ENABLE_MEMORY', 'ORGANIZER_ENABLED', 'IMAGE_DESCRIBE', 'TRANSCRIBE_PROVIDER'],
    },
    {
      title: 'Fernzugriff für Claude',
      lead: 'Claude erreicht Jarvis über einen Cloudflare-Tunnel. Du kannst ihn auch später einrichten.',
      keys: ['CLOUDFLARE_TUNNEL_TOKEN', 'MCP_PUBLIC_HOST'],
      extra: () => [h('ol', { class: 'steps-list small' },
        h('li', {}, 'Cloudflare Zero Trust → Networks → Tunnels → Create (Cloudflared).'),
        h('li', {}, 'Token (oder den ganzen Installationsbefehl) hier einfügen.'),
        h('li', {}, 'Public Hostname anlegen, Dienst: ', h('code', {}, 'http://mcp-server:3000'), '.'))],
    },
    {
      title: 'WhatsApp verknüpfen',
      lead: 'Nach dem Start erscheint hier ein QR-Code. Alternativ verknüpfst du per Telefonnummer und Kopplungscode.',
      keys: ['WA_PAIRING_PHONE'],
    },
    { title: 'Zusammenfassung', lead: 'Prüfe die Einstellungen. Fehlende Passwörter und der MCP-Token werden sicher erzeugt.', summary: true },
  ]

  const errBox = h('div')
  const body = h('div', { class: 'stack' })
  const stepBar = h('div', { class: 'steps', 'aria-hidden': 'true' })
  const back = h('button', { class: 'btn ghost', onclick: () => go(w.step - 1) }, 'Zurück')
  const next = h('button', { class: 'btn primary l' })
  let fieldRefs = {}

  const runPreview = async () => {
    w.preview = await api('POST', '/settings/preview', { changes: changes(), initial: true })
    return w.preview
  }

  async function go(i) {
    w.step = Math.max(0, Math.min(steps.length - 1, i))
    const s = steps[w.step]
    errBox.replaceChildren()
    stepBar.replaceChildren(...steps.map((_, j) => h('span', { class: j < w.step ? 'done' : j === w.step ? 'now' : '' })))
    fieldRefs = {}
    const content = []
    if (s.keys) {
      const card = h('div', { class: 'card flat' })
      for (const k of s.keys) {
        if (!F[k]) continue
        const fc = fieldControl(F[k], model)
        fieldRefs[k] = fc
        card.append(fc.el)
      }
      content.push(card)
    }
    if (s.extra) content.push(...s.extra())
    if (s.summary) content.push(await summary())
    body.replaceChildren(h('div', { class: 'stack tight' }, h('span', { class: 'small faint' }, `Schritt ${w.step + 1} von ${steps.length}`), h('h1', {}, s.title), h('p', { class: 'lead' }, s.lead)), ...content, errBox)
    back.classList.toggle('hidden', w.step === 0)
    next.textContent = s.summary ? 'Jarvis jetzt starten' : 'Weiter'
    window.scrollTo(0, 0)
  }

  async function summary() {
    const p = await runPreview()
    const list = h('dl', { class: 'kv' })
    const show = (k, v) => list.append(h('dt', {}, F[k]?.label ?? k), h('dd', {}, v))
    show('OWNER_NAME', w.values.OWNER_NAME || '–')
    show('OPENAI_API_KEY', w.values.OPENAI_API_KEY ? 'gesetzt' : 'keiner (Transkription aus)')
    show('ORGANIZER_EXCLUDE_NAMES', w.values.ORGANIZER_EXCLUDE_NAMES || '–')
    show('CLOUDFLARE_TUNNEL_TOKEN', w.values.CLOUDFLARE_TUNNEL_TOKEN ? 'gesetzt' : 'später')
    show('WA_PAIRING_PHONE', w.values.WA_PAIRING_PHONE ? `Kopplungscode für ${w.values.WA_PAIRING_PHONE}` : 'QR-Code')
    list.append(h('dt', {}, 'Dienste'), h('dd', {}, ['postgres', 'embedder', 'wa-ingest', 'mcp-server', ...(p.profiles ? p.profiles.split(',') : [])].join(', ')))
    const out = [h('div', { class: 'card flat' }, list)]
    for (const c of p.checks) out.push(alertBox(c.level, c.message))
    const errs = Object.entries(p.errors)
    if (errs.length) out.push(alertBox('error', 'Bitte korrigieren: ', errs.map(([k, e]) => `${F[k]?.label ?? k}: ${e}`).join(' · ')))
    out.push(h('p', { class: 'small muted' }, 'Beim ersten Start werden die Container gebaut. Auf einem Raspberry Pi dauert das 10 bis 30 Minuten; du kannst die Seite währenddessen schließen.'))
    return h('div', { class: 'stack' }, out)
  }

  next.onclick = async () => {
    const s = steps[w.step]
    errBox.replaceChildren()
    next.disabled = true
    try {
      const p = await runPreview()
      let bad = false
      for (const [k, ref] of Object.entries(fieldRefs)) {
        ref.setError(p.errors[k])
        if (p.errors[k]) bad = true
      }
      const custom = s.validate?.()
      if (custom) {
        errBox.append(alertBox('error', custom))
        bad = true
      }
      if (bad) return
      if (!s.summary) return go(w.step + 1)
      const blocking = p.checks.filter((c) => c.level === 'error')
      if (Object.keys(p.errors).length || blocking.length) {
        errBox.append(alertBox('error', 'Es gibt noch Fehler (siehe oben).'))
        return
      }
      const r = await api('POST', '/apply', { changes: changes(), initial: true })
      openJob(r.job, { title: 'Jarvis wird eingerichtet', onDone: afterSetup })
    } catch (e) {
      if (e.data?.errors) for (const [k, ref] of Object.entries(fieldRefs)) ref.setError(e.data.errors[k])
      errBox.append(alertBox('error', e.message))
      if (e.data?.job) openJob(e.data.job)
    } finally {
      next.disabled = false
    }
  }

  mount(
    h('div', { class: 'wizard' },
      h('div', { class: 'row between' }, brand(), h('button', { class: 'btn ghost s', onclick: logout }, icon('logout', 15), 'Abmelden')),
      stepBar,
      h('div', { class: 'card' }, body),
      h('div', { class: 'row between wizard-nav' }, back, next)),
  )
  if (S.state.job) openJob(S.state.job, { onDone: afterSetup })
  go(0)

  function afterSetup(job) {
    if (job.status === 'ok') return renderWizardLink()
    // .env ist geschrieben, aber ein Dienst startet nicht: in der Oberfläche korrigieren
    errBox.replaceChildren(alertBox('error', 'Der Start hat nicht geklappt (Details im Protokoll). Die Einstellungen sind gespeichert; korrigiere sie in der Oberfläche und wende sie erneut an.'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => (document.querySelectorAll('.backdrop').forEach((b) => b.remove()), boot()) }, 'Zur Oberfläche')))
  }
}

/** Nach dem Start: WhatsApp verknüpfen, dann fertig. */
function renderWizardLink() {
  document.querySelectorAll('.backdrop').forEach((b) => b.remove())
  const box = h('div', { class: 'stack' })
  const doneBtn = h('button', { class: 'btn primary l', onclick: () => renderWizardDone() }, 'Weiter')
  mount(
    h('div', { class: 'wizard' }, brand(),
      h('div', { class: 'steps', 'aria-hidden': 'true' }, h('span', { class: 'done' }), h('span', { class: 'done' }), h('span', { class: 'now' })),
      h('div', { class: 'card stack' }, h('h1', {}, 'WhatsApp verknüpfen'), h('p', { class: 'lead' }, 'Jarvis läuft. Jetzt das Handy verbinden.'), box),
      h('div', { class: 'row end wizard-nav' }, h('button', { class: 'btn ghost', onclick: () => renderWizardDone() }, 'Später'), doneBtn)),
  )
  const t = waPanel(box, () => (doneBtn.textContent = 'Fertig'))
  timers.push(t)
}

function renderWizardDone() {
  clearTimers()
  mount(
    h('div', { class: 'wizard' }, brand(),
      h('div', { class: 'card stack' },
        h('div', { class: 'card-head' }, h('span', { class: 'icon' }, icon('check')), h('div', { class: 'titles' }, h('h1', {}, 'Geschafft'), h('p', {}, 'Jarvis ist eingerichtet.'))),
        connectorCard(),
        h('p', { class: 'muted' }, 'Alle Einstellungen, Status, Logs und Wartung findest du in der Oberfläche.'),
        h('div', { class: 'row end' }, h('button', { class: 'btn primary l', onclick: () => boot() }, 'Zur Übersicht')))),
  )
}

// ---------------------------------------------------------------------------------------------
// WhatsApp-Bereich

function waPanel(box, onOpen) {
  const render = async () => {
    let wa
    try {
      wa = await api('GET', '/wa')
    } catch {
      return
    }
    const steps = h('ol', { class: 'steps-list' },
      h('li', {}, 'WhatsApp am Handy öffnen'),
      h('li', {}, 'Einstellungen → Verknüpfte Geräte → Gerät hinzufügen'),
      h('li', {}, wa.state === 'pairing' ? '„Stattdessen mit Telefonnummer verknüpfen" und den Code eingeben' : 'Den QR-Code scannen'))
    const states = {
      open: () => [alertBox('ok', h('b', {}, 'Verbunden'), wa.user ? ` (${wa.user})` : '', ` · seit ${ago(wa.at)}`)],
      qr: () => (wa.qrSvg
        ? [h('div', { class: 'wa-layout' }, svgBox(wa.qrSvg), h('div', { class: 'stack' }, h('h3', {}, 'Mit dem Handy scannen'), steps, h('p', { class: 'small faint' }, 'Der Code erneuert sich automatisch.')))]
        : [alertBox('info', 'Der QR-Code ist abgelaufen; ein neuer kommt gleich …')]),
      pairing: () => [h('div', { class: 'stack' }, h('div', { class: 'pair-code' }, wa.pairingCode ?? '…'), steps)],
      starting: () => [h('div', { class: 'row muted' }, h('div', { class: 'spinner s' }), 'wa-ingest startet …')],
      closed: () => [alertBox('warn', 'Verbindung getrennt, wird neu aufgebaut …', wa.error ? h('div', { class: 'small faint' }, wa.error) : '')],
      logged_out: () => [alertBox('error', h('b', {}, 'Abgemeldet. '), 'Das Handy hat die Verknüpfung entfernt. Unten „Neu verknüpfen" wählen.')],
      unknown: () => [h('div', { class: 'row muted' }, h('div', { class: 'spinner s' }), 'Warte auf wa-ingest …')],
    }
    box.replaceChildren(...(states[wa.state] ?? states.unknown)())
    if (wa.state === 'open') onOpen?.()
  }
  render()
  return setInterval(render, 2500)
}

function svgBox(svg) {
  const d = h('div', { class: 'qr', role: 'img', 'aria-label': 'QR-Code für WhatsApp' })
  d.innerHTML = svg // vom Server erzeugtes SVG (qrcode-Paket), keine Nutzereingabe
  return d
}

// ---------------------------------------------------------------------------------------------
// Hauptoberfläche

const PAGES = [
  { id: 'overview', label: 'Übersicht', icon: 'home' },
  { id: 'settings', label: 'Einstellungen', icon: 'sliders' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { id: 'logs', label: 'Logs', icon: 'terminal' },
  { id: 'maintenance', label: 'Wartung', icon: 'tool' },
  { id: 'versions', label: 'Versionen', icon: 'history' },
]

let mainEl = null
let sideEl = null

function renderShell() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Bereiche' })
  for (const p of PAGES) nav.append(h('button', { 'data-page': p.id, onclick: () => (location.hash = p.id) }, icon(p.icon), p.label))
  jobIndicator = h('div')
  sideEl = h('aside', { class: 'side' },
    h('div', { class: 'row between' }, brand(), h('button', { class: 'btn ghost icon-only menu-close', 'aria-label': 'Menü schließen', onclick: () => sideEl.classList.remove('open') }, icon('x'))),
    nav,
    h('div', { class: 'foot' }, jobIndicator, S.state.fake ? h('span', { class: 'badge warn' }, 'Entwicklungsmodus') : null, h('button', { class: 'btn ghost', onclick: logout }, icon('logout', 16), 'Abmelden')))
  mainEl = h('main', { class: 'main', id: 'main' })
  mount(
    h('div', { class: 'topbar' }, brand(), h('button', { class: 'btn ghost icon-only', 'aria-label': 'Menü', onclick: () => sideEl.classList.add('open') }, icon('menu'))),
    h('div', { class: 'shell' }, sideEl, mainEl),
  )
  refreshJobIndicator()
  route(location.hash.slice(1) || 'overview')
}

window.addEventListener('hashchange', () => mainEl?.isConnected && route(location.hash.slice(1) || 'overview'))
window.addEventListener('beforeunload', (e) => {
  if (settingsModel && Object.keys(settingsModel.changes).length) e.preventDefault()
})

async function route(page) {
  if (!PAGES.some((p) => p.id === page)) page = 'overview'
  if (S.page === 'settings' && page !== 'settings' && settingsModel && Object.keys(settingsModel.changes).length) {
    if (!confirm('Es gibt nicht angewendete Änderungen. Verwerfen?')) {
      location.hash = 'settings'
      return
    }
  }
  clearTimers()
  document.querySelector('.changebar')?.remove()
  settingsModel = null
  S.page = page
  sideEl?.classList.remove('open')
  for (const b of sideEl?.querySelectorAll('.nav button') ?? []) {
    if (b.dataset.page === page) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  }
  mainEl.replaceChildren(h('div', { class: 'boot' }, h('div', { class: 'spinner' })))
  try {
    await { overview, settings: settingsPage, whatsapp, logs, maintenance, versions }[page]()
  } catch (e) {
    if (e.status !== 401) mainEl.replaceChildren(alertBox('error', e.message))
  }
  mainEl.focus?.()
}

const pageHead = (title, sub, ...actions) => h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', {}, sub) : null), actions.length ? h('div', { class: 'row' }, actions) : null)

function card(iconName, title, sub, ...content) {
  return h('section', { class: 'card' }, h('div', { class: 'card-head' }, iconName ? h('span', { class: 'icon' }, icon(iconName)) : null, h('div', { class: 'titles' }, h('h2', {}, title), sub ? h('p', {}, sub) : null)), ...content)
}

async function logout() {
  await api('POST', '/auth/logout').catch(() => {})
  boot()
}

// --- Übersicht -------------------------------------------------------------------------------

const SVC_LABEL = { postgres: 'Datenbank', embedder: 'Embeddings', 'wa-ingest': 'WhatsApp', 'mcp-server': 'MCP-Server', organizer: 'Themen-Sortierung', cloudflared: 'Cloudflare-Tunnel', admin: 'Diese Oberfläche' }

function svcDot(s) {
  if (s.state === 'running' && (!s.health || s.health === 'healthy')) return ['ok', s.health === 'healthy' ? 'gesund' : 'läuft']
  if (s.state === 'running' && s.health === 'starting') return ['warn', 'startet']
  if (s.state === 'restarting') return ['error', 'startet immer wieder neu']
  if (s.health === 'unhealthy') return ['error', 'gestört']
  return ['error', s.state]
}

async function overview() {
  const head = pageHead('Übersicht', 'Zustand von Jarvis auf einen Blick.')
  const body = h('div', { class: 'stack' })
  mainEl.replaceChildren(head, body)
  const conn = connectorCard()
  const render = async () => {
    const st = await api('GET', '/status')
    const svc = card('layers', 'Dienste', st.servicesError ? null : `${st.services.filter((s) => svcDot(s)[0] === 'ok').length} von ${st.services.length} laufen`)
    if (st.servicesError) svc.append(alertBox('error', st.servicesError))
    const list = h('div', { class: 'list' })
    for (const s of st.services.sort((a, b) => a.service.localeCompare(b.service))) {
      const [cls, txt] = svcDot(s)
      list.append(h('div', { class: 'item' }, h('span', { class: `dot ${cls}` }), h('div', { class: 'grow' }, h('b', {}, SVC_LABEL[s.service] ?? s.service), h('div', { class: 'small faint mono' }, s.service)), h('span', { class: `badge ${cls}` }, txt)))
    }
    if (!st.services.length && !st.servicesError) list.append(h('p', { class: 'muted' }, 'Keine Container gefunden.'))
    svc.append(list)

    const waState = { open: ['ok', 'Verbunden'], qr: ['warn', 'Wartet auf QR-Scan'], pairing: ['warn', 'Wartet auf Kopplungscode'], closed: ['warn', 'Getrennt'], logged_out: ['error', 'Abgemeldet'], starting: ['warn', 'Startet'], unknown: ['', 'Unbekannt'] }[st.wa.state] ?? ['', st.wa.state]
    const wa = card('chat', 'WhatsApp', null,
      h('div', { class: 'row between' }, h('span', { class: `badge ${waState[0]}` }, h('span', { class: `dot ${waState[0]}` }), waState[1]), h('button', { class: 'btn s', onclick: () => (location.hash = 'whatsapp') }, st.wa.state === 'open' ? 'Details' : 'Verknüpfen')),
      st.db?.heartbeat ? h('p', { class: 'small muted' }, `Letztes Lebenszeichen ${ago(st.db.heartbeat)}`) : null)

    const db = st.db
    const data = card('search', 'Archiv', null, db
      ? h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtNum(db.messages)), h('div', { class: 'k' }, 'Nachrichten (ca.)')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, ago(db.lastMessage)), h('div', { class: 'k' }, 'letzte Nachricht')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtNum(db.embedPending)), h('div', { class: 'k' }, 'noch ohne Embedding')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtNum(db.audioPending)), h('div', { class: 'k' }, 'Sprachnachrichten offen')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtNum(db.outboxPending)), h('div', { class: 'k' }, 'Aktionen in Warteschlange')),
        db.tokensToday !== null ? h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtNum(db.tokensToday)), h('div', { class: 'k' }, 'KI-Token heute')) : null,
        st.disk ? h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtBytes(st.disk.free)), h('div', { class: 'k' }, `frei von ${fmtBytes(st.disk.total)}`)) : null)
      : alertBox('warn', 'Datenbank nicht erreichbar.'))

    const checks = st.checks.filter((c) => c.level !== 'info')
    const hints = card('shield', 'Hinweise', checks.length ? null : 'Keine Auffälligkeiten.',
      checks.length ? h('div', { class: 'stack tight' }, checks.map((c) => alertBox(c.level, c.message))) : null,
      st.disk && st.disk.free < 2e9 ? alertBox('warn', 'Wenig freier Speicher auf dem Pi.') : null)

    body.replaceChildren(h('div', { class: 'grid' }, wa, hints), svc, data, conn)
  }
  await render()
  timers.push(setInterval(() => render().catch(() => {}), 6000))
}

function connectorCard() {
  const out = h('div', { class: 'stack tight' })
  const c = card('key', 'Connector für Claude', 'Diese URL trägst du in Claude unter Einstellungen → Connectors ein.', out)
  const show = async () => {
    const pw = await askPassword('Connector-URL anzeigen', 'Die URL enthält deinen geheimen Token.', 'Anzeigen')
    if (!pw) return
    try {
      const [{ value }, s] = await Promise.all([api('POST', '/reveal', { key: 'MCP_TOKEN', password: pw }), api('GET', '/settings')])
      const host = s.values.MCP_PUBLIC_HOST
      const url = host ? `https://${host}/t/${value}/mcp` : `http://localhost:3000/t/${value}/mcp`
      out.replaceChildren(
        h('div', { class: 'copy-line' }, h('code', {}, url), h('button', { class: 'btn s', onclick: () => copy(url) }, icon('copy', 14), 'Kopieren')),
        ...(host ? [] : [alertBox('info', 'Kein öffentlicher Hostname eingetragen. Diese Adresse funktioniert nur auf dem Pi selbst. Hostname unter Einstellungen → Zugang & Fernzugriff eintragen.')]),
      )
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  out.append(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: show }, icon('eye', 16), 'URL anzeigen')))
  return c
}

// --- Einstellungen ---------------------------------------------------------------------------

let settingsModel = null

async function settingsPage() {
  const s = await api('GET', '/settings')
  const F = Object.fromEntries(s.fields.map((f) => [f.key, f]))
  const showExpert = store.get('expert', false)
  const model = {
    initial: false,
    changes: {},
    fieldRefs: {},
    value: (k) => (k in model.changes && typeof model.changes[k] === 'string' ? model.changes[k] : k in model.changes ? '' : s.values[k] ?? ''),
    secret: (k) => s.secrets[k] ?? { set: false },
    pending: (k) => model.changes[k],
    // undefined = Änderung verwerfen, null = auf Standard bzw. entfernen, '' (nur Geheimnisse) = wird gerade bearbeitet
    set: (k, v) => {
      const secret = k in s.secrets
      const def = F[k]?.default ?? ''
      const eff = (x) => (x === null || x === undefined || x === '' ? def : x)
      if (v === undefined) delete model.changes[k]
      else if (secret && v === null && !s.secrets[k].set) delete model.changes[k]
      else if (!secret && eff(v) === eff(s.values[k] ?? '')) delete model.changes[k]
      else model.changes[k] = v
      schedulePreview()
    },
    isChanged: (k) => k in model.changes && !(k in s.secrets && model.changes[k] === ''),
    registerField: (k, ref) => (model.fieldRefs[k] = ref),
  }
  settingsModel = model

  const bar = h('div', { class: 'changebar hidden', role: 'region', 'aria-label': 'Änderungen' })
  document.body.append(bar)

  let previewTimer = null
  let lastPreview = null
  const effectiveChanges = () => Object.fromEntries(Object.entries(model.changes).filter(([k, v]) => !(k in s.secrets && v === '')))
  function schedulePreview() {
    clearTimeout(previewTimer)
    previewTimer = setTimeout(runPreview, 300)
  }
  async function runPreview() {
    const ch = effectiveChanges()
    if (!Object.keys(ch).length) {
      lastPreview = null
      for (const ref of Object.values(model.fieldRefs)) ref.setError(null)
      bar.classList.add('hidden')
      return
    }
    try {
      lastPreview = await api('POST', '/settings/preview', { changes: ch })
    } catch (e) {
      return toast(e.message, 'error')
    }
    for (const [k, ref] of Object.entries(model.fieldRefs)) ref.setError(lastPreview.errors[k])
    const nErr = Object.keys(lastPreview.errors).length + lastPreview.checks.filter((c) => c.level === 'error').length
    bar.classList.remove('hidden')
    bar.replaceChildren(
      h('span', { class: 'grow' }, `${lastPreview.diff.length} Änderung${lastPreview.diff.length === 1 ? '' : 'en'}`, nErr ? h('span', { class: 'badge error' }, `${nErr} Fehler`) : null),
      h('button', { class: 'btn ghost', onclick: () => discard() }, 'Verwerfen'),
      h('button', { class: 'btn primary', onclick: review }, 'Prüfen & anwenden'),
    )
  }
  function discard() {
    model.changes = {}
    bar.remove()
    settingsModel = null
    settingsPage()
  }

  function review() {
    const p = lastPreview
    if (!p) return
    const errs = Object.entries(p.errors)
    const blocking = p.checks.filter((c) => c.level === 'error')
    const table = h('table', { class: 'diff' }, h('thead', {}, h('tr', {}, h('th', {}, 'Einstellung'), h('th', {}, 'Bisher'), h('th', {}, 'Neu'))),
      h('tbody', {}, p.diff.map((d) => h('tr', {}, h('td', {}, h('div', {}, F[d.key]?.label ?? d.key), h('div', { class: 'k small faint' }, d.key)),
        h('td', { class: d.from ? 'from' : 'empty' }, d.from || 'Standard'), h('td', { class: d.to ? 'to' : 'empty' }, d.to || 'Standard')))))
    const content = [h('div', { class: 'table-wrap' }, table)]
    if (p.services.length) content.push(h('p', { class: 'small muted' }, 'Betroffene Dienste werden neu gestartet: ', p.services.join(', ')))
    for (const [k, e] of errs) content.push(alertBox('error', h('b', {}, `${F[k]?.label ?? k}: `), e))
    for (const c of p.checks.filter((c) => c.level !== 'info' || c.keys.some((k) => k in model.changes))) content.push(alertBox(c.level, c.message))
    content.push(alertBox('info', 'Vor dem Schreiben wird die Konfiguration geprüft und gesichert. Startet danach ein Dienst nicht sauber, wird automatisch der vorherige Stand wiederhergestellt.'))
    const go = h('button', { class: 'btn primary', disabled: errs.length || blocking.length ? true : undefined }, 'Jetzt anwenden')
    const m = modal({ title: 'Änderungen prüfen', wide: true, body: content, foot: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Abbrechen'), go] })
    go.onclick = async () => {
      go.disabled = true
      try {
        const r = await api('POST', '/apply', { changes: effectiveChanges() })
        m.close()
        openJob(r.job, {
          onDone: (job) => {
            if (job.status === 'ok') {
              model.changes = {}
              bar.remove()
              settingsModel = null
              if (S.page === 'settings') settingsPage()
            }
          },
        })
      } catch (e) {
        go.disabled = false
        if (e.data?.job) openJob(e.data.job)
        toast(e.message, 'error')
      }
    }
  }

  // Aufbau
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Einstellung suchen …', 'aria-label': 'Einstellungen durchsuchen' })
  const expert = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(showExpert), 'aria-label': 'Experteneinstellungen zeigen' })
  const groupsEl = h('div', { class: 'stack' })
  const groupNav = h('div', { class: 'group-nav' })
  const renderGroups = () => {
    const term = q.value.trim().toLowerCase()
    const exp = expert.getAttribute('aria-checked') === 'true'
    groupsEl.replaceChildren()
    groupNav.replaceChildren()
    model.fieldRefs = {}
    for (const g of s.groups) {
      const fs = s.fields.filter((f) => f.group === g.id && (exp || !f.advanced || f.key in model.changes) && (!term || `${f.label} ${f.help} ${f.key}`.toLowerCase().includes(term)))
      if (!fs.length) continue
      const c = card(g.icon, g.label, g.help)
      c.id = `g-${g.id}`
      for (const f of fs) {
        const fc = fieldControl(f, model)
        model.fieldRefs[f.key] = fc
        c.append(fc.el)
      }
      groupsEl.append(c)
      groupNav.append(h('button', { onclick: () => c.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, g.label))
    }
    if (!groupsEl.children.length) groupsEl.append(h('div', { class: 'empty-state' }, 'Keine passende Einstellung.', exp ? '' : ' Vielleicht unter den Experteneinstellungen?'))
    if (s.unknown.length && !term) groupsEl.append(card('info', 'Weitere Einträge in .env', 'Diese Schlüssel kennt die Oberfläche nicht. Sie bleiben beim Speichern unverändert erhalten.', h('div', { class: 'chips' }, s.unknown.map((k) => h('span', { class: 'chip mono' }, k)))))
    if (lastPreview) for (const [k, ref] of Object.entries(model.fieldRefs)) ref.setError(lastPreview.errors[k])
  }
  q.addEventListener('input', renderGroups)
  expert.addEventListener('click', () => {
    const v = expert.getAttribute('aria-checked') !== 'true'
    expert.setAttribute('aria-checked', String(v))
    store.set('expert', v)
    renderGroups()
  })
  const checks = s.checks.filter((c) => c.level !== 'info')
  mainEl.replaceChildren(
    pageHead('Einstellungen', 'Änderungen werden erst nach „Prüfen & anwenden" gespeichert.'),
    h('div', { class: 'row toolbar' }, h('label', { class: 'searchbar' }, icon('search', 16), q), h('label', { class: 'row small muted' }, expert, 'Experten')),
    ...(checks.length ? [h('div', { class: 'stack toolbar' }, checks.map((c) => alertBox(c.level, c.message)))] : []),
    groupNav,
    groupsEl,
  )
  renderGroups()
}

// --- WhatsApp --------------------------------------------------------------------------------

async function whatsapp() {
  const box = h('div', { class: 'stack' })
  const phone = h('input', { class: 'input mono', placeholder: 'optional: 4915112345678', inputmode: 'tel' })
  const confirmIn = h('input', { class: 'input', placeholder: 'NEU VERKNÜPFEN', autocomplete: 'off' })
  const relink = async () => {
    try {
      const r = await api('POST', '/wa/relink', { confirm: confirmIn.value, phone: phone.value })
      confirmIn.value = ''
      openJob(r.job)
    } catch (e) {
      if (e.data?.job) openJob(e.data.job)
      toast(e.message, 'error')
    }
  }
  mainEl.replaceChildren(
    pageHead('WhatsApp', 'Verbindung zu deinem WhatsApp-Konto.'),
    h('div', { class: 'stack' },
      card('chat', 'Verbindung', null, box),
      card('refresh', 'Neu verknüpfen', 'Löscht die gespeicherte WhatsApp-Sitzung und startet die Verknüpfung neu. Das Archiv in der Datenbank bleibt vollständig erhalten.',
        h('div', { class: 'stack' },
          h('label', { class: 'stack tight' }, h('b', { class: 'small' }, 'Per Kopplungscode statt QR (Telefonnummer mit Ländervorwahl)'), phone),
          h('label', { class: 'stack tight' }, h('b', { class: 'small' }, 'Zur Bestätigung „NEU VERKNÜPFEN" eintippen'), confirmIn),
          alertBox('info', 'Danach am Handy unter Verknüpfte Geräte das alte Gerät „Jarvis" entfernen, falls es noch angezeigt wird.'),
          h('div', { class: 'row end' }, h('button', { class: 'btn danger', onclick: relink }, 'Neu verknüpfen'))))),
  )
  timers.push(waPanel(box))
}

// --- Logs ------------------------------------------------------------------------------------

async function logs() {
  const svcs = ['wa-ingest', 'mcp-server', 'embedder', 'organizer', 'postgres', 'cloudflared', 'admin']
  const sel = h('select', { class: 'input', 'aria-label': 'Dienst' }, svcs.map((s) => h('option', { value: s, selected: s === store.get('logsvc', 'wa-ingest') }, `${SVC_LABEL[s]} (${s})`)))
  const tail = h('select', { class: 'input', 'aria-label': 'Zeilen' }, [100, 300, 1000, 2000].map((n) => h('option', { value: n, selected: n === 300 }, `${n} Zeilen`)))
  const auto = h('button', { class: 'switch', role: 'switch', 'aria-checked': 'true', 'aria-label': 'Automatisch aktualisieren' })
  const pre = h('div', { class: 'joblog logbox', tabindex: '0' })
  let text = ''
  const load = async () => {
    store.set('logsvc', sel.value)
    try {
      const r = await api('GET', `/logs/${sel.value}?tail=${tail.value}`)
      const atBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40
      text = r.text
      pre.textContent = text || '(keine Ausgabe – läuft der Dienst?)'
      if (atBottom) pre.scrollTop = pre.scrollHeight
    } catch (e) {
      pre.textContent = e.message
    }
  }
  sel.onchange = () => ((pre.scrollTop = 1e9), load())
  tail.onchange = load
  auto.onclick = () => auto.setAttribute('aria-checked', String(auto.getAttribute('aria-checked') !== 'true'))
  mainEl.replaceChildren(
    pageHead('Logs', 'Geheimnisse (Token, Schlüssel, Passwörter) werden in der Anzeige geschwärzt.',
      h('button', { class: 'btn', onclick: () => copy(text) }, icon('copy', 16), 'Kopieren'),
      h('button', { class: 'btn', onclick: load }, icon('refresh', 16), 'Aktualisieren')),
    h('div', { class: 'stack' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, sel), tail, h('label', { class: 'row small muted' }, auto, 'Live')), pre),
  )
  await load()
  pre.scrollTop = pre.scrollHeight
  timers.push(setInterval(() => auto.getAttribute('aria-checked') === 'true' && load(), 4000))
}

// --- Wartung ---------------------------------------------------------------------------------

async function maintenance() {
  const [{ jobs }, st] = await Promise.all([api('GET', '/jobs'), api('GET', '/status').catch(() => ({ services: [] }))])
  const start = async (path, body) => {
    try {
      const r = await api('POST', path, body)
      openJob(r.job, { onDone: () => S.page === 'maintenance' && maintenance() })
    } catch (e) {
      if (e.data?.job) openJob(e.data.job)
      toast(e.message, 'error')
    }
  }
  const svcList = h('div', { class: 'list' })
  for (const s of st.services.filter((x) => x.service !== 'admin')) {
    const [cls, txt] = svcDot(s)
    svcList.append(h('div', { class: 'item' }, h('span', { class: `dot ${cls}` }), h('div', { class: 'grow' }, h('b', {}, SVC_LABEL[s.service] ?? s.service), h('span', { class: 'small faint' }, ` · ${txt}`)), h('button', { class: 'btn s', onclick: () => start('/maintenance/restart', { service: s.service }) }, icon('refresh', 14), 'Neu starten')))
  }
  const oldPw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'Aktuelles Passwort' })
  const newPw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'Neues Passwort (mind. 15 Zeichen)' })
  const changePw = async () => {
    try {
      await api('POST', '/auth/password', { old: oldPw.value, new: newPw.value })
      oldPw.value = newPw.value = ''
      toast('Admin-Passwort geändert.', 'ok')
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const rot = (key, label) => h('button', { class: 'btn', onclick: () => rotate({ key, label }) }, icon('refresh', 16), label)
  const jobList = h('div', { class: 'list' })
  for (const j of jobs.slice(0, 15)) jobList.append(h('div', { class: 'item' }, statusBadge(j.status), h('div', { class: 'grow' }, h('b', {}, j.title), h('div', { class: 'small faint' }, fmtDate(j.startedAt))), h('button', { class: 'btn s ghost', onclick: () => openJob(j) }, 'Protokoll')))
  if (!jobs.length) jobList.append(h('p', { class: 'muted' }, 'Noch keine Vorgänge.'))

  mainEl.replaceChildren(
    pageHead('Wartung', 'Neustarts, Updates, Kosten und Sicherheit.'),
    h('div', { class: 'stack' },
      card('layers', 'Dienste', 'Ein Neustart behebt oft hängende Verbindungen.', svcList),
      h('div', { class: 'grid' },
        card('wrench', 'Aktualisieren', 'Nach git pull: alle Images neu bauen und die Dienste mit Gesundheitsprüfung austauschen.', h('button', { class: 'btn', onclick: () => start('/maintenance/rebuild') }, icon('refresh', 16), 'Neu bauen und starten')),
        card('layers', 'Kostenschätzung', 'Was die Themen-Sortierung für den aktuellen Bestand kosten würde (nutzt die Preise aus den Einstellungen).', h('button', { class: 'btn', onclick: () => start('/maintenance/estimate') }, 'Schätzung berechnen'))),
      card('key', 'Geheimnisse wechseln', 'Bei Verdacht auf ein Leck. Die Datenbank wird mit umgestellt; bei Fehlern geht alles automatisch zurück.', h('div', { class: 'row' }, rot('MCP_TOKEN', 'MCP-Token'), rot('POSTGRES_PASSWORD', 'Datenbank-Passwort'), rot('MCP_RO_PASSWORD', 'Passwort der MCP-Rollen'))),
      card('shield', 'Admin-Passwort', 'Passwort dieser Einstellungsseite ändern. Andere angemeldete Geräte werden abgemeldet.', h('div', { class: 'stack tight' }, oldPw, newPw, h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: changePw }, 'Passwort ändern')))),
      card('history', 'Letzte Vorgänge', null, jobList)),
  )
}

// --- Versionen -------------------------------------------------------------------------------

async function versions() {
  const { backups } = await api('GET', '/backups')
  const list = h('div', { class: 'list' })
  const open = async (b) => {
    const d = await api('GET', `/backups/${encodeURIComponent(b.name)}`)
    const table = d.diff.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'diff' }, h('thead', {}, h('tr', {}, h('th', {}, 'Schlüssel'), h('th', {}, 'Jetzt'), h('th', {}, 'In der Sicherung'))),
          h('tbody', {}, d.diff.map((x) => h('tr', {}, h('td', { class: 'k' }, x.key), h('td', { class: x.current ? 'from' : 'empty' }, x.current || 'Standard'), h('td', { class: x.backup ? 'to' : 'empty' }, x.backup || 'Standard'))))))
      : alertBox('info', 'Identisch mit dem aktuellen Stand.')
    const restore = h('button', { class: 'btn primary', disabled: d.diff.length ? undefined : true }, 'Diesen Stand wiederherstellen')
    const m = modal({ title: `Sicherung vom ${fmtDate(b.at)}`, wide: true, body: [table, alertBox('info', 'Wiederherstellen läuft durch dieselbe Prüfung wie jede Änderung, inklusive automatischem Rollback.')], foot: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Schließen'), restore] })
    restore.onclick = async () => {
      try {
        const r = await api('POST', `/backups/${encodeURIComponent(b.name)}/restore`)
        m.close()
        openJob(r.job, { onDone: () => S.page === 'versions' && versions() })
      } catch (e) {
        toast(e.message, 'error')
      }
    }
  }
  for (const b of backups) {
    list.append(h('div', { class: 'item' },
      h('div', { class: 'grow' }, h('b', {}, fmtDate(b.at)), h('div', { class: 'small faint' }, b.changed.length ? `Unterschied zu jetzt: ${b.changed.slice(0, 6).join(', ')}${b.changed.length > 6 ? ` +${b.changed.length - 6}` : ''}` : 'identisch mit jetzt')),
      h('button', { class: 'btn s', onclick: () => open(b) }, 'Ansehen')))
  }
  if (!backups.length) list.append(h('div', { class: 'empty-state' }, 'Noch keine Sicherungen. Vor jeder Änderung wird automatisch eine angelegt.'))
  mainEl.replaceChildren(pageHead('Versionen', 'Vor jeder Änderung wird die bisherige .env gesichert (die letzten 30 Stände).'), card('history', 'Sicherungen', null, list))
}

boot()
