import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Place } from '../../shared/types';

const RadarMap = lazy(() =>
  import('./RadarMap').then((module) => ({
    default: module.RadarMap,
  })),
);

interface RadarSectionProps {
  place: Place;
  timezone: string;
}

/**
 * Keeps Leaflet and the first radar request out of the initial page load. The
 * section heading and beta note render immediately; the map itself loads when
 * the card is about to enter the viewport.
 */
export function RadarSection({ place, timezone }: RadarSectionProps) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (shouldLoad) {
      return;
    }

    const node = sectionRef.current;

    if (!node || typeof IntersectionObserver !== 'function') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <section
      ref={sectionRef}
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
        Availability is limited while in beta.
      </p>

      {shouldLoad ? (
        <Suspense
          fallback={
            <p className="inline-notice" role="status">
              Loading the radar…
            </p>
          }
        >
          <RadarMap place={place} timezone={timezone} />
        </Suspense>
      ) : (
        <div className="card radar-card">
          <div className="radar-map radar-map--placeholder" aria-hidden="true" />
          <p className="inline-notice radar-notice" role="status">
            The radar map loads when you scroll here.
          </p>
        </div>
      )}
    </section>
  );
}
