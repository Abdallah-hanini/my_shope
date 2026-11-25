// Build version reported by health endpoints. Overridden at release time via APP_VERSION.
export const APP_VERSION = process.env.APP_VERSION ?? '0.0.0-dev';
