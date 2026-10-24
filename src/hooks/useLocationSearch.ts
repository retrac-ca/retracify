import { useCallback, useEffect, useState } from 'react';
import type { Place } from '../../shared/types';
import { clientErrorMessage } from '../api/errors';
import { searchPlaces } from '../api/client';

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

const DEBOUNCE_MS = 350;

export function useLocationSearch(query: string) {
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setStatus('idle');
      setError(null);
      return;
    }

    const controller = new AbortController();
    setResults([]);
    setStatus('loading');
    setError(null);

    const timer = setTimeout(() => {
      searchPlaces(trimmed, controller.signal)
        .then((places) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults(places);
          setStatus('success');
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          setResults([]);
          setStatus('error');
          setError(clientErrorMessage(caught));
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryToken]);

  const retry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  return { results, status, error, retry };
}
