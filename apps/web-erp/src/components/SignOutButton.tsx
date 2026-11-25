import { createTranslator, type Locale } from '@erp/localization';
import { buttonSecondary } from './ui';

/** Plain POST form: works without JavaScript; the route checks the Origin header. */
export function SignOutButton({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  return (
    <form action="/session/logout" method="post">
      <button type="submit" className={buttonSecondary}>
        {t('auth.signOut')}
      </button>
    </form>
  );
}
