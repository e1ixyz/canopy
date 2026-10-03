/** Minimal glob matcher for claim patterns: `**`, `*`, `?`, and directory prefixes */
export function globToRegExp(pattern: string): RegExp {
  let p = pattern.replace(/^\.\//, '').replace(/\/+$/, '')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*') {
      if (p[i + 1] === '*') {
        re += '.*'
        i++
        if (p[i + 1] === '/') i++
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  // A bare directory (no wildcard) claims everything beneath it.
  const tail = /[*?]/.test(p) ? '' : '(?:/.*)?'
  return new RegExp(`^${re}${tail}$`)
}

export function matchesClaim(relPath: string, pattern: string) {
  return globToRegExp(pattern).test(relPath.replace(/^\.\//, ''))
}
