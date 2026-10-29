import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// "Update app" reloads with ?v=<time> to bypass caches; tidy the URL again.
try { const u = new URL(window.location.href); if (u.searchParams.has('v')) { u.searchParams.delete('v'); window.history.replaceState(null, '', u.toString()) } } catch { /* ignore */ }

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)