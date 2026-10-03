import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)

if (import.meta.env.DEV) {
  import('./store/app').then(({ useApp }) => Object.assign(window, { __app: useApp }))
}
