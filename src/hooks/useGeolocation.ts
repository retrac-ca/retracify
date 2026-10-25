import { useCallback, useEffect, useRef, useState } from 'react';
import type { Place } from '../../shared/types';
import { reverseGeocode } from '../api/client';
import { clientErrorMessage } from '../api/errors';

export type GeolocationStatus = 'idle' | 'locating' | 'error';

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 300_000,
};

function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location access was denied. You can still search for a city or town.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location could not be determined. Check your connection or search for a city instead.';
    case error.TIMEOUT:
      return 'Finding your location took too long. Try again or search for a city.';
    default:
      return 'Your location could not be determined. Search for a city instead.';
  }
}

/**
 * Requests the browser's location only after an explicit user action, then
 * resolves it to a populated place through the same-origin API.
 */
export function useGeolocation(onLocated: (place: Place) => void) {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error');
      setError(
        'This browser does not support location lookup. Search for a city or town instead.',
      );
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('locating');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        reverseGeocode(
          position.coords.latitude,
          position.coords.longitude,
          controller.signal,
        )
          .then((place) => {
            if (!mounted.current || controller.signal.aborted) {
              return;
            }

            setStatus('idle');
            onLocated(place);
          })
          .catch((caught: unknown) => {
            if (!mounted.current || controller.signal.aborted) {
              return;
            }

            setStatus('error');
            setError(clientErrorMessage(caught));
          });
      },
      (positionError) => {
        if (!mounted.current || controller.signal.aborted) {
          return;
        }

        setStatus('error');
        setError(geolocationMessage(positionError));
      },
      GEO_OPTIONS,
    );
  }, [onLocated]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, request, reset };
}
