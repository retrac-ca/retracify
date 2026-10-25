import type { Theme } from '../hooks/useTheme';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.2v2M12 19.8v2M4.3 4.3l1.4 1.4M18.3 18.3l1.4 1.4M2.2 12h2M19.8 12h2M4.3 19.7l1.4-1.4M18.3 5.7l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark';
  const actionLabel = isDark ? 'Switch to day mode' : 'Switch to night mode';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={actionLabel}
      title={actionLabel}
    >
      <span className="theme-toggle-icon">
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
      <span className="theme-toggle-label" aria-hidden="true">
        {isDark ? 'Day mode' : 'Night mode'}
      </span>
    </button>
  );
}
