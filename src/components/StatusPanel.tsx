interface StatusPanelProps {
  variant: 'loading' | 'error' | 'empty';
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function StatusPanel({
  variant,
  title,
  message,
  onRetry,
}: StatusPanelProps) {
  if (variant === 'loading') {
    return (
      <div className="status-panel status-panel--loading" role="status">
        <p className="status-title">Loading weather…</p>
        <p className="status-message">
          Fetching the latest forecast for this location.
        </p>
        <div className="skeleton-grid" aria-hidden="true">
          <span className="skeleton skeleton--large" />
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton skeleton--wide" />
        </div>
      </div>
    );
  }

  const isError = variant === 'error';

  return (
    <div
      className={isError ? 'status-panel status-panel--error' : 'status-panel'}
      role={isError ? 'alert' : 'status'}
    >
      <p className="status-title">{title ?? 'Weather unavailable'}</p>
      {message && <p className="status-message">{message}</p>}
      {isError && onRetry && (
        <button type="button" className="primary-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
