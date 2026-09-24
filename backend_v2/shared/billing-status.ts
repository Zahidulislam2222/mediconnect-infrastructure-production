/** Ledger statuses that /billing/pay may charge. The payment webhook and prescription cancellation must agree with it. */
export const PAYABLE_BILL_STATUSES: readonly string[] = ['PENDING', 'DUE', 'UNPAID', 'FAILED'];
