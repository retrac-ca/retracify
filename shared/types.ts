export type WeatherIconKey =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'sleet'
  | 'snow'
  | 'thunderstorm'
  | 'wind'
  | 'unknown';

export interface WeatherCondition {
  key: WeatherIconKey;
  label: string;
}

export interface Place {
  id: string;
  name: string;
  admin1?: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  population?: number;
  timezone?: string;
}

export interface CurrentConditions {
  epoch: number | null;
  time: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  condition: WeatherCondition;
  highC: number | null;
  lowC: number | null;
  windKph: number | null;
  windDirectionDeg: number | null;
  precipitationProbability: number | null;
  humidity: number | null;
}

export interface HourlyForecast {
  epoch: number;
  time: string | null;
  isNow: boolean;
  temperatureC: number | null;
  feelsLikeC: number | null;
  condition: WeatherCondition;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  windKph: number | null;
}

export interface DailyForecast {
  date: string;
  epoch: number;
  condition: WeatherCondition;
  highC: number | null;
  lowC: number | null;
  precipitationProbability: number | null;
  precipitationMm: number | null;
}

export interface Units {
  temperature: '°C';
  windSpeed: 'km/h';
  precipitation: 'mm';
}

export interface Attribution {
  name: string;
  url: string;
  licenseName?: string;
  licenseUrl?: string;
}

export interface Forecast {
  place: Place;
  timezone: string;
  timezoneOffsetSeconds: number | null;
  fetchedAt: string;
  current: CurrentConditions | null;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  units: Units;
  attribution: Attribution;
}

export interface SearchResponse {
  results: Place[];
}

export interface ForecastResponse {
  forecast: Forecast;
  /**
   * True when the API served a cached forecast because the provider could not
   * be reached. The client should mark the data as potentially out of date.
   */
  stale?: boolean;
}

export interface ReverseResponse {
  place: Place;
}

export type ApiErrorCode =
  | 'INVALID_QUERY'
  | 'INVALID_COORDINATES'
  | 'INVALID_PLACE'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFIGURATION'
  | 'RATE_LIMITED'
  | 'BUDGET_EXHAUSTED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UPSTREAM_AUTH'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    retryAfterSeconds?: number;
  };
}
