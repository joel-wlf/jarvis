import type { NextFunction, Request, Response } from 'express'
import type { ApiError } from '@jarvis/contract'

type Code = ApiError['error']['code']

const STATUS: Record<Code, number> = {
  unauthorized: 401, forbidden: 403, not_found: 404, invalid: 400, rate_limited: 429, unavailable: 503, internal: 500,
}

/** Thrown by handlers; rendered as the contract's ApiError body. */
export class ApiFail extends Error {
  constructor(
    readonly code: Code,
    message: string,
    readonly fields?: Record<string, string>,
    readonly status = STATUS[code],
  ) {
    super(message)
  }
}

export const fail = (code: Code, message: string, fields?: Record<string, string>) => new ApiFail(code, message, fields)

export function sendError(res: Response, code: Code, message: string, fields?: Record<string, string>) {
  const body: ApiError = { error: { code, message, ...(fields ? { fields } : {}) } }
  res.status(STATUS[code]).json(body)
}

/** Express error handler for /api/v1 (express 5 forwards rejected async handlers here). */
export function apiErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return void res.end()
  if (err instanceof ApiFail) return sendError(res, err.code, err.message, err.fields)
  if ((err as { type?: string }).type === 'entity.parse.failed') return sendError(res, 'invalid', 'Invalid JSON body')
  console.error(err)
  sendError(res, 'internal', 'Internal error')
}

export type Lang = 'de' | 'en'

/** German or English from Accept-Language (first of the two that appears), German by default. */
export function lang(req: Pick<Request, 'headers'>): Lang {
  const h = String(req.headers['accept-language'] ?? '').toLowerCase()
  for (const part of h.split(',')) {
    const tag = part.trim().slice(0, 2)
    if (tag === 'de' || tag === 'en') return tag
  }
  return 'de'
}

export const bearerOf = (req: Request) => {
  const h = req.headers.authorization
  return h && /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, '').trim() : undefined
}

// --- small validators (the API is small; zod covers the larger bodies) ------------------------------

export function str(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  if (v === undefined || v === null) {
    if (opts.optional) return undefined as unknown as string
    throw fail('invalid', `${field} is required`, { [field]: 'required' })
  }
  if (typeof v !== 'string') throw fail('invalid', `${field} must be a string`, { [field]: 'string expected' })
  const s = v.trim()
  if (s.length < (opts.min ?? 1)) throw fail('invalid', `${field} is too short`, { [field]: 'too short' })
  if (s.length > (opts.max ?? 500)) throw fail('invalid', `${field} is too long`, { [field]: 'too long' })
  return s
}

export const PLATFORMS = ['ios', 'android', 'web'] as const
export function platform(v: unknown): (typeof PLATFORMS)[number] {
  if (!PLATFORMS.includes(v as never)) throw fail('invalid', 'platform must be ios, android or web', { platform: 'ios | android | web' })
  return v as (typeof PLATFORMS)[number]
}
