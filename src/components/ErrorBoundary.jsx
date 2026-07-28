import React from 'react'

// App-level error boundary — the last line of defense against a blank
// white screen. React error boundaries must be class components (no hook
// equivalent exists), and this one is deliberately mounted OUTSIDE
// AuthProvider/LanguageProvider (see main.jsx) so it still renders a
// working fallback even if one of those providers is what threw. That's
// also why the fallback text below is hardcoded bilingual rather than
// routed through useLanguage() — depending on app context here would
// defeat the point of a last-resort boundary.
//
// This intentionally does NOT swallow the error from the console — only
// the user-facing render is replaced. Open devtools and the real error/
// stack trace is exactly where a normal uncaught error would be.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('FacilityFlow crashed — caught by ErrorBoundary:', error, info?.componentStack)
  }

  handleReload = () => {
    // A full reload, not just resetting `hasError`, is deliberate — a
    // render-crashing error usually means some piece of app state is in a
    // shape the UI didn't expect; re-rendering the same broken state tree
    // in place would likely just throw again immediately.
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f172a', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          maxWidth: '420px', width: '100%', background: '#ffffff', borderRadius: '16px',
          padding: '32px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '9999px', background: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <span style={{ fontSize: '28px' }} aria-hidden="true">⚠️</span>
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 4px', lineHeight: 1.6 }}>
            FacilityFlow hit an unexpected error and couldn't continue. Your data is safe —
            nothing was saved incorrectly. Try again, and if it keeps happening, contact your
            administrator.
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px', lineHeight: 1.6 }}>
            FacilityFlow 發生非預期的錯誤，暫時無法繼續。您的資料是安全的，不會被錯誤儲存。
            請重試，如持續發生請聯繫系統管理員。
          </p>
          <button
            onClick={this.handleReload}
            style={{
              width: '100%', padding: '12px', background: '#f59e0b', color: '#ffffff',
              border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again · 再試一次
          </button>
        </div>
      </div>
    )
  }
}
