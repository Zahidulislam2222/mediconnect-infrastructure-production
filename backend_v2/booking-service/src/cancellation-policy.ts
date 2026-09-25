/**
 * Which appointment statuses each cancellation path may claim. REFUNDED is what the charge.refunded webhook writes
 * for our own refund, so a cancellation whose refund went through but whose save failed can still be finished.
 */
export const REFUNDED_STATUS = "REFUNDED";
/**
 * charge.refunded also marks a FINISHED cancellation REFUNDED, so REFUNDED is claimable only while no cancellation has
 * finished: cancellation writers record a refundId or cancellationId or set the FHIR resource status to "cancelled",
 * and the webhook changes none of them. Known gap: a legacy patient cancel of a row with no resource left no marker;
 * count such rows (REFUNDED, no refundId, cancellationId or resource.status) before deploying.
 */
export const FHIR_CANCELLED = "cancelled";
export const PATIENT_CANCELLABLE: readonly string[] = ["CONFIRMED", "REFUNDED"];
export const DOCTOR_CANCELLABLE: readonly string[] = ["CONFIRMED", "IN_PROGRESS", "REFUNDED"];
export const CLEANUP_CANCELLABLE: readonly string[] = ["CONFIRMED"];

/** The one refund ledger row a cancellation may write; the refund.failed webhook finds it by the same id. */
export const refundBillId = (appointmentId: string) => `refund-${appointmentId}`;
/** Ledger status of a refund row whose money a person must return. */
export const MANUAL_REFUND_LEDGER_STATUS = "FAILED_REQUIRES_MANUAL_REFUND";
