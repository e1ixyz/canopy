import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve(import.meta.dirname, 'src/shared') }

function headSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: import.meta.dirname }).toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig(({ command }) => ({
  main: {
    resolve: { alias: shared },
    build: { externalizeDeps: true },
    // The /eval debug server runs arbitrary JS in the app, so release builds leave it out.
    // The self-updater needs the checkout's path, so only install-app builds (CANOPY_SELF_UPDATE=1) carry it.
    define: {
      __DEBUG_SERVER__: JSON.stringify(command === 'serve' || process.env.ORCH_DEBUG_BUILD === '1'),
      // CANOPY_BUILD_SHA lets a test build pretend it is older, to exercise the update prompt.
      __BUILD_SHA__: JSON.stringify(process.env.CANOPY_BUILD_SHA || headSha()),
      __SOURCE_DIR__: JSON.stringify(process.env.CANOPY_SELF_UPDATE === '1' ? import.meta.dirname : ''),
    },
  },
  preload: {
    resolve: { alias: shared },
    build: {
      externalizeDeps: true,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    resolve: { alias: { ...shared, '@': resolve(import.meta.dirname, 'src/renderer') } },
    plugins: [react(), tailwindcss()],
  },
}))
