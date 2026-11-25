import { createTranslator, type Locale } from '@erp/localization';
import { Notice } from './ui';

/** Renders a failed API result for the user: permission, not found or the server's detail. */
export function ProblemNotice({
  result,
  locale,
}: {
  result: { status: number; title?: string; detail?: string };
  locale: Locale;
}) {
  const t = createTranslator(locale);
  const message =
    result.status === 403
      ? t('error.forbidden')
      : result.status === 404
        ? t('error.notFound')
        : result.status === 0
          ? t('error.network')
          : (result.detail ?? result.title ?? t('error.title'));
  return <Notice tone="danger">{message}</Notice>;
}
