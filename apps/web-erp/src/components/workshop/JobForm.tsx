'use client';

import { createTranslator, type Locale, type MessageKey } from '@erp/localization';
import { FUEL_LEVELS } from '@erp/validation';
import { Plus, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormError, SubmitButton } from '../forms';
import { buttonGhost, buttonSecondary, Field, inputClass } from '../ui';

interface TaskRow {
  key: number;
  description: string;
  hours: string;
}

/** Vehicle check-in (new job card) or editing a draft: details and task lines. */
export function JobForm({
  locale,
  action,
  mode,
  vehicles = [],
  branches = [],
  defaults,
}: {
  locale: Locale;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  mode: 'create' | 'edit';
  vehicles?: { id: string; label: string }[];
  branches?: { id: string; label: string }[];
  defaults: {
    vehicleId?: string;
    branchId?: string;
    complaint?: string;
    odometerIn?: string;
    fuelLevel?: string;
    promisedLocal?: string;
    tasks?: { description: string; hours: string }[];
    version?: number;
  };
}) {
  const t = createTranslator(locale);
  const [state, formAction] = useActionState(action, {} as FormState);
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};
  const kept = v.tasks
    ? v.tasks.split('\n').map((l, i) => {
        const [d = '', h = ''] = l.split('\u0001');
        return { key: i, description: d, hours: h };
      })
    : null;
  const [rows, setRows] = useState<TaskRow[]>(
    kept ??
      (defaults.tasks?.length ? defaults.tasks : [{ description: '', hours: '' }]).map((r, i) => ({
        key: i,
        ...r,
      })),
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const taskError = Object.entries(err).find(([k]) => k.startsWith('tasks'))?.[1];

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error ?? err.form} />
      {defaults.version ? <input type="hidden" name="version" value={defaults.version} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mode === 'create' ? (
          <>
            <Field id="job-vehicle" label={t('job.vehicle')} error={err.vehicleId}>
              <select
                id="job-vehicle"
                name="vehicleId"
                defaultValue={v.vehicleId ?? defaults.vehicleId ?? ''}
                className={inputClass}
                required
              >
                <option value="" disabled>
                  {t('job.chooseVehicle')}
                </option>
                {vehicles.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="job-branch" label={t('job.branch')} error={err.branchId}>
              <select
                id="job-branch"
                name="branchId"
                defaultValue={v.branchId ?? defaults.branchId ?? branches[0]?.id ?? ''}
                className={inputClass}
                required
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        <Field id="job-odometer" label={t('job.odometerIn')} error={err.odometerIn}>
          <input
            id="job-odometer"
            name="odometerIn"
            type="number"
            min={0}
            inputMode="numeric"
            dir="ltr"
            required
            defaultValue={v.odometerIn ?? defaults.odometerIn ?? ''}
            className={inputClass}
          />
        </Field>
        <Field id="job-fuel" label={t('job.fuelLevel')} error={err.fuelLevel}>
          <select
            id="job-fuel"
            name="fuelLevel"
            defaultValue={v.fuelLevel ?? defaults.fuelLevel ?? 'half'}
            className={inputClass}
          >
            {FUEL_LEVELS.map((f) => (
              <option key={f} value={f}>
                {t(`job.fuel.${f}` as MessageKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="job-promised"
          label={`${t('job.promisedAt')} (${t('common.optional')})`}
          error={err.promisedAt}
        >
          <input
            id="job-promised"
            name="promisedAt"
            type="datetime-local"
            dir="ltr"
            defaultValue={v.promisedAt ?? defaults.promisedLocal ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <Field id="job-complaint" label={t('job.complaint')} error={err.complaint}>
        <textarea
          id="job-complaint"
          name="complaint"
          rows={3}
          maxLength={2000}
          required
          defaultValue={v.complaint ?? defaults.complaint ?? ''}
          className={inputClass}
        />
      </Field>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">{t('job.tasks')}</legend>
        <FormError message={taskError} />
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
            <Field id={`task-d-${r.key}`} label={`${t('job.task')} ${i + 1}`}>
              <input
                id={`task-d-${r.key}`}
                name="taskDescription"
                defaultValue={r.description}
                maxLength={500}
                className={inputClass}
              />
            </Field>
            <Field id={`task-h-${r.key}`} label={t('job.hours')}>
              <input
                id={`task-h-${r.key}`}
                name="taskHours"
                defaultValue={r.hours}
                inputMode="decimal"
                dir="ltr"
                className={inputClass}
              />
            </Field>
            <button
              type="button"
              className={buttonGhost}
              aria-label={`${t('job.removeTask')} ${i + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
            >
              <Trash2 aria-hidden size={16} />
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => {
              setRows([...rows, { key: nextKey, description: '', hours: '' }]);
              setNextKey(nextKey + 1);
            }}
          >
            <Plus aria-hidden size={16} />
            {t('job.addTask')}
          </button>
        </div>
      </fieldset>
      <div>
        <SubmitButton label={mode === 'create' ? t('job.open') : t('job.saveDraft')} locale={locale} />
      </div>
    </form>
  );
}
