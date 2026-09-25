/** Patient-facing cancellation copy. Each refund notice describes only what actually happened to the money. */
export type RefundStatus = "ISSUED" | "PENDING" | "REQUIRES_MANUAL_REFUND" | "NOT_APPLICABLE";

export const REFUND_NOTICES: Record<RefundStatus, string> = {
    ISSUED: "A refund has been issued.",
    PENDING: "A refund has been requested and is being processed by the payment provider.",
    REQUIRES_MANUAL_REFUND: "Your refund could not be completed automatically; our support team will process it.",
    NOT_APPLICABLE: "",
};

export const CANCELLATION_COPY = {
    patientResponse: "Appointment cancelled.",
    doctorResponse: "Appointment cancelled and schedule unlocked.",
    conflict: "This appointment is already cancelled or can no longer be cancelled.",
    changeConflict: "A cancellation of this appointment is in progress. Refresh before trying again.",
    noticeSubjectPatient: "Booking Cancelled",
    noticeSubjectSystem: "Appointment Cancelled",
    notice: (appointmentId: string) => `Your appointment (${appointmentId}) has been cancelled.`,
    // The no-show refund policy is an owner decision, so this notice promises nothing about money.
    noShowNotice: (appointmentId: string) =>
        `Your appointment (${appointmentId}) was recorded as missed. If you have questions about your payment, please contact support.`,
    ledgerPatient: { refunded: "User requested cancellation", manual: "Refund Failed - Contact Support" },
    ledgerNoShow: "No-show cancellation",
    ledgerSystem: "System cancellation",
};

/** Receipt kind and status line for a cancelled appointment. */
export const RECEIPT_STATUS = {
    refunded: "REFUNDED",
    refundPending: "REFUND PENDING",
    underReview: "REFUND UNDER REVIEW",
    cancelled: "CANCELLED",
    noShow: "NO-SHOW",
    paid: "PAID",
};
