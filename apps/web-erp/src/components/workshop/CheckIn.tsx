import type { JobCard } from '@erp/api-client';
import { createTranslator, formatDateTime, type Locale, type MessageKey } from '@erp/localization';
import { INSPECTION_ITEMS, INSPECTION_STATUSES, PHOTO_AREAS } from '@erp/validation';
import type { FormState } from '@/lib/form-state';
import { ActionButton } from '../access/ActionButton';
import { Badge, buttonGhost, Card, inputClass } from '../ui';
import { InlineForm } from './InlineForm';

const GROUPS = [...new Set(INSPECTION_ITEMS.map((i) => i.group))];
const TONE = { ok: 'success', attention: 'warning', not_checked: 'neutral' } as const;

/** WEB-015 check-in inspection: a form while the job is a draft, read-only evidence afterwards. */
export function InspectionCard({
  job,
  locale,
  timeZone,
  action,
}: {
  job: JobCard;
  locale: Locale;
  timeZone: string;
  action?: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const t = createTranslator(locale);
  const answers = new Map((job.inspection?.items ?? []).map((i) => [i.key, i]));
  const label = (key: string) => t(`insp.item.${key}` as MessageKey);
  return (
    <Card title={t('insp.title')} id="inspection">
      {job.inspection ? (
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          {t('insp.recordedBy')}: {job.inspection.recordedByName} ·{' '}
          {formatDateTime(locale, job.inspection.recordedAt, timeZone)}
        </p>
      ) : (
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          {action ? t('insp.help') : t('insp.notRecorded')}
        </p>
      )}
      {action ? (
        <InlineForm
          action={action}
          locale={locale}
          submitLabel={t('insp.record')}
          className="flex flex-col gap-4"
          ariaLabel={t('insp.title')}
        >
          <input type="hidden" name="version" value={job.version} />
          {GROUPS.map((g) => (
            <fieldset key={g} className="rounded-lg border border-[var(--color-border)] p-3">
              <legend className="px-1 text-sm font-semibold">{t(`insp.group.${g}` as MessageKey)}</legend>
              <ul className="flex flex-col divide-y divide-[var(--color-border)]">
                {INSPECTION_ITEMS.filter((i) => i.group === g).map((i) => {
                  const a = answers.get(i.key);
                  return (
                    <li
                      key={i.key}
                      className="grid grid-cols-1 gap-2 py-2 md:grid-cols-[minmax(10rem,1fr)_auto_minmax(10rem,1fr)] md:items-center"
                    >
                      <span className="text-sm font-medium" id={`insp-${i.key}`}>
                        {label(i.key)}
                      </span>
                      <span
                        role="radiogroup"
                        aria-labelledby={`insp-${i.key}`}
                        className="flex flex-wrap gap-3 text-sm"
                      >
                        {INSPECTION_STATUSES.map((s) => (
                          <label key={s} className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`status_${i.key}`}
                              value={s}
                              defaultChecked={(a?.status ?? 'ok') === s}
                            />
                            {t(`insp.status.${s}` as MessageKey)}
                          </label>
                        ))}
                      </span>
                      <input
                        name={`note_${i.key}`}
                        aria-label={`${t('insp.note')}: ${label(i.key)}`}
                        defaultValue={a?.note ?? ''}
                        maxLength={500}
                        placeholder={t('insp.note')}
                        className={inputClass}
                      />
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </InlineForm>
      ) : job.inspection ? (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {job.inspection.items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-baseline gap-2" data-inspection={i.key}>
              <span className="min-w-40">{label(i.key)}</span>
              <Badge tone={TONE[i.status as keyof typeof TONE] ?? 'neutral'}>
                {t(`insp.status.${i.status}` as MessageKey)}
              </Badge>
              {i.note ? <span className="text-[var(--color-text-muted)]">{i.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/** Vehicle photos: thumbnails (open full size), upload while the job is open, remove in a draft. */
export function PhotosCard({
  job,
  locale,
  timeZone,
  photoHref,
  upload,
  remove,
}: {
  job: JobCard;
  locale: Locale;
  timeZone: string;
  photoHref: (photoId: string, thumb: boolean) => string;
  upload?: (s: FormState, f: FormData) => Promise<FormState>;
  remove?: (photoId: string) => () => Promise<FormState>;
}) {
  const t = createTranslator(locale);
  return (
    <Card title={`${t('photo.title')} (${job.photos.length})`} id="photos">
      {job.photos.length === 0 ? (
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">{t('photo.empty')}</p>
      ) : (
        <ul
          className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          aria-label={t('photo.title')}
        >
          {job.photos.map((ph) => {
            const area = t(`photo.area.${ph.area}` as MessageKey);
            return (
              <li
                key={ph.id}
                data-photo={ph.area}
                className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] p-2"
              >
                <a
                  href={photoHref(ph.id, false)}
                  target="_blank"
                  rel="noopener"
                  aria-label={`${t('photo.open')}: ${area}${ph.caption ? ` — ${ph.caption}` : ''}`}
                >
                  {/* Thumbnails are small private JPEGs from our route; next/image optimisation is not needed. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoHref(ph.id, true)}
                    alt={`${area}${ph.caption ? `: ${ph.caption}` : ''}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded object-cover"
                  />
                </a>
                <span className="text-xs font-medium">{area}</span>
                {ph.caption ? <span className="text-xs">{ph.caption}</span> : null}
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {ph.uploadedByName} · {formatDateTime(locale, ph.createdAt, timeZone)}
                </span>
                {remove ? (
                  <ActionButton
                    locale={locale}
                    label={t('photo.remove')}
                    className={buttonGhost}
                    action={remove(ph.id)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {upload ? (
        <InlineForm
          action={upload}
          locale={locale}
          submitLabel={t('photo.add')}
          className="flex flex-col gap-3"
          ariaLabel={t('photo.add')}
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="photo-files">
            {t('photo.files')}
            <input
              id="photo-files"
              name="files"
              type="file"
              multiple
              required
              accept="image/jpeg,image/png,image/webp"
              className="text-sm"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="photo-area">
              {t('photo.area')}
              <select id="photo-area" name="area" defaultValue="front" className={inputClass}>
                {PHOTO_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {t(`photo.area.${a}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="photo-caption">
              {t('photo.caption')} ({t('common.optional')})
              <input id="photo-caption" name="caption" maxLength={200} className={inputClass} />
            </label>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{t('photo.help')}</p>
        </InlineForm>
      ) : null}
    </Card>
  );
}
