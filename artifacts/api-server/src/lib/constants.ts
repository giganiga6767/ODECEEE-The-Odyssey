export const GAME = {
  oracleRefreshMs: 3_000,
  audioRadiusM: 100,
  locationEmitMs: 7_000,
  heartbeatMs: 20_000,
  socketRateLimitMs: 3_000,
  speedLimitMps: 12,
  qualifyingPingsToCapture: 2,
  defaultRadiusM: 30,
  defaultAccuracySlackM: 40,
  defaultMaxAccuracyM: 200,
} as const;

export const SESSION_COOKIE = "odyssey_session";
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
