/**
 * Radar demo configuration. These values are shared by the client timeline and
 * the server-side image proxy so both agree on which frame timestamps exist.
 *
 * The demo uses short, evenly spaced steps rather than a provider-specific
 * timeline. Past frames are observations; future frames come from the
 * provider's forecast models.
 */
export type RadarMode = '6h' | '12h';

export interface RadarModeConfig {
  pastMinutes: number;
  futureMinutes: number;
  stepMinutes: number;
}

export const RADAR_MODES: Record<RadarMode, RadarModeConfig> = {
  '6h': { pastMinutes: 120, futureMinutes: 360, stepMinutes: 30 },
  '12h': { pastMinutes: 120, futureMinutes: 720, stepMinutes: 60 },
};

export const RADAR_ZOOM = 8;
/**
 * The provider returns a white-backed image, not a transparent overlay. The
 * card uses `mix-blend-mode: multiply` so white disappears, and a frame larger
 * than the card keeps the whole map covered at zoom 7.
 */
export const RADAR_WIDTH = 1280;
export const RADAR_HEIGHT = 720;

export function isRadarMode(value: string | null): value is RadarMode {
  return value === '6h' || value === '12h';
}

/**
 * Offsets in minutes relative to the current frame, inclusive of both ends.
 * `0` is always present so the UI can label the current frame.
 */
export function radarOffsets(mode: RadarMode): number[] {
  const { pastMinutes, futureMinutes, stepMinutes } = RADAR_MODES[mode];
  const offsets: number[] = [];

  for (
    let offset = -pastMinutes;
    offset <= futureMinutes;
    offset += stepMinutes
  ) {
    offsets.push(offset);
  }

  return offsets;
}

/**
 * Quantises "now" to the mode's step so repeated requests during the same
 * interval reuse one cached image instead of consuming one request per second.
 */
export function radarBaseEpoch(nowMs: number, mode: RadarMode): number {
  const stepMs = RADAR_MODES[mode].stepMinutes * 60_000;
  return Math.floor(nowMs / stepMs) * stepMs;
}
