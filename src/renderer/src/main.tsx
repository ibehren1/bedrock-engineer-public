import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '../index.css'
import './i18n/config'

// Apply the saved appearance theme before first paint to avoid a flash.
// (useTheme keeps this in sync afterwards.)
{
  const stored = (window.store?.get('appTheme' as any) as string) ?? 'dim'
  const prefersDark =
    !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = stored === 'system' ? (prefersDark ? 'dark' : 'light') : stored
  document.documentElement.dataset.theme = resolved
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
