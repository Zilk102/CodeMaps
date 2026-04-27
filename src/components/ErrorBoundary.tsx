import React, { Component, ErrorInfo, ReactNode } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  public render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            backgroundColor: 'var(--bg0)',
            color: 'var(--t2)',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ color: 'var(--acc)', marginBottom: '10px' }}>
            {t('app.errorBoundary.title', { defaultValue: 'Something went wrong.' })}
          </h1>
          <p style={{ marginBottom: '20px', maxWidth: '600px', lineHeight: '1.5' }}>
            {t('app.errorBoundary.message', { defaultValue: 'An unexpected error occurred in the application. You can try refreshing the page or restarting the app.' })}
          </p>
          {this.state.error && (
            <pre
              style={{
                backgroundColor: 'var(--bg1)',
                padding: '15px',
                borderRadius: '8px',
                overflowX: 'auto',
                maxWidth: '80%',
                border: '1px solid var(--border)',
                textAlign: 'left',
                fontSize: '12px',
                color: 'var(--t3)',
              }}
            >
              {this.state.error.toString()}
              {'\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: 'var(--acc)',
              color: 'var(--bg0)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            {t('app.errorBoundary.reload', { defaultValue: 'Reload App' })}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);