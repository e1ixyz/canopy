import type { OrchApi } from '@shared/ipc'

declare global {
  interface Window {
    orch: OrchApi
  }
}

export const orch = window.orch
