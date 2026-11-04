import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/tokens.css'
import './styles/global.css'

class PageErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch() {
    const fallback = document.getElementById('app-startup-fallback')
    if (fallback) fallback.hidden = true
  }

  componentDidMount() {
    const fallback = document.getElementById('app-startup-fallback')
    if (fallback) fallback.hidden = true
  }

  render() {
    if (this.state.error) {
      return <main className="render-error" role="alert">
        <p className="eyebrow">CAN / FIELD NOTES · RENDER ERROR</p>
        <h1>This page hit a display error.</h1>
        <p>{this.state.error.message || 'The browser could not render this page.'}</p>
        <p>Check the terminal running Vite for the first error, then share it so I can fix the cause.</p>
      </main>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PageErrorBoundary><App /></PageErrorBoundary>
  </React.StrictMode>,
)
