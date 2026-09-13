import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Bắt được lỗi render:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback" role="alert">
          <h2>Ối, có gì đó bị lỗi rồi 😵</h2>
          <p>Luna gặp trục trặc khi hiển thị phần này. Bạn có thể thử tải lại.</p>
          {this.props.showDetails && this.state.error && (
            <pre className="error-boundary-details">{String(this.state.error.message || this.state.error)}</pre>
          )}
          <button type="button" onClick={this.handleReset} className="error-boundary-retry-btn">
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
