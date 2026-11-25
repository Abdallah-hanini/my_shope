import { createApiClient } from '@erp/api-client';

export const APP_ROLE = 'manager' as const;
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export const api = createApiClient({ baseUrl: API_URL });
