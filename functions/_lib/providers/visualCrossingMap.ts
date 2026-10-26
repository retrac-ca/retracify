import type { Place } from '../../../shared/types.ts';
import {
  RADAR_HEIGHT,
  RADAR_WIDTH,
  RADAR_ZOOM,
} from '../../../shared/radar.ts';
import { ApiError } from '../errors.ts';
import { requireEnv, USER_AGENT, type Env } from '../env.ts';
import { roundCoordinate } from '../validate.ts';

export const RADAR_IMAGE_BASE =
  'https://maps.visualcrossing.com/VisualCrossingWebServices/rest/api/v1/map/image/precipcomposite';

const MAX_MERCATOR_LATITUDE = 85.05112878;

export interface RadarBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface RadarImage {
  body: ArrayBuffer;
  contentType: string;
  bounds: RadarBounds;
  time: string;
}

interface ProjectedPoint {
  x: number;
  y: number;
}

function project(latitude: number, longitude: number, scale: number): ProjectedPoint {
  const clamped = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  const sin = Math.sin((clamped * Math.PI) / 180);

  return {
    x: ((longitude + 180) / 360) * scale,
    y:
      (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) *
      scale,
  };
}

function unproject(x: number, y: number, scale: number): {
  latitude: number;
  longitude: number;
} {
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude =
    (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { latitude, longitude };
}

function roundBound(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * The provider's stitched image is a Web Mercator crop centred on the place.
 * These bounds let Leaflet position it over the basemap without duplicating the
 * projection maths in the browser.
 */
export function mercatorBounds(
  latitude: number,
  longitude: number,
  zoom = RADAR_ZOOM,
  width = RADAR_WIDTH,
  height = RADAR_HEIGHT,
): RadarBounds {
  const scale = 256 * 2 ** zoom;
  const center = project(latitude, longitude, scale);
  const northWest = unproject(
    center.x - width / 2,
    center.y - height / 2,
    scale,
  );
  const southEast = unproject(
    center.x + width / 2,
    center.y + height / 2,
    scale,
  );

  return {
    south: roundBound(southEast.latitude),
    west: roundBound(northWest.longitude),
    north: roundBound(northWest.latitude),
    east: roundBound(southEast.longitude),
  };
}

export function buildRadarImageUrl(
  place: Place,
  apiKey: string,
  target: Date,
  zoom = RADAR_ZOOM,
  width = RADAR_WIDTH,
  height = RADAR_HEIGHT,
): string {
  const latitude = roundCoordinate(place.latitude).toFixed(4);
  const longitude = roundCoordinate(place.longitude).toFixed(4);
  const params = new URLSearchParams({
    apikey: apiKey,
    // The provider requires seconds in the timestamp. Without them it returns
    // a valid but completely blank image instead of an error.
    time: target.toISOString(),
    width: String(width),
    height: String(height),
    centerLat: latitude,
    centerLon: longitude,
    unitGroup: 'metric',
  });

  return `${RADAR_IMAGE_BASE}/${zoom}.png?${params.toString()}`;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

async function requestRadarImage(
  url: string,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'image/png',
        'user-agent': USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new ApiError(
          429,
          'RATE_LIMITED',
          'The radar service is temporarily busy. Please try again in a moment.',
          { retryable: true, retryAfterSeconds: 30 },
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new ApiError(
          502,
          'UPSTREAM_AUTH',
          'The radar service is temporarily unavailable.',
          { retryable: false },
        );
      }

      if (response.status >= 500) {
        throw new ApiError(
          502,
          'UPSTREAM_UNAVAILABLE',
          'The radar service is temporarily unavailable.',
          { retryable: true },
        );
      }

      throw new ApiError(
        502,
        'UPSTREAM_UNAVAILABLE',
        'The radar service could not complete this request.',
        { retryable: false },
      );
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.startsWith('image/')) {
      throw new ApiError(
        502,
        'INVALID_RESPONSE',
        'The radar service returned an unreadable image.',
        { retryable: false },
      );
    }

    return {
      body: await response.arrayBuffer(),
      contentType,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new ApiError(
        504,
        'TIMEOUT',
        'The radar service took too long to respond. Please try again.',
        { retryable: true },
      );
    }

    throw new ApiError(
      502,
      'NETWORK',
      'Could not reach the radar service. Check your connection and try again.',
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Unlike the timeline API, the Maps API accepted several parallel image
 * requests in testing (six at once). The browser limits preloading to six, so
 * do not serialize these calls here; serializing makes a cold radar loop take
 * tens of seconds.
 */
export async function fetchRadarImage(
  place: Place,
  env: Env,
  target: Date,
): Promise<RadarImage> {
  const apiKey = requireEnv(env, 'VISUAL_CROSSING_API_KEY');
  const url = buildRadarImageUrl(place, apiKey, target);
  const image = await requestRadarImage(url);

  return {
    ...image,
    bounds: mercatorBounds(place.latitude, place.longitude),
    time: target.toISOString(),
  };
}
