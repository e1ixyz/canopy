import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)

if (import.meta.env.DEV) {
  import('./store/app').then(({ useApp }) => Object.assign(window, { __app: useApp }))
}
