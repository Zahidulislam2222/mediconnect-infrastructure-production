/**
 * Prescription hand-over facts shared by doctor-service (refills) and booking-service (payment webhook).
 * doctor-service records a hand-over as DISPENSED + dispensedAt; the retired pharmacy service wrote PICKED_UP +
 * fulfilledAt. Neither timestamp is ever cleared, so the latest one dates the LAST hand-over.
 */
export const DISPENSED_STATUSES: readonly string[] = ['DISPENSED', 'PICKED_UP'];
export const DISPENSE_EVIDENCE = ['dispensedAt', 'fulfilledAt'] as const;

export function lastHandover(rx: Record<string, unknown>): string | undefined {
    return DISPENSE_EVIDENCE.map(field => rx[field]).filter((value): value is string => typeof value === 'string').sort().at(-1);
}

/**
 * A condition that holds only while the prescription is uncancelled and each named field still has the value that was
 * read (or is still absent), so a decision made from that read is never applied over a competing write.
 */
export function observedPrescriptionCondition(rx: Record<string, unknown>, fields: readonly string[]) {
    const clauses = ['attribute_not_exists(cancelledAt)'];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    for (const field of fields) {
        names[`#observed_${field}`] = field;
        if (rx[field] === undefined) clauses.push(`attribute_not_exists(#observed_${field})`);
        else { clauses.push(`#observed_${field} = :observed_${field}`); values[`:observed_${field}`] = rx[field]; }
    }
    return { expression: clauses.join(' AND '), names, values };
}
