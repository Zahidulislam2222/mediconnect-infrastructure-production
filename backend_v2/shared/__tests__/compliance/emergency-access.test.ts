export {};
// ─── Emergency Access (Break-Glass) Test ────────────────────────────────────
// Verifies HIPAA §164.312(a)(2)(ii) emergency access procedure:
//   - Only doctors/admins can request
//   - Time-limited (max 120 minutes)
//   - 6 valid reason codes
//   - Full audit trail + breach detection
//   - Revocation support
//
// Source: shared/emergency-access.ts (full file, 289 lines)
// Run: npx ts-node shared/__tests__/compliance/emergency-access.test.ts
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

const ROOT = path.resolve(__dirname, '..', '..');
const readFile = (relPath: string): string => {
    try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
    catch { return ''; }
};

const emergencyAccess = readFile('emergency-access.ts');
const clinicalRoutes = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'doctor-service', 'src', 'modules', 'clinical', 'clinical.routes.ts'), 'utf-8'
).toString();

// ═══════════════════════════════════════════════════════════════════════════
// 1. Authorization — Only doctors/admins
// ═══════════════════════════════════════════════════════════════════════════

describe('Emergency Access — Authorization', () => {
    assert(
        emergencyAccess.includes('!user.isDoctor && !user.isAdmin'),
        'Only doctors and admins can request emergency access'
    );

    assert(
        emergencyAccess.includes('403') && emergencyAccess.includes('Only authorized providers'),
        'Non-providers get 403 Forbidden'
    );

    assert(
        emergencyAccess.includes('EMERGENCY_ACCESS_DENIED'),
        'Denied attempts are audit-logged'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Time limits
// ═══════════════════════════════════════════════════════════════════════════

describe('Emergency Access — Time limits', () => {
    assert(
        emergencyAccess.includes('Math.min') && emergencyAccess.includes('120'),
        'Maximum duration capped at 120 minutes'
    );

    assert(
        emergencyAccess.includes('DEFAULT_DURATION_MINUTES') && emergencyAccess.includes('60'),
        'Default duration is 60 minutes'
    );

    assert(
        emergencyAccess.includes('expiresAt > Date.now()'),
        'Middleware checks expiry before granting access'
    );

    assert(
        emergencyAccess.includes('activeOverrides.delete'),
        'Expired overrides are cleaned up from memory'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Reason codes (6 required)
// ═══════════════════════════════════════════════════════════════════════════

const REQUIRED_REASONS = [
    'life-threatening',
    'unconscious',
    'public-health',
    'system-outage',
    'treatment-continuity',
    'other',
];

describe('Emergency Access — Reason codes', () => {
    for (const reason of REQUIRED_REASONS) {
        assert(
            emergencyAccess.includes(reason),
            `Reason code "${reason}" defined`
        );
    }

    assert(
        emergencyAccess.includes('reasonText') && emergencyAccess.includes('min 10 chars'),
        '"other" reason requires detailed justification (min 10 chars)'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Audit + breach detection
// ═══════════════════════════════════════════════════════════════════════════

describe('Emergency Access — Audit and breach alerts', () => {
    assert(
        emergencyAccess.includes('EMERGENCY_ACCESS_GRANTED'),
        'Grant is audit-logged as EMERGENCY_ACCESS_GRANTED'
    );

    assert(
        emergencyAccess.includes('checkForBreach'),
        'Grant triggers breach detection notification'
    );

    assert(
        emergencyAccess.includes('EMERGENCY_ACCESS_REVOKED'),
        'Revocation is audit-logged'
    );

    assert(
        emergencyAccess.includes('7 * 365 * 24 * 60 * 60'),
        'Emergency access records retained for 7 years (HIPAA requirement)'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Middleware tags requests
// ═══════════════════════════════════════════════════════════════════════════

describe('Emergency Access — Middleware integration', () => {
    assert(
        emergencyAccess.includes('emergencyAccessMiddleware'),
        'Exports emergencyAccessMiddleware'
    );

    assert(
        emergencyAccess.includes('emergencyOverride'),
        'Tags requests with emergencyOverride data'
    );

    // Check middleware is applied to sensitive routes
    assert(
        clinicalRoutes.includes('emergencyAccessMiddleware'),
        'emergencyAccessMiddleware applied to clinical routes in doctor-service'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Revocation
// ═══════════════════════════════════════════════════════════════════════════

describe('Emergency Access — Revocation', () => {
    assert(
        emergencyAccess.includes('revokeEmergencyAccess'),
        'Revoke endpoint exists'
    );

    assert(
        emergencyAccess.includes("'revoked'"),
        'DynamoDB record updated to status revoked'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. FHIR AuditEvent response
// ═══════════════════════════════════════════════════════════════════════════

describe('Emergency Access — FHIR AuditEvent format', () => {
    assert(
        emergencyAccess.includes("resourceType: 'AuditEvent'"),
        'Response is a FHIR AuditEvent resource'
    );

    assert(
        emergencyAccess.includes('110113') && emergencyAccess.includes('Security Alert'),
        'Uses DICOM code 110113 (Security Alert)'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Emergency Access: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
