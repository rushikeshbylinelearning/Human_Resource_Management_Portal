// frontend/src/main.jsx
import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/PerformanceOptimizations.css' // Performance optimizations
import './utils/quietConsole.js'

// Layout mutation audit is opt-in: run `auditLayoutMutations()` in the browser console.
if (import.meta.env.DEV) {
  window.auditLayoutMutations = () =>
    import('./utils/layoutMutationAudit.js').then((mod) => mod.auditLayoutMutations());
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)