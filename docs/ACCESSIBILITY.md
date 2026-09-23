# Accessibility

Last reviewed: 2026-09-24 · Target standard: **WCAG 2.2 Level AA** across web, Android and iOS

Healthcare must be usable by people with visual, hearing, motor and cognitive disabilities, older
adults, and people on slow devices or connections.

## 1. Legal drivers

| Law | Scope | Standard / date |
|---|---|---|
| ADA Title III (US) | Private businesses serving the public; courts routinely apply it to websites | WCAG 2.1 AA is the common benchmark |
| ADA Title II (US) | State and local government services (relevant for public-sector customers) | WCAG 2.1 AA; deadlines extended to April 2027 / April 2028 |
| Section 504 (HHS rule) and Section 1557 (US) | Recipients of HHS funding, including many clinics | WCAG 2.1 AA; recipients with 15+ employees from May 2026 |
| European Accessibility Act | E-commerce and consumer digital services in the EU | In force since 28 June 2025 (EN 301 549) |
| UK Equality Act 2010 | Reasonable adjustments for service providers | WCAG 2.2 AA recommended |

## 2. Design rules

- Keyboard access to every control, visible focus, logical order, and no keyboard traps.
- Colour contrast ≥ 4.5:1 for text and ≥ 3:1 for large text and interface parts, using the design tokens.
- Every image, icon button and video has a text alternative. Videos have captions and a pause control, and respect "reduce motion".
- Text scales to 200% (web) and to the largest system text size (Android and iOS) without clipping. The iOS test suite already includes a largest-text settings flow.
- Forms have labels, clear error messages and no time limits without an option to extend them. The 15-minute inactivity sign-out currently happens **without a warning**; adding a warning with a "stay signed in" option (WCAG 2.2.1 Timing Adjustable) is open work.
- Screen reader support: semantic HTML and ARIA only where needed on the web; TalkBack and VoiceOver labels on native.
- Video consultations support captions and sign-language interpreters as participants (PLANNED).

## 3. Testing

| Method | Status |
|---|---|
| Playwright browser tests (exist) extended with automated axe-core accessibility checks | PLANNED (axe-core not yet added) |
| Manual keyboard and screen-reader pass (NVDA, VoiceOver, TalkBack) | PLANNED before launch |
| External accessibility audit and published accessibility statement | PLANNED before launch |
