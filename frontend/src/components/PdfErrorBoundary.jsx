import React from 'react';

/**
 * Catches pdf.js render crashes (e.g. react-pdf TextLayer hitting a destroyed
 * transport: "can't access property sendWithStream, messageHandler is null").
 *
 * Without this, such an error unmounts the entire React tree — for the
 * onboarding policy flow that means a blank/blocked app for a new employee.
 * With it, the parent can recover locally (see `onError`, typically used to
 * retry once without the text layer) or show `fallback(error, retry)`.
 *
 * Remount with a new `key` to reset after changing render settings.
 */
class PdfErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
        this.handleRetry = this.handleRetry.bind(this);
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[PdfErrorBoundary] PDF rendering crashed:', error, info?.componentStack);
        this.props.onError?.(error);
    }

    handleRetry() {
        this.setState({ error: null });
        this.props.onRetry?.();
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        if (typeof this.props.fallback === 'function') {
            return this.props.fallback(error, this.handleRetry);
        }
        if (this.props.fallback) return this.props.fallback;

        return (
            <div className="pdf-error" role="alert" style={{ padding: 24, textAlign: 'center' }}>
                <p>Failed to display this PDF.</p>
                <button type="button" onClick={this.handleRetry}>
                    Try again
                </button>
            </div>
        );
    }
}

export default PdfErrorBoundary;
