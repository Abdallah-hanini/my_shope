/** Shared between server actions and client forms (no server-only imports here). */
export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}
