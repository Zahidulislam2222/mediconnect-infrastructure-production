import type Stripe from 'stripe';

/** Reconcile against provider records even after the provider idempotency cache expires. */
export async function obtainErasureRefund(stripe: Stripe, paymentId: string, appointmentId: string, requestId: string, maxPages: number): Promise<Stripe.Refund> {
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const refunds = await stripe.refunds.list({ payment_intent: paymentId, starting_after: cursor });
    const existing = refunds.data.find(refund => refund.metadata?.erasureRequestId === requestId && refund.metadata?.appointmentId === appointmentId);
    if (existing) {
      if (existing.status !== 'succeeded') throw new Error('PRIVACY_REFUND_RECONCILIATION_REQUIRED');
      return existing;
    }
    if (!refunds.has_more) {
      const refund = await stripe.refunds.create({ payment_intent: paymentId, metadata: { erasureRequestId: requestId, appointmentId } }, { idempotencyKey: `erasure-${requestId}-${appointmentId}` });
      if (refund.status !== 'succeeded') throw new Error('PRIVACY_REFUND_RECONCILIATION_REQUIRED');
      return refund;
    }
    const next = refunds.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error('PRIVACY_REFUND_PAGINATION_STALLED');
    cursor = next;
  }
  throw new Error('PRIVACY_REFUND_RECONCILIATION_REQUIRED');
}
