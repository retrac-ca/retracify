import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'retracify-theme';

const THEME_COLORS: Record<Theme, string> = {
  light: '#0b5cad',
  dark: '#0b1420',
};

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'light' || value === 'dark';
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    // Local storage can be unavailable, for example in private browsing.
    return null;
  }
}

function storeTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this visit if storage is unavailable.
  }
}

/**
 * Follows the device colour scheme by default. Once the visitor chooses a
 * theme explicitly, that choice is remembered on their device.
 */
export function useTheme() {
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const [preference, setPreference] = useState<Theme | null>(readStoredTheme);
  const theme = preference ?? systemTheme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLORS[theme]);
  }, [theme]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    media.addEventListener('change', handleChange);

    return () => {
      media.removeEventListener('change', handleChange);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference((current) => {
      const next = (current ?? getSystemTheme()) === 'dark' ? 'light' : 'dark';
      storeTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
