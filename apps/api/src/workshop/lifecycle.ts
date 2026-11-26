import { OPEN_JOB_STATUSES, type JobStatus } from '@erp/validation';

/**
 * Job card lifecycle (SRS: draft → approved → assigned → in progress → QC → ready → delivered;
 * failed QC → rework; cancellation). Pure rules; JobService enforces them with the database.
 */
export type JobAction =
  | 'edit'
  | 'inspect'
  | 'addPhoto'
  | 'removePhoto'
  | 'authorize'
  | 'assign'
  | 'start'
  | 'completeTask'
  | 'submitQc'
  | 'qc'
  | 'deliver'
  | 'cancel'
  | 'promise'
  | 'note'
  | 'proposeAddition'
  | 'decideAddition'
  | 'withdrawAddition';

/** Statuses in which each action is possible (permissions are checked separately). */
export const ACTION_STATUSES: Record<JobAction, readonly JobStatus[]> = {
  edit: ['draft'],
  inspect: ['draft'],
  authorize: ['draft'],
  assign: ['draft', 'approved', 'assigned', 'in_progress', 'rework'],
  start: ['assigned'],
  completeTask: ['in_progress', 'rework'],
  submitQc: ['in_progress', 'rework'],
  qc: ['qc'],
  deliver: ['ready'],
  cancel: ['draft', 'approved', 'assigned', 'in_progress', 'rework', 'qc', 'ready'],
  promise: ['draft', 'approved', 'assigned', 'in_progress', 'rework', 'qc', 'ready'],
  note: ['draft', 'approved', 'assigned', 'in_progress', 'rework', 'qc', 'ready', 'delivered', 'cancelled'],
  addPhoto: ['draft', 'approved', 'assigned', 'in_progress', 'rework', 'qc', 'ready'],
  // Once work is authorised, photos are evidence (the database enforces this too).
  removePhoto: ['draft'],
  // Additional work is found once the job is authorised and before it goes to the quality check.
  proposeAddition: ['approved', 'assigned', 'in_progress', 'rework'],
  decideAddition: ['approved', 'assigned', 'in_progress', 'rework'],
  withdrawAddition: ['approved', 'assigned', 'in_progress', 'rework'],
};

export const OPEN_STATUSES: readonly JobStatus[] = OPEN_JOB_STATUSES;

/** Technicians clock time while work is under way (the same statuses as completing a task). */
export const CLOCK_STATUSES: readonly JobStatus[] = ['in_progress', 'rework'];
/** A manager may enter missed time once work has started, including after delivery. */
export const TIME_ENTRY_STATUSES: readonly JobStatus[] = [
  'in_progress',
  'rework',
  'qc',
  'ready',
  'delivered',
];

export function allowedInStatus(action: JobAction, status: JobStatus): boolean {
  return ACTION_STATUSES[action].includes(status);
}

/** After a technician assignment changes: approved ⇄ assigned depending on whether every task has one. */
export function statusAfterAssignment(status: JobStatus, allTasksAssigned: boolean): JobStatus {
  if (status === 'approved' && allTasksAssigned) return 'assigned';
  if (status === 'assigned' && !allTasksAssigned) return 'approved';
  return status;
}

/** Who may act, given the actor's capabilities on the job's branch and their role on the job. */
export interface Actor {
  manage: boolean;
  work: boolean;
  qc: boolean;
  /** The actor is the technician of at least one task on this job. */
  onJob: boolean;
  /** The actor is the technician of the task concerned (completeTask). */
  onTask?: boolean;
}

export function permits(action: JobAction, a: Actor): boolean {
  switch (action) {
    case 'edit':
    case 'inspect':
    case 'removePhoto':
    case 'authorize':
    case 'assign':
    case 'deliver':
    case 'cancel':
    case 'promise':
      return a.manage;
    case 'addPhoto':
      // Technicians may photograph damage they find on a job they work on.
      return a.manage || (a.work && a.onJob);
    case 'start':
    case 'submitQc':
      return a.manage || (a.work && a.onJob);
    case 'completeTask':
      return a.manage || (a.work && !!a.onTask);
    case 'qc':
      // Segregation of duties: nobody inspects work they did on this job.
      return a.qc && !a.onJob;
    case 'note':
      return a.manage || a.work || a.qc;
    case 'proposeAddition':
      // Whoever finds it: a manager, or a technician working on this job.
      return a.manage || (a.work && a.onJob);
    case 'decideAddition':
      // Recording the customer's decision, like the first authorisation.
      return a.manage;
    case 'withdrawAddition':
      // Managers, or the proposer (checked by the service).
      return a.manage || a.work;
  }
}

/** Actions the actor can take now (for the client to show; the server checks again). */
export function availableActions(status: JobStatus, a: Actor): JobAction[] {
  return (Object.keys(ACTION_STATUSES) as JobAction[]).filter(
    (k) =>
      !['completeTask', 'decideAddition', 'withdrawAddition'].includes(k) &&
      allowedInStatus(k, status) &&
      permits(k, a),
  );
}
