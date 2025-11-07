import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  componentDidCatch(error, info) {
    // Catch errors in any components below and re-render with error message
    this.setState({ error, info });
    // You can also log the error to an error reporting service here
    // console.error(error, info);
  }

  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#c92a2a' }}>Application error</h2>
          <div style={{ marginBottom: 12, color: '#444' }}>An uncaught error occurred while rendering the app.</div>
          <details style={{ whiteSpace: 'pre-wrap', background: '#fff8f8', padding: 12, borderRadius: 6, border: '1px solid #ffd6d6' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Error details</summary>
            <div style={{ marginTop: 8 }}>{String(error && error.toString())}</div>
            <div style={{ marginTop: 8 }}>{info && info.componentStack}</div>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
