import { useSyncExternalStore } from 'react'
import { DEFAULT_PROFILE_ID, profileColor, profilesOf, type Profile } from '@shared/types'
import { useApp } from '../store/app'
import { currentMode, onModeChange } from './theme'

const useMode = () => useSyncExternalStore(onModeChange, currentMode)

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export interface ProfileTint {
  /** the profile color for this mode: text, dots, the window stripe */
  color: string
  /** a soft fill behind a chip or the selected row */
  bg: string
  /** an inset ring around the fill */
  ring: string
  /** ink for text sitting on `color` */
  on: string
}

/** Profiles with the active one and per-mode colors. `multi` is false until a second profile exists. */
export function useProfiles() {
  const settings = useApp((s) => s.settings)
  const mode = useMode()
  const profiles = profilesOf(settings)
  const active = profiles.find((p) => p.id === settings.activeProfileId) ?? profiles[0]
  const tint = (p: Pick<Profile, 'color'>): ProfileTint => {
    const color = profileColor(p.color, mode)
    return {
      color,
      bg: rgba(color, mode === 'dark' ? 0.14 : 0.1),
      ring: rgba(color, mode === 'dark' ? 0.45 : 0.4),
      on: mode === 'dark' ? '#111214' : '#ffffff',
    }
  }
  const byId = (id?: string) => profiles.find((p) => p.id === (id ?? DEFAULT_PROFILE_ID)) ?? profiles[0]
  return { profiles, active, multi: profiles.length > 1, tint, byId }
}

export const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

/** ⌥⌘ and the profile's position, for menus and the palette */
export const profileKey = (i: number) => (i < 9 ? `⌥⌘${i + 1}` : undefined)
