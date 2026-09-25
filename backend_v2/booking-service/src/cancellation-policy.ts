/**
 * Which appointment statuses each cancellation path may claim. REFUNDED is what the charge.refunded webhook writes
 * for our own refund, so a cancellation whose refund went through but whose save failed can still be finished.
 */
export const PATIENT_CANCELLABLE: readonly string[] = ["CONFIRMED", "REFUNDED"];
export const DOCTOR_CANCELLABLE: readonly string[] = ["CONFIRMED", "IN_PROGRESS", "REFUNDED"];
export const CLEANUP_CANCELLABLE: readonly string[] = ["CONFIRMED"];
