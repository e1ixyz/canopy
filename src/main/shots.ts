/** `01-ta-navigate-1440.png` from a route like `/ta/navigate?x=1` */
export function shotFileName(index: number, route: string, width: number) {
  let path = route
  try {
    path = new URL(route, 'http://x').pathname
  } catch {
    /* keep raw */
  }
  const slug =
    path
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'home'
  return `${String(index + 1).padStart(2, '0')}-${slug.slice(0, 60)}-${width}.png`
}

export function resolveRoute(base: string, route: string) {
  const r = route.trim()
  if (/^https?:\/\//.test(r)) return r
  return new URL(r.startsWith('/') ? r : `/${r}`, base).toString()
}
