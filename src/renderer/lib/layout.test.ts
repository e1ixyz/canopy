import { describe, expect, it } from 'vitest'
import { chooseCols, focusLayout, gridLayout } from './layout'

describe('layout', () => {
  it('one tile fills the page', () => {
    const r = gridLayout([{ id: 'a', wide: false }], 1600, 900)
    expect(r.rects.a).toEqual({ x: 0, y: 0, w: 1600, h: 900 })
  })
  it('four tiles on a wide screen go 2x2', () => expect(chooseCols(4, 1600, 900)).toBe(2))
  it('wide tiles span two columns without overlapping', () => {
    const r = gridLayout(
      [
        { id: 'a', wide: true },
        { id: 'b', wide: false },
        { id: 'c', wide: false },
      ],
      1600,
      900,
    )
    const rs = Object.values(r.rects)
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) {
        const A = rs[i]
        const B = rs[j]
        const overlap = A.x < B.x + B.w && B.x < A.x + A.w && A.y < B.y + B.h && B.y < A.y + A.h
        expect(overlap).toBe(false)
      }
    expect(r.rects.a.w).toBeGreaterThan(r.rects.b.w)
  })
  it('a short last row stretches to fill the width', () => {
    const r = gridLayout(
      [
        { id: 'a', wide: true },
        { id: 'b', wide: false },
      ],
      1600,
      900,
    )
    expect(r.rects.b.w).toBe(r.rects.a.w)
  })
  it('focus puts the focused tile left and the rest in a strip', () => {
    const r = focusLayout(
      [
        { id: 'a', wide: false },
        { id: 'b', wide: false },
      ],
      'b',
      1600,
      900,
    )
    expect(r.rects.b.x).toBe(0)
    expect(r.rects.a.x).toBeGreaterThan(r.rects.b.w)
  })
})
