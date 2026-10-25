import { useCallback, useEffect, useRef, useState } from 'react';
import type { Forecast, Place } from '../../shared/types';
import { getForecast } from '../api/client';
import { ClientApiError, clientErrorMessage } from '../api/errors';

export type ForecastStatus = 'loading' | 'success' | 'error';

export function useForecast(place: Place) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [status, setStatus] = useState<ForecastStatus>('loading');
  const [error, setError] = useState<ClientApiError | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [staleFromServer, setStaleFromServer] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const forecastRef = useRef<Forecast | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const samePlace = forecastRef.current?.place.id === place.id;

    setStatus('loading');
    setError(null);
    setIsStale(false);
    setStaleFromServer(false);

    if (!samePlace) {
      forecastRef.current = null;
      setForecast(null);
    }

    getForecast(place.id, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        const next = response.forecast;

        forecastRef.current = next;
        setForecast(next);
        setStaleFromServer(Boolean(response.stale));
        setStatus('success');
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const apiError =
          caught instanceof ClientApiError
            ? caught
            : new ClientApiError(0, 'NETWORK', clientErrorMessage(caught), {
                retryable: true,
              });

        setError(apiError);

        if (forecastRef.current?.place.id === place.id) {
          setIsStale(true);
          setStatus('success');
        } else {
          setStatus('error');
        }
      });

    return () => {
      controller.abort();
    };
  }, [place, retryToken]);

  const refresh = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  return {
    forecast,
    status,
    error,
    isStale,
    staleFromServer,
    refresh,
  };
}
