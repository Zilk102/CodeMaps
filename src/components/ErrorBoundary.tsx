// Top-level error boundary that replaces a crashed UI with a message, the error details and a
// reload button.
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

/** Monospace block with the error text and the React component stack. */
const ErrorDetails = ({ error, errorInfo }: { error: Error; errorInfo: ErrorInfo | null }) => (
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
    {error.toString()}
    {'\n'}
    {errorInfo?.componentStack}
  </pre>
);

/**
 * Full-screen fallback with the translated title and message, the error details when known, and a
 * button that reloads the window.
 */
const ErrorFallback = ({
  t,
  error,
  errorInfo,
}: {
  t: WithTranslation['t'];
  error: Error | null;
  errorInfo: ErrorInfo | null;
}) => (
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
    <h1 style={{ color: 'var(--acc)', marginBottom: '10px' }}>{t('app.errorBoundary.title')}</h1>
    <p style={{ marginBottom: '20px', maxWidth: '600px', lineHeight: '1.5' }}>
      {t('app.errorBoundary.message')}
    </p>
    {error && <ErrorDetails error={error} errorInfo={errorInfo} />}
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
      {t('app.errorBoundary.reload')}
    </button>
  </div>
);

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
      return <ErrorFallback t={t} error={this.state.error} errorInfo={this.state.errorInfo} />;
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
