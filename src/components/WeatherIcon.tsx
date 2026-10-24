import type { WeatherIconKey } from '../../shared/types';

interface WeatherIconProps {
  condition: WeatherIconKey;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

function Cloud({ withSun = false }: { withSun?: boolean }) {
  return (
    <>
      {withSun && (
        <>
          <circle cx="25" cy="24" r="9" fill="currentColor" opacity="0.9" />
          <g
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.75"
          >
            <path d="M25 8v4" />
            <path d="M12 24h4" />
            <path d="M16 15l-3-3" />
            <path d="M34 15l3-3" />
          </g>
        </>
      )}
      <path
        d="M19 46h28a10 10 0 0 0 0-20 14 14 0 0 0-26-4 10 10 0 0 0-2 24Z"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M19 46h28a10 10 0 0 0 0-20 14 14 0 0 0-26-4 10 10 0 0 0-2 24Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </>
  );
}

function RainLines({ count = 3, heavy = false }: { count?: number; heavy?: boolean }) {
  const xs = count === 2 ? [26, 38] : [24, 33, 42];

  return (
    <g
      stroke="currentColor"
      strokeWidth={heavy ? 3.4 : 2.8}
      strokeLinecap="round"
    >
      {xs.map((x, index) => (
        <path
          key={x}
          d={`M${x} ${50 + (index % 2)}v${heavy ? 7 : 5}`}
        />
      ))}
    </g>
  );
}

function SnowDots() {
  return (
    <g fill="currentColor" opacity="0.8">
      <circle cx="24" cy="53" r="2" />
      <circle cx="34" cy="56" r="2" />
      <circle cx="44" cy="52" r="2" />
    </g>
  );
}

export function WeatherIcon({
  condition,
  size = 'medium',
  className,
}: WeatherIconProps) {
  const classes = ['weather-icon', `weather-icon--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={classes}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      {condition === 'clear' && (
        <>
          <circle cx="32" cy="30" r="13" fill="currentColor" opacity="0.9" />
          <g
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.8"
          >
            <path d="M32 8v5" />
            <path d="M32 47v5" />
            <path d="M10 30h5" />
            <path d="M49 30h5" />
            <path d="M16.5 14.5l3.5 3.5" />
            <path d="M44 42l3.5 3.5" />
            <path d="M47.5 14.5L44 18" />
            <path d="M20 42l-3.5 3.5" />
          </g>
        </>
      )}

      {condition === 'partly-cloudy' && <Cloud withSun />}

      {condition === 'cloudy' && <Cloud />}

      {condition === 'fog' && (
        <>
          <Cloud />
          <g
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.8"
          >
            <path d="M16 51h32" />
            <path d="M21 57h22" />
          </g>
        </>
      )}

      {condition === 'drizzle' && (
        <>
          <Cloud />
          <RainLines count={2} />
        </>
      )}

      {condition === 'rain' && (
        <>
          <Cloud />
          <RainLines />
        </>
      )}

      {condition === 'heavy-rain' && (
        <>
          <Cloud />
          <RainLines heavy />
        </>
      )}

      {condition === 'sleet' && (
        <>
          <Cloud />
          <RainLines count={2} />
          <SnowDots />
        </>
      )}

      {condition === 'snow' && (
        <>
          <Cloud />
          <SnowDots />
        </>
      )}

      {condition === 'thunderstorm' && (
        <>
          <Cloud />
          <path
            d="M34 48l-7 10h6l-3 7 10-12h-6l3-5Z"
            fill="currentColor"
          />
        </>
      )}

      {condition === 'wind' && (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.85"
        >
          <path d="M13 24h27a6 6 0 1 0-5-9" />
          <path d="M13 34h38a6 6 0 1 1-5 9" />
          <path d="M13 44h20a5 5 0 1 1-4 8" />
        </g>
      )}

      {condition === 'unknown' && (
        <>
          <Cloud />
          <text
            x="32"
            y="40"
            textAnchor="middle"
            fontSize="18"
            fontWeight="700"
            fill="currentColor"
          >
            ?
          </text>
        </>
      )}
    </svg>
  );
}
