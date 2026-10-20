// Name der Person, für die Jarvis arbeitet (OWNER_NAME in .env).
// Nur Buchstaben, Ziffern, Leerzeichen, Punkt und Bindestrich, damit er sicher in Texte und SQL passt.
export const OWNER = (process.env.OWNER_NAME || 'dich').replace(/[^\p{L}\p{N} .-]/gu, '').trim() || 'dich'
export const OWNER_GEN = /[sßxz]$/i.test(OWNER) ? `${OWNER}'` : `${OWNER}s`
