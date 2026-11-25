import type { components, paths } from './generated';

export type { components, operations, paths } from './generated';

export type Schemas = components['schemas'];
export type HealthReport = Schemas['HealthReportDto'];
export type LivenessReport = Schemas['LivenessDto'];
export type ProblemDetails = Schemas['ProblemDetailsDto'];
export type DependencyStatus = HealthReport['checks'][number];

/** Every path the API publishes, for compile-time checks in clients. */
export type ApiPath = keyof paths;
