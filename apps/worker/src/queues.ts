/** Queue names are centralized so producers and consumers cannot drift apart. */
export const QUEUES = {
  system: 'system',
} as const;

export const JOBS = {
  heartbeat: 'heartbeat',
} as const;
