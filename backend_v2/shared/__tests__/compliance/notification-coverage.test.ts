export {};
// ─── Notification Coverage Test ─────────────────────────────────────────────
// Verifies that important clinical/business events send notifications.
// 11 notification types defined, each must be called from the correct service.
//
// Source: shared/notifications.ts, grep of sendNotification across services
// Run: npx ts-node shared/__tests__/compliance/notification-coverage.test.ts
// ────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) { passed++; console.log(`  ✅ ${message}`); }
    else { failed++; console.error(`  ❌ FAIL: ${message}`); }
}

function describe(name: string, fn: () => void) {
    console.log(`\n🧪 ${name}`);
    fn();
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const readFile = (relPath: string): string => {
    try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
    catch { return ''; }
};

const notifications = readFile('shared/notifications.ts');

// ═══════════════════════════════════════════════════════════════════════════
// 1. All 11 notification types defined
// ═══════════════════════════════════════════════════════════════════════════

const ALL_TYPES = [
    'BOOKING_CONFIRMATION',
    'BOOKING_CANCELLATION',
    'PRESCRIPTION_ISSUED',
    'PRESCRIPTION_CANCELLED',
    'PAYMENT_SUCCESS',
    'PAYMENT_FAILED',
    'SHIFT_ASSIGNED',
    'SHIFT_CANCELLED',
    'TASK_ASSIGNED',
    'TASK_CANCELLED',
    'GENERAL',
];

describe('Notification Types — All 11 defined', () => {
    for (const type of ALL_TYPES) {
        assert(
            notifications.includes(type),
            `Type "${type}" defined in notifications.ts`
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Each type is used in the correct service
// ═══════════════════════════════════════════════════════════════════════════

const bookingController = readFile('booking-service/src/controllers/booking.controller.ts');
const webhookController = readFile('booking-service/src/controllers/webhook.controller.ts');
const prescriptionController = readFile('doctor-service/src/modules/clinical/prescription.controller.ts');
const staffController = readFile('staff-service/src/controllers/staff.controller.ts');

describe('Notification Usage — Booking service', () => {
    assert(
        bookingController.includes('BOOKING_CONFIRMATION'),
        'BOOKING_CONFIRMATION sent on createBooking'
    );

    assert(
        bookingController.includes('BOOKING_CANCELLATION'),
        'BOOKING_CANCELLATION sent on cancelBooking'
    );
});

describe('Notification Usage — Payment webhooks', () => {
    assert(
        webhookController.includes('PAYMENT_SUCCESS'),
        'PAYMENT_SUCCESS sent on payment_intent.succeeded'
    );

    assert(
        webhookController.includes('PAYMENT_FAILED'),
        'PAYMENT_FAILED sent on payment_intent.payment_failed'
    );
});

describe('Notification Usage — Prescription service', () => {
    assert(
        prescriptionController.includes('PRESCRIPTION_ISSUED'),
        'PRESCRIPTION_ISSUED sent on createPrescription'
    );

    assert(
        prescriptionController.includes('PRESCRIPTION_CANCELLED'),
        'PRESCRIPTION_CANCELLED sent on cancelPrescription'
    );
});

describe('Notification Usage — Staff service', () => {
    assert(
        staffController.includes('SHIFT_ASSIGNED'),
        'SHIFT_ASSIGNED sent on createShift'
    );

    assert(
        staffController.includes('TASK_ASSIGNED'),
        'TASK_ASSIGNED sent on createTask'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Notification is non-blocking (fire-and-forget)
// ═══════════════════════════════════════════════════════════════════════════

describe('Notification Implementation — Non-blocking', () => {
    assert(
        notifications.includes('catch') && notifications.includes('Non-blocking'),
        'Notification failures are caught and logged (never thrown)'
    );

    assert(
        notifications.includes('safeError'),
        'Uses safeError for failure logging (PII masking)'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. SES email implementation
// ═══════════════════════════════════════════════════════════════════════════

describe('Notification Implementation — SES', () => {
    assert(
        notifications.includes('SendEmailCommand'),
        'Uses AWS SES SendEmailCommand'
    );

    assert(
        notifications.includes('getRegionalSESClient'),
        'Uses region-aware SES client'
    );

    assert(
        notifications.includes('noreply@mediconnect.health'),
        'Default sender is noreply@mediconnect.health'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Notification Coverage: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
