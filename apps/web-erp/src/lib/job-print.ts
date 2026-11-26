import type { JobCard } from '@erp/api-client';

/** Facts for the printed handover sheet, from the job card (no server-only imports). */
export function handoverFacts(j: Pick<JobCard, 'status' | 'events' | 'additions'>) {
  return {
    /** The handover sheet exists once the work passed the quality check. */
    available: j.status === 'ready' || j.status === 'delivered',
    /** The latest passed quality check (after any rework). */
    qc: [...j.events].reverse().find((e) => e.kind === 'qc_pass') ?? null,
    /** Work recommended during the job that the customer declined (not withdrawn proposals). */
    declined: j.additions.filter((a) => a.status === 'declined'),
  };
}
