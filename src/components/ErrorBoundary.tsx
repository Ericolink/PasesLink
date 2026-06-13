import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconAlertTriangle } from './Icons'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in app:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          <IconAlertTriangle className="w-12 h-12 mb-3 text-amber-400" />
          <h1 className="text-lg font-semibold text-gray-900">Algo salió mal</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-sm">
            Ocurrió un error inesperado. Intenta recargar la página; si el problema continúa, contacta al soporte.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Recargar página
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
