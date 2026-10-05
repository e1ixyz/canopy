import type { ITheme } from '@xterm/xterm'
import type { Appearance } from '@shared/types'

export type Mode = 'light' | 'dark'

type Palette = ITheme & { background: string }

const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace"

/**
 * Terminal colors per mode. `background` must match --term-bg: it is opaque so xterm answers
 * OSC 11 with the real color, which is how Claude Code's auto theme picks light or dark.
 */
const TERM: Record<Mode, Palette> = {
  dark: {
    background: '#141518',
    foreground: '#e6e6e8', cursor: '#7aa7ff', cursorAccent: '#151619', selectionBackground: 'rgba(77,139,255,0.32)',
    black: '#2a2b30', red: '#f47174', green: '#4cc38a', yellow: '#f0c05a', blue: '#6b9dff', magenta: '#c38bf5', cyan: '#4cc3d4', white: '#d0d0d4',
    brightBlack: '#6c6e75', brightRed: '#ff9396', brightGreen: '#7fd8ac', brightYellow: '#f6d58a', brightBlue: '#9dbcff', brightMagenta: '#d9b3fa', brightCyan: '#8adbe5', brightWhite: '#ffffff',
  },
  light: {
    background: '#ffffff',
    foreground: '#1d1e21', cursor: '#2f6ae0', cursorAccent: '#ffffff', selectionBackground: 'rgba(47,106,224,0.22)',
    black: '#1d1e21', red: '#c62828', green: '#1e7d4f', yellow: '#8a6100', blue: '#1d4ed8', magenta: '#8e24aa', cyan: '#00737e', white: '#5c5e64',
    brightBlack: '#7c7e85', brightRed: '#e04444', brightGreen: '#2a9a63', brightYellow: '#a87700', brightBlue: '#2f6ae0', brightMagenta: '#a43dc0', brightCyan: '#008a96', brightWhite: '#2e2f33',
  },
}

/** #rrggbb at an opacity, as rgba() (xterm parses palette colors itself) */
function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export function termPalette(mode: Mode) {
  const base = TERM[mode]
  // xterm draws its own scrollbar from the palette; tint it from the foreground so it suits the mode
  const fg = base.foreground ?? '#888888'
  const colors = {
    ...base,
    scrollbarSliderBackground: alpha(fg, 0.18),
    scrollbarSliderHoverBackground: alpha(fg, 0.3),
    scrollbarSliderActiveBackground: alpha(fg, 0.4),
  }
  return {
    theme: colors as ITheme,
    font: MONO,
    size: 12.5,
    lineHeight: 1.18,
    // A safety net for programs that still paint dark-theme colors on a light background
    minimumContrastRatio: mode === 'light' ? 3 : 1,
  }
}

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

/** The main process sets nativeTheme.themeSource from the appearance setting, so the media query already reflects an override. */
export function currentMode(): Mode {
  return darkQuery?.matches === false ? 'light' : 'dark'
}

export function onModeChange(fn: (m: Mode) => void) {
  const h = () => fn(currentMode())
  darkQuery?.addEventListener('change', h)
  return () => darkQuery?.removeEventListener('change', h)
}

export function applyMode(mode: Mode) {
  const root = document.documentElement
  root.dataset.mode = mode
  root.style.colorScheme = mode
}

export const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
