# UI acceptance criteria

These apply to every screen. A screen is "Implemented" in docs/SCREEN_CATALOG.md only when its automated evidence covers them.

1. **States:** loading (server render, or a pending button), empty (guidance text), error (server RFC 9457 detail, never a stack trace), forbidden (403 notice; foreign company 404), success (data the server confirmed).
2. **Authorization:** actions are hidden without the permission and **also** refused by the API (tested on the API). No other company's or branch's data is ever rendered.
3. **Transactions:**
   - The submit button disables while pending.
   - Money mutations carry an idempotency key.
   - Results come from the server response; there is no optimistic success.
4. **Money:**
   - Exact decimal strings with grouped digits, the currency shown, and tabular numerals.
   - Totals computed client-side are guidance only; the server recomputes.
5. **Bilingual:** every label is in the English and Arabic catalogues, which a test enforces to have identical keys. Arabic pages are RTL with mirrored navigation, and identifiers and money stay left-to-right.
6. **Responsive:** no horizontal page scroll at 390 px (browser test). Navigation becomes a drawer below 1024 px. Touch targets are at least 40 px, and 44 px on mobile controls.
7. **Accessibility:**
   - Landmarks, skip link, labelled controls, visible focus.
   - Charts have data tables.
   - Colour is never the only signal (badges carry text; negatives carry a minus sign).
8. **Themes:** light and dark tokens pass contrast tests. The theme is applied before paint.
9. **No dead UI:** no button or menu item without a working action. Unimplemented features are absent, not disabled stubs.
10. **Evidence:** screenshots per screen, locale, theme and size are captured with Playwright, and each change records in STATUS.md the commands run.
