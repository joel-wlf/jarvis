/** Removes trailing slashes and adds https:// when the user typed a bare host. */
export function normalizeUrl(input: string): string {
  let u = input.trim()
  if (!u) return u
  if (!/^https?:\/\//i.test(u)) u = `${/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u) ? 'http' : 'https'}://${u}`
  return u.replace(/\/+$/, '')
}

