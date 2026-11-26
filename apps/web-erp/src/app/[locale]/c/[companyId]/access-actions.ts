'use server';

import { expectOk, unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import {
  createRoleAssignmentSchema,
  createRoleSchema,
  createStaffSchema,
  setUserStatusSchema,
  updateRoleSchema,
} from '@erp/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v.trim());

export async function createStaffAction(
  localeRaw: string,
  companyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createStaffSchema, {
    username: values.username,
    email: values.email,
    firstName: values.firstName,
    lastName: values.lastName,
    locale: values.locale || 'en',
    roleId: values.roleId,
    branchId: blank(values.branchId) ?? null,
    requireOtp: form.get('requireOtp') === 'on',
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let result: FormState['result'];
  const failed = await mutate(locale, values, async (api) => {
    const created = unwrap(
      await api.POST('/api/v1/companies/{companyId}/users', {
        params: { path: { companyId } },
        body: v.data,
      }),
    );
    result = {
      userId: created.user.id,
      name: created.user.displayName,
      username: v.data.username,
      temporaryPassword: created.temporaryPassword,
    };
  });
  if (failed) return failed;
  // Refresh the list; the temporary password goes back only to this form, never into a URL or log.
  revalidatePath(`/${locale}/c/${companyId}/users`);
  return { result };
}

export async function resetPasswordAction(
  localeRaw: string,
  companyId: string,
  userId: string,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  let result: FormState['result'];
  const failed = await mutate(locale, {}, async (api) => {
    const r = unwrap(
      await api.POST('/api/v1/companies/{companyId}/users/{userId}/reset-password', {
        params: { path: { companyId, userId } },
      }),
    );
    result = { temporaryPassword: r.temporaryPassword };
  });
  return failed ?? { result };
}

export async function setUserStatusAction(
  localeRaw: string,
  companyId: string,
  userId: string,
  status: 'active' | 'inactive',
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(setUserStatusSchema, { status, reason: values.reason });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/users/{userId}/status', {
        params: { path: { companyId, userId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/users/${userId}`);
}

export async function assignRoleAction(
  localeRaw: string,
  companyId: string,
  userId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createRoleAssignmentSchema, {
    userId,
    roleId: values.roleId,
    branchId: blank(values.branchId) ?? null,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/role-assignments', {
        params: { path: { companyId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/users/${userId}`);
}

export async function revokeAssignmentAction(
  localeRaw: string,
  companyId: string,
  userId: string,
  assignmentId: string,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const failed = await mutate(locale, {}, async (api) => {
    expectOk(
      await api.DELETE('/api/v1/companies/{companyId}/role-assignments/{assignmentId}', {
        params: { path: { companyId, assignmentId } },
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/users/${userId}`);
}

function rolePermissions(form: FormData): string[] {
  return form.getAll('permissions').filter((v): v is string => typeof v === 'string');
}

export async function createRoleAction(
  localeRaw: string,
  companyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const permissions = rolePermissions(form);
  const v = validate(createRoleSchema, {
    code: values.code,
    name: values.name,
    nameAr: blank(values.nameAr),
    permissions,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values: { ...values, permissions: permissions.join(',') } };
  let roleId = '';
  const failed = await mutate(locale, values, async (api) => {
    roleId = unwrap(
      await api.POST('/api/v1/companies/{companyId}/roles', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return { ...failed, values: { ...values, permissions: permissions.join(',') } };
  redirect(`/${locale}/c/${companyId}/roles/${roleId}`);
}

export async function updateRoleAction(
  localeRaw: string,
  companyId: string,
  roleId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const permissions = rolePermissions(form);
  const v = validate(updateRoleSchema, {
    name: values.name,
    nameAr: blank(values.nameAr) ?? null,
    permissions,
    version: Number(values.version),
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values: { ...values, permissions: permissions.join(',') } };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PATCH('/api/v1/companies/{companyId}/roles/{roleId}', {
        params: { path: { companyId, roleId } },
        body: v.data,
      }),
    );
  });
  if (failed) return { ...failed, values: { ...values, permissions: permissions.join(',') } };
  redirect(`/${locale}/c/${companyId}/roles/${roleId}?saved=1`);
}

export async function deleteRoleAction(
  localeRaw: string,
  companyId: string,
  roleId: string,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const failed = await mutate(locale, {}, async (api) => {
    expectOk(
      await api.DELETE('/api/v1/companies/{companyId}/roles/{roleId}', {
        params: { path: { companyId, roleId } },
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/roles`);
}
