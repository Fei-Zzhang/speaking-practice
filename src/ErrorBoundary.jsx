import { Component } from 'react'

export class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          maxWidth: '600px',
          margin: '0 auto',
          fontFamily: 'system-ui, sans-serif',
          color: '#e8e8ed',
          background: '#1a1a20',
          minHeight: '100vh',
        }}>
          <h1 style={{ color: '#ef4444' }}>页面出错了</h1>
          <pre style={{ overflow: 'auto', background: '#0f0f12', padding: '1rem', borderRadius: '8px', fontSize: '14px' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <p>请检查控制台（F12 → Console）获取完整报错。</p>
        </div>
      )
    }
    return this.props.children
  }
}
