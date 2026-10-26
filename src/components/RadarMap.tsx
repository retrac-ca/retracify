import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Place } from '../../shared/types';
import {
  RADAR_MODES,
  RADAR_ZOOM,
  radarOffsets,
  type RadarMode,
} from '../../shared/radar';
import { formatTime } from '../lib/format';

interface RadarMapProps {
  place: Place;
  timezone: string;
}

interface LoadedFrame {
  url: string;
  time: number;
  bounds: [[number, number], [number, number]];
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const PLAYBACK_INTERVAL_MS = 800;
const PRELOAD_CONCURRENCY = 6;

function formatOffset(offset: number): string {
  if (offset === 0) {
    return 'Now';
  }

  const absolute = Math.abs(offset);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  const duration = [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '']
    .filter(Boolean)
    .join(' ');

  return offset < 0 ? `${duration} ago` : `in ${duration}`;
}

function parseBounds(
  header: string | null,
): [[number, number], [number, number]] | null {
  if (!header) {
    return null;
  }

  const values = header.split(',').map(Number);

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const [south, west, north, east] = values;
  return [
    [south, west],
    [north, east],
  ];
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Radar is unavailable right now.';
}

export function RadarMap({ place, timezone }: RadarMapProps) {
  const [mode, setMode] = useState<RadarMode>('6h');
  const [index, setIndex] = useState(() => radarOffsets('6h').indexOf(0));
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [frames, setFrames] = useState<Map<string, LoadedFrame>>(
    () => new Map(),
  );

  const offsets = useMemo(() => radarOffsets(mode), [mode]);
  const nowIndex = offsets.indexOf(0);
  const currentOffset = offsets[index] ?? 0;
  const frameKey = `${place.id}:${mode}:${currentOffset}`;
  const currentFrame = frames.get(frameKey);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const overlayUrlRef = useRef<string | null>(null);
  const framesRef = useRef<Map<string, LoadedFrame>>(new Map());
  const pendingRef = useRef<Map<string, Promise<LoadedFrame>>>(new Map());
  const objectUrlsRef = useRef<string[]>([]);
  const modeRef = useRef<RadarMode>(mode);
  const loadRunRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const ensureFrame = useCallback(
    async (offset: number): Promise<LoadedFrame> => {
      const key = `${place.id}:${mode}:${offset}`;
      const existing = framesRef.current.get(key);

      if (existing) {
        return existing;
      }

      const pending = pendingRef.current.get(key);

      if (pending) {
        return pending;
      }

      const runId = loadRunRef.current;

      const promise = (async () => {
        const params = new URLSearchParams({
          placeId: place.id,
          mode,
          offset: String(offset),
        });
        const response = await fetch(`/api/radar?${params.toString()}`);

        if (!response.ok) {
          let message = 'Radar is unavailable right now.';

          try {
            const body = (await response.json()) as {
              error?: { message?: string };
            };
            message = body.error?.message ?? message;
          } catch {
            // Keep the generic message when the error body is not JSON.
          }

          throw new Error(message);
        }

        const bounds = parseBounds(response.headers.get('x-radar-bounds'));

        if (!bounds) {
          throw new Error('Radar is unavailable right now.');
        }

        const timeHeader = response.headers.get('x-radar-time');
        const parsedTime = timeHeader ? Date.parse(timeHeader) : Number.NaN;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        if (loadRunRef.current !== runId) {
          URL.revokeObjectURL(url);
          throw new Error('Radar frame was replaced.');
        }

        const frame: LoadedFrame = {
          url,
          time: Number.isFinite(parsedTime) ? parsedTime : Date.now(),
          bounds,
        };

        framesRef.current.set(key, frame);
        objectUrlsRef.current.push(url);
        setFrames(new Map(framesRef.current));

        return frame;
      })();

      pendingRef.current.set(key, promise);

      try {
        return await promise;
      } finally {
        pendingRef.current.delete(key);
      }
    },
    [mode, place.id],
  );

  // A new place starts with a clean cache and returns to the current frame.
  useEffect(() => {
    loadRunRef.current += 1;

    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }

    objectUrlsRef.current = [];
    framesRef.current.clear();
    pendingRef.current.clear();
    setFrames(new Map());
    setPlaying(false);
    setPreparing(null);
    setError(null);
    setIndex(radarOffsets(modeRef.current).indexOf(0));
    setStatus('loading');
  }, [place.id]);

  // Changing the timeframe keeps loaded frames but resets the timeline to now.
  useEffect(() => {
    loadRunRef.current += 1;
    setPlaying(false);
    setPreparing(null);
    setError(null);
    setIndex(radarOffsets(mode).indexOf(0));
    setStatus('loading');
  }, [mode]);

  // Load the frame at the current position. Scrubbing is debounced so dragging
  // the slider does not request every intermediate frame.
  useEffect(() => {
    const offset = offsets[index] ?? 0;
    const key = `${place.id}:${mode}:${offset}`;

    if (framesRef.current.has(key)) {
      setStatus('ready');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    const timer = window.setTimeout(() => {
      ensureFrame(offset)
        .then(() => {
          if (!cancelled) {
            setError(null);
            setStatus('ready');
          }
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setError(errorMessage(loadError));
            setStatus('error');
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ensureFrame, index, mode, offsets, place.id]);

  useEffect(() => {
    if (!playing || preparing) {
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % offsets.length);
    }, PLAYBACK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [offsets.length, playing, preparing]);

  // Create the Leaflet map. It is intentionally recreated when the place
  // changes; this is a small demo card, not a long-lived map application.
  useEffect(() => {
    const container = mapContainerRef.current;

    if (!container) {
      return;
    }

    const map = L.map(container, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false,
      minZoom: 4,
      maxZoom: 10,
    });
    map.setView([place.latitude, place.longitude], RADAR_ZOOM);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    L.circleMarker([place.latitude, place.longitude], {
      radius: 5,
      color: '#ffffff',
      weight: 2,
      fillColor: '#0b5cad',
      fillOpacity: 1,
    }).addTo(map);

    mapRef.current = map;
    overlayRef.current = null;
    overlayUrlRef.current = null;

    const resize = () => map.invalidateSize();
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(resize)
        : null;
    observer?.observe(container);
    window.setTimeout(resize, 0);

    return () => {
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      overlayUrlRef.current = null;
    };
  }, [place.latitude, place.longitude]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !currentFrame) {
      return;
    }

    const bounds = L.latLngBounds(currentFrame.bounds);

    if (!overlayRef.current) {
      overlayRef.current = L.imageOverlay(currentFrame.url, bounds, {
        opacity: 0.72,
        interactive: false,
      }).addTo(map);
      overlayUrlRef.current = currentFrame.url;
      return;
    }

    if (overlayUrlRef.current !== currentFrame.url) {
      overlayRef.current.setBounds(bounds);
      overlayRef.current.setUrl(currentFrame.url);
      overlayUrlRef.current = currentFrame.url;
    }
  }, [currentFrame]);

  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }

      objectUrlsRef.current = [];
    };
  }, []);

  const prepareLoop = useCallback(async () => {
    const runId = loadRunRef.current;
    setPreparing({ loaded: 0, total: offsets.length });
    setError(null);

    let loaded = 0;
    let cancelled = false;
    const queue = [...offsets];

    const worker = async () => {
      while (!cancelled && loadRunRef.current === runId) {
        const offset = queue.shift();

        if (offset === undefined) {
          return;
        }

        try {
          await ensureFrame(offset);
        } catch (loadError) {
          cancelled = true;
          throw loadError;
        }

        if (cancelled || loadRunRef.current !== runId) {
          return;
        }

        loaded += 1;
        setPreparing({ loaded, total: offsets.length });
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(PRELOAD_CONCURRENCY, offsets.length) },
          worker,
        ),
      );

      if (loadRunRef.current !== runId) {
        return;
      }

      setPreparing(null);
      setStatus('ready');
      setPlaying(true);
    } catch (loadError) {
      if (loadRunRef.current !== runId) {
        return;
      }

      setPreparing(null);
      setError(errorMessage(loadError));
    }
  }, [ensureFrame, offsets]);

  const handlePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }

    if (preparing) {
      return;
    }

    void prepareLoop();
  };

  // Demo helper: `?radar=demo&autoplay=1` starts the loop immediately so the
  // animation can be checked without a manual click.
  const autoPlayRef = useRef(false);

  useEffect(() => {
    if (autoPlayRef.current) {
      return;
    }

    if (
      typeof window === 'undefined' ||
      new URLSearchParams(window.location.search).get('autoplay') !== '1'
    ) {
      return;
    }

    autoPlayRef.current = true;
    void prepareLoop();
  }, [prepareLoop]);

  const handleScrub = (value: number) => {
    setPlaying(false);
    setIndex(value);
  };

  const frameTime = currentFrame
    ? formatTime(Math.floor(currentFrame.time / 1000), timezone)
    : null;
  const timeLabel = frameTime
    ? `${formatOffset(currentOffset)} · ${frameTime}`
    : formatOffset(currentOffset);
  const nowPercent =
    offsets.length > 1 ? (nowIndex / (offsets.length - 1)) * 100 : 0;
  const pastLabel = `${RADAR_MODES[mode].pastMinutes / 60}h ago`;
  const futureLabel = `+${RADAR_MODES[mode].futureMinutes / 60}h`;

  return (
    <section
      className="forecast-section radar-section"
      aria-labelledby="radar-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            Radar <span className="beta-badge">Beta</span>
          </p>
          <h2 id="radar-heading">Precipitation radar</h2>
        </div>
        <p className="section-note">Past 2 hours · local time</p>
      </div>

      <p className="radar-beta-note">
        <strong>Beta:</strong> This feature is still being tested. The first load
        of a radar loop can take a few seconds; frames are cached after that.
      </p>

      <div className="card radar-card">
        <div className="radar-map-wrap">
          <div
            ref={mapContainerRef}
            className="radar-map"
            role="region"
            aria-label={`Interactive precipitation radar map centred on ${place.name}`}
          />
          <div className="radar-readout" aria-hidden="true">
            <span className="radar-readout-time">{timeLabel}</span>
            <span className="radar-readout-note">
              {playing ? 'Playing' : 'Paused'}
            </span>
          </div>
        </div>

        <div className="radar-controls">
          <div
            className="radar-modes"
            role="group"
            aria-label="Radar timeframe"
          >
            {(['6h', '12h'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="radar-mode-button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                disabled={preparing !== null}
              >
                {value === '6h' ? '6 hours' : '12 hours'}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="radar-play"
            onClick={handlePlay}
            disabled={preparing !== null}
            aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
          >
            <span className="radar-play-icon" aria-hidden="true">
              {playing ? (
                <svg viewBox="0 0 24 24" focusable="false">
                  <rect x="7" y="5" width="3.5" height="14" rx="1" />
                  <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M8 5.5v13l10-6.5-10-6.5Z" />
                </svg>
              )}
            </span>
            <span>
              {preparing
                ? `Loading ${preparing.loaded}/${preparing.total}`
                : playing
                  ? 'Pause'
                  : 'Play'}
            </span>
          </button>
        </div>

        <div className="radar-timeline">
          <span
            className="radar-track-now"
            style={{ left: `${nowPercent}%` }}
            aria-hidden="true"
          >
            Now
          </span>
          <input
            type="range"
            min={0}
            max={offsets.length - 1}
            step={1}
            value={index}
            onChange={(event) => handleScrub(Number(event.target.value))}
            aria-label="Radar timeline"
            aria-valuetext={timeLabel}
          />
          <span className="radar-track-edge radar-track-start">
            {pastLabel}
          </span>
          <span className="radar-track-edge radar-track-end">
            {futureLabel}
          </span>
        </div>

        <div className="radar-footer">
          <div className="radar-legend">
            <span className="radar-legend-label">Light</span>
            <span className="radar-legend-bar" aria-hidden="true" />
            <span className="radar-legend-label">Heavy</span>
            <span className="radar-legend-note">Rain rate (mm/h)</span>
          </div>
          <p className="radar-attribution">
            Radar:{' '}
            <a href="https://www.visualcrossing.com/" rel="noreferrer">
              Visual Crossing
            </a>{' '}
            · Map: ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              rel="noreferrer"
            >
              OpenStreetMap
            </a>{' '}
            contributors
          </p>
        </div>

        {status === 'loading' && !currentFrame && (
          <p className="inline-notice radar-notice" role="status">
            Loading the current radar frame…
          </p>
        )}

        {status === 'error' && error && (
          <p className="inline-notice radar-notice" role="status">
            {error}
            {currentFrame ? ' Showing the last loaded frame.' : ''}
          </p>
        )}
      </div>
    </section>
  );
}
