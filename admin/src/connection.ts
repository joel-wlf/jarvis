import { isIP } from 'node:net'
import { readCurrent, type Ctx } from './context.js'

const HOST_IP = `
const os = require('node:os'), fs = require('node:fs');
const routes = fs.readFileSync('/proc/net/route', 'utf8').trim().split('\\n').slice(1);
const primary = routes.map(r => r.trim().split(/\\s+/)).find(r => r[1] === '00000000')?.[0];
const interfaces = Object.entries(os.networkInterfaces()).sort(([a], [b]) => Number(b === primary) - Number(a === primary));
for (const [name, addresses] of interfaces) {
  if (/^(lo|docker|br-|veth|virbr|tun|tailscale)/.test(name)) continue;
  const address = addresses?.find(a => a.family === 'IPv4' && !a.internal && /^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)/.test(a.address));
  if (address) { console.log(address.address); break; }
}`
let cached: { image: string; at: number; ip: string } | null = null

/** A localhost URL on the server cannot connect a phone. Inspect the host's
 * network namespace with our own image, without mounts or elevated capabilities.
 */
export async function connectionAddress(ctx: Ctx, origin: string) {
  const env = readCurrent(ctx).env
  const configured = env.APP_PUBLIC_URL || env.APP_HOME_URL
  if (configured) return { url: new URL(configured).origin, localOnly: false }
  const u = new URL(origin)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return { url: u.origin, localOnly: false }
  if (ctx.self && !ctx.fake) {
    if (!cached || cached.image !== ctx.self.image || Date.now() - cached.at > 300_000) {
      const r = await ctx.docker.docker(['run', '--rm', '--network', 'host', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--entrypoint', 'node', ctx.self.image, '-e', HOST_IP], { timeoutMs: 10_000 })
      const ip = r.code === 0 ? r.out.trim() : ''
      if (isIP(ip) === 4) cached = { image: ctx.self.image, at: Date.now(), ip }
    }
    if (cached?.image === ctx.self.image) {
      u.hostname = cached.ip
      return { url: u.origin, localOnly: false }
    }
  }
  return { url: u.origin, localOnly: true }
}
