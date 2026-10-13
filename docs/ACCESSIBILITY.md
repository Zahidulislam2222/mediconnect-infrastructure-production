# Accessibility and inclusive journeys

Reviewed 2026-10-13. The web target is **WCAG 2.2 Level AA**. This is an acceptance objective, not a claim of a completed conformance audit. Native clients need platform-specific assistive-technology and device verification.

## Required behavior

Use semantic landmarks, headings and controls; accessible names; visible keyboard focus; sensible focus order and focus restoration. Ensure dialogs, menus, forms and route changes work without a mouse. Errors must identify the field, explain recovery and remain perceivable to assistive technology. Announce asynchronous status without excessive interruption.

Support zoom, text resizing, reflow and narrow viewports without hiding essential controls or requiring two-dimensional scrolling for ordinary content. Provide adequate text/non-text contrast, sufficiently usable targets and alternatives to motion/gesture-only interactions. Honor reduced-motion preferences. Do not convey clinical or validation meaning by color alone.

Authentication must support accessible password-manager and MFA flows, understandable expiry/recovery, and appropriate alternatives. Consent, checkout, cancellation, records export and support must remain usable with keyboard and assistive technology. Documents and video features require accessible reading order, captions/transcripts or appropriate alternatives according to their scope.

## Verification matrix

| Journey | Required verification |
|---|---|
| Public home, navigation, contact and legal pages | Keyboard, headings/links, 320 CSS-pixel reflow, zoom, reduced motion and screen-reader reading |
| Editorial lists/readers | Search/filter labels, image alternatives, readable content order, focus on navigation and reload |
| Identity/profile | Form labels/errors, password manager, MFA, expiry, focus and largest-text interaction |
| Booking/payment/cancellation | Confirmation/readback, error recovery, deadlines, control names and status announcements |
| Clinical/AI content | Plain-language limitations, source links, accessible status, human escalation and emergency route |
| Android/iOS | TalkBack/VoiceOver, dynamic text, keyboard, orientation, lifecycle and physical-device checks |

Combine automated browser checks with manual keyboard, screen reader, contrast and assistive-technology testing. Record browser/device/OS, viewport/text settings, route, result and defects. An automated score alone cannot establish conformance.

The scoped public contact/legal checks passed content and 320-pixel wrapping tests. Existing native records include regional simulator/emulator and large-text checks. Neither result establishes complete web/native conformance or the unfinished authenticated journeys.

Track defects by severity and affected journey, provide a usable alternative, retest fixes and publish an accessibility statement with supported scope and contact before wider activation. Public support: **muhammadzahidulislam2222@gmail.com**; do not send medical records through ordinary email.

Primary references: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), [US Department of Justice web accessibility guidance](https://www.ada.gov/resources/web-guidance/). See [roadmap](ROADMAP.md) and [release status](RELEASE-STATUS.md).
