/**
 * Which appointment statuses each cancellation path may claim. REFUNDED is what the charge.refunded webhook writes
 * for our own refund, so a cancellation whose refund went through but whose save failed can still be finished.
 */
export const REFUNDED_STATUS = "REFUNDED";
/**
 * charge.refunded also marks a FINISHED cancellation REFUNDED, so REFUNDED is claimable only while no cancellation has
 * finished: every cancellation writer (legacy and current) records a refundId or cancellationId or sets the FHIR
 * resource status to "cancelled", and the webhook changes none of them.
 */
export const FHIR_CANCELLED = "cancelled";
export const PATIENT_CANCELLABLE: readonly string[] = ["CONFIRMED", "REFUNDED"];
export const DOCTOR_CANCELLABLE: readonly string[] = ["CONFIRMED", "IN_PROGRESS", "REFUNDED"];
export const CLEANUP_CANCELLABLE: readonly string[] = ["CONFIRMED"];
