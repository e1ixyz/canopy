export function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString()
}

export function tildify(p: string, home: string) {
  return p.startsWith(home) ? '~' + p.slice(home.length) : p
}

export function hashColor(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 75% 68%)`
}

export function hashStr(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function fuzzy(q: string, text: string): number {
  if (!q) return 1
  const t = text.toLowerCase()
  const query = q.toLowerCase()
  if (t.includes(query)) return 2 + query.length / t.length
  let i = 0
  for (const c of t) if (c === query[i]) i++
  return i === query.length ? 1 : 0
}

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

export function bracketedPaste(text: string) {
  return `\x1b[200~${text}\x1b[201~`
}

export function shellQuote(p: string) {
  return /^[\w./:@-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`
}
