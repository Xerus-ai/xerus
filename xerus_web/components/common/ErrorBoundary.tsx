'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  /** Label shown in the error card (e.g. "Chat", "Agent Editor") */
  label?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 h-full min-h-[200px]">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-medium">
              {this.props.label ? `${this.props.label} crashed` : 'Something went wrong'}
            </span>
          </div>
          {this.state.error && (
            <p className="text-xs text-text-secondary max-w-md text-center">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-surface-hover hover:bg-surface-active text-text transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
