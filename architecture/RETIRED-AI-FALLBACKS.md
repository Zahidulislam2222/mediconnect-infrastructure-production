# Historical AI fallback behavior — preserved for incident review

These fallbacks were present before the2026-09-09 release audit. They are preserved here as
historical implementation evidence, not active clinical behavior. An unavailable provider is not
evidence of any patient's risk level.

- Both text provider chains returned `risk: Medium`, provider `System Recovery`, model
  `Emergency-Fallback`, reason: “AI Clinical Service is temporarily degraded. Standard protocols
  suggest immediate clinical review.”
- The symptom controller replaced unparseable output with `risk: Medium`, reason “Analysis partial.”
- The frontend replaced service failures with simulated low-risk rest/hydration advice. That copy
  remains labelled retired in its content data; it is not used for real symptom input.

The source fix replaces the backend fallbacks with explicit unavailability and validates the
assessment before report/persistence. A successful symptom response now declares
`success: true`, `status: available`, and its actual provider. The frontend requires that contract;
older responses must not silently masquerade as current validated results. Deploy both sides as
one compatible release after full gates. This is contract validation, not medical validation.
