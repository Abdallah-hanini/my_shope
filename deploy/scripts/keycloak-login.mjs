// Shared by deploy/scripts/verify-deployment.mjs and scripts/e2e-web.mjs: completes a Keycloak
// sign-in in a Playwright page, including first-login required actions.
import { createHmac, randomBytes } from 'node:crypto';

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), as configured in the erp realm. */
export function totp(secretBase32, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretBase32.replace(/\s+/g, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Fills the Keycloak login form, then handles password change and authenticator enrolment in
 * whatever order Keycloak presents them, until the URL satisfies `done(url)`.
 * For a returning user pass `totpSecret` so the one-time code can be answered.
 * Returns { newPassword, totpSecret, completed: {password, totp} }.
 */
export async function keycloakLogin(page, { username, password, done, totpSecret: knownSecret }) {
  await page.waitForSelector('#username');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await Promise.all([page.waitForNavigation(), page.click('#kc-login')]);
  const completed = { password: false, totp: false, otpAttempts: 0 };
  let newPassword = password;
  let totpSecret = knownSecret;
  for (let step = 0; step < 6 && !done(page.url()); step++) {
    await page.waitForLoadState('load');
    if (done(page.url())) break;
    if (await page.locator('#password-new').count()) {
      if (completed.password) throw new Error('new password was rejected');
      newPassword = `Np-${randomBytes(12).toString('base64url')}`;
      await page.fill('#password-new', newPassword);
      await page.fill('#password-confirm', newPassword);
      await Promise.all([page.waitForNavigation(), page.locator('[type=submit]').first().click()]);
      completed.password = true;
    } else if ((await page.locator('#otp').count()) && !(await page.locator('#totpSecret').count())) {
      // Returning user: one-time code from the enrolled authenticator.
      if (!totpSecret) throw new Error('Keycloak asked for a one-time code but no TOTP secret is known');
      if (completed.otpAttempts >= 2) throw new Error('one-time code was rejected twice');
      if (completed.otpAttempts === 1) {
        // Keycloak refuses reuse of a code inside its 30 s window; wait for the next window.
        await page.waitForTimeout((30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000);
      }
      completed.otpAttempts = (completed.otpAttempts ?? 0) + 1;
      await page.fill('#otp', totp(totpSecret));
      await Promise.all([page.waitForNavigation(), page.locator('[type=submit]').first().click()]);
    } else if (await page.locator('#totpSecret').count()) {
      if (completed.totp) throw new Error('authenticator code was rejected');
      // The manual-entry key (Base32) is what an authenticator app uses.
      if (await page.locator('#mode-manual').count()) await page.click('#mode-manual');
      totpSecret = (await page.locator('#kc-totp-secret-key').innerText()).trim();
      await page.fill('#totp', totp(totpSecret));
      if (await page.locator('#userLabel').count()) await page.fill('#userLabel', 'automated check');
      await Promise.all([page.waitForNavigation(), page.click('#saveTOTPBtn')]);
      completed.totp = true;
    } else if (
      (await page.locator('#kc-login').count()) &&
      (await page.locator('#input-error, .kc-feedback-text, [id^=input-error]').count())
    ) {
      throw new Error('Keycloak rejected the username or password');
    } else {
      throw new Error(`unexpected page ${page.url()}`);
    }
  }
  if (!done(page.url())) throw new Error(`sign-in did not finish; ended at ${page.url()}`);
  return { newPassword, totpSecret, completed };
}
