export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutItem {
  id: string
  wide: boolean
}

export interface LayoutResult {
  rects: Record<string, Rect>
  height: number
}

const GAP = 12

/** Pick a column count that keeps terminals readable: wide-ish, never cramped */
export function chooseCols(n: number, W: number, H: number, wideCount = 0): number {
  if (n <= 1) return 1
  let best = 1
  let bestScore = -Infinity
  const cells = n + wideCount
  for (let cols = 1; cols <= Math.min(cells, 6); cols++) {
    const rows = Math.ceil(cells / cols)
    const w = (W - GAP * (cols - 1)) / cols
    const h = (H - GAP * (rows - 1)) / rows
    if (w < 340) break
    // Terminals want ~1.6:1; penalize going far off that, and penalize empty cells.
    const aspect = w / h
    const shape = -Math.abs(Math.log(aspect / 1.6))
    const area = Math.min(w, h * 1.6) / 1000
    const waste = (cols * rows - cells) * 0.18
    const score = area + shape * 0.55 - waste
    if (score > bestScore) {
      bestScore = score
      best = cols
    }
  }
  return best
}

/**
 * Grid layout with dense packing; tiles with an open preview span two columns.
 * Rows never shrink below `minRow`, the page scrolls instead.
 */
export function gridLayout(items: LayoutItem[], W: number, H: number, minRow = 240): LayoutResult {
  const rects: Record<string, Rect> = {}
  if (!items.length || W <= 0) return { rects, height: H }
  const wideCount = items.filter((i) => i.wide).length
  const cols = chooseCols(items.length, W, H, wideCount)
  const occupied: boolean[][] = []
  const place: { id: string; r: number; c: number; span: number }[] = []
  const free = (r: number, c: number, span: number) => {
    for (let k = 0; k < span; k++) if (c + k >= cols || occupied[r]?.[c + k]) return false
    return true
  }
  for (const it of items) {
    const span = it.wide && cols > 1 ? 2 : 1
    let done = false
    for (let r = 0; !done; r++) {
      occupied[r] ??= []
      for (let c = 0; c < cols && !done; c++) {
        if (free(r, c, span)) {
          for (let k = 0; k < span; k++) occupied[r][c + k] = true
          place.push({ id: it.id, r, c, span })
          done = true
        }
      }
    }
  }
  // Let tiles stretch into empty cells to their right, so a short last row has no holes.
  for (const p of [...place].sort((a, b) => a.r - b.r || b.c - a.c)) {
    while (p.c + p.span < cols && !occupied[p.r][p.c + p.span]) {
      occupied[p.r][p.c + p.span] = true
      p.span++
    }
  }
  const rows = Math.max(...place.map((p) => p.r)) + 1
  const colW = (W - GAP * (cols - 1)) / cols
  const rowH = Math.max(minRow, (H - GAP * (rows - 1)) / rows)
  for (const p of place) {
    rects[p.id] = {
      x: p.c * (colW + GAP),
      y: p.r * (rowH + GAP),
      w: colW * p.span + GAP * (p.span - 1),
      h: rowH,
    }
  }
  return { rects, height: rows * rowH + GAP * (rows - 1) }
}

/** Focus layout: one big tile, the rest shrink into a filmstrip on the right */
export function focusLayout(items: LayoutItem[], focusedId: string, W: number, H: number): LayoutResult {
  const rects: Record<string, Rect> = {}
  const others = items.filter((i) => i.id !== focusedId)
  if (!others.length) {
    rects[focusedId] = { x: 0, y: 0, w: W, h: H }
    return { rects, height: H }
  }
  const stripW = Math.min(380, Math.max(240, W * 0.22))
  const mainW = W - stripW - GAP
  rects[focusedId] = { x: 0, y: 0, w: mainW, h: H }
  const each = Math.max(130, (H - GAP * (others.length - 1)) / others.length)
  others.forEach((o, i) => {
    rects[o.id] = { x: mainW + GAP, y: i * (each + GAP), w: stripW, h: Math.min(each, 340) }
  })
  const height = Math.max(H, others.length * (Math.min(each, 340) + GAP) - GAP)
  return { rects, height }
}
