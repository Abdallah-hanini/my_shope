/** Shared between server actions and client forms (no server-only imports here). */
export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** Server-confirmed outcome to show in place (e.g. a one-time temporary password). */
  result?: Record<string, string>;
}
