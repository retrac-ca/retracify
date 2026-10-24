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
  const [retryToken, setRetryToken] = useState(0);
  const forecastRef = useRef<Forecast | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const samePlace = forecastRef.current?.place.id === place.id;

    setStatus('loading');
    setError(null);
    setIsStale(false);

    if (!samePlace) {
      forecastRef.current = null;
      setForecast(null);
    }

    getForecast(place, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        // The API cache is keyed by coordinates. Use the place the visitor
        // actually selected rather than provider metadata from a cache hit.
        const next: Forecast = {
          ...response,
          place: { ...place, timezone: response.timezone },
        };

        forecastRef.current = next;
        setForecast(next);
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

  return { forecast, status, error, isStale, refresh };
}
