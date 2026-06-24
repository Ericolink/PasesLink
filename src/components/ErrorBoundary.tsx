import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconAlertTriangle } from './Icons'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  copied: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info)
    this.setState({ errorInfo: info })
  }

  handleCopy = () => {
    const { error, errorInfo } = this.state
    const text = [error?.toString(), errorInfo?.componentStack].filter(Boolean).join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    })
  }

  render() {
    const { hasError, error, errorInfo, copied } = this.state
    if (hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          <IconAlertTriangle className="w-12 h-12 mb-3 text-amber-400" />
          <h1 className="text-lg font-semibold text-gray-900">Algo salió mal</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-sm">
            Ocurrió un error inesperado. Intenta recargar la página; si el problema continúa, contacta al soporte.
          </p>

          {error && (
            <div className="mt-4 w-full max-w-md text-left">
              <pre className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700 overflow-auto max-h-48 select-text whitespace-pre-wrap">
                {error.toString()}
                {/* El stack de componentes solo ayuda a depurar en desarrollo
                    — en producción puede filtrar nombres internos/estructura
                    del código, así que se oculta. */}
                {import.meta.env.DEV && errorInfo?.componentStack ? `\n${errorInfo.componentStack}` : ''}
              </pre>
              <button
                onClick={this.handleCopy}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
              >
                {copied ? 'Copiado ✓' : 'Copiar error'}
              </button>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => window.location.reload()}
              className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Recargar
            </button>
            <button
              onClick={() => { window.location.href = '/' }}
              className="border border-gray-300 rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Ir a inicio
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
