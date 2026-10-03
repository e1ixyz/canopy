import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve(import.meta.dirname, 'src/shared') }

export default defineConfig(({ command }) => ({
  main: {
    resolve: { alias: shared },
    build: { externalizeDeps: true },
    // The /eval debug server runs arbitrary JS in the app, so release builds leave it out.
    define: { __DEBUG_SERVER__: JSON.stringify(command === 'serve' || process.env.ORCH_DEBUG_BUILD === '1') },
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
