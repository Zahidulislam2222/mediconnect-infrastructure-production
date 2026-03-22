// ─── Deterministic Data Integrity Verification for MediConnect ───────────────
// Replaces non-deterministic agent-based /verify full with programmatic checks.
// Same input = same output, every time. No AI agents, no randomness.
//
// Checks:
//   1. DynamoDB table registry (discovers ALL tables from source code)
//   2. S3 bucket registry (discovers ALL buckets from source code)
//   3. BigQuery writer registry (discovers ALL BQ push paths)
//   4. GDPR Erasure coverage (tables with patientId vs tables in erasure cascade)
//   5. GDPR Export coverage (patient content stores vs stores in export function)
//   6. BigQuery patientId hashing consistency
//   7. PHI encryption/decryption symmetry
//   8. Audit log coverage (mutations without writeAuditLog)
//   9. Notification symmetry (create vs cancel counterparts)
//  10. External API write paths
//
// Run: node backend_v2/verify_data_integrity.js
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname);
const RESULTS = { passed: 0, failed: 0, warnings: 0, findings: [] };

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function findFiles(dir, extensions, exclude = ['node_modules', 'dist', '.git', '__pycache__']) {
    const results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (exclude.includes(entry.name)) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...findFiles(fullPath, extensions, exclude));
            } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                results.push(fullPath);
            }
        }
    } catch { /* permission or read error */ }
    return results;
}

function readFile(filePath) {
    try { return fs.readFileSync(filePath, 'utf-8'); } catch { return ''; }
}

function grepFile(filePath, pattern) {
    const content = readFile(filePath);
    const lines = content.split('\n');
    const matches = [];
    const regex = new RegExp(pattern, 'gi');
    lines.forEach((line, idx) => {
        if (regex.test(line)) {
            matches.push({ file: filePath, line: idx + 1, text: line.trim() });
            regex.lastIndex = 0;
        }
    });
    return matches;
}

function grepAll(files, pattern) {
    return files.flatMap(f => grepFile(f, pattern));
}

function relativePath(fullPath) {
    return path.relative(BACKEND_DIR, fullPath).replace(/\\/g, '/');
}

function pass(check, detail) {
    RESULTS.passed++;
    console.log(`  ✓ PASS  ${check}${detail ? ' — ' + detail : ''}`);
}

function fail(check, detail) {
    RESULTS.failed++;
    RESULTS.findings.push({ severity: 'BROKEN', check, detail });
    console.log(`  ✗ FAIL  ${check}${detail ? ' — ' + detail : ''}`);
}

function warn(check, detail) {
    RESULTS.warnings++;
    RESULTS.findings.push({ severity: 'WARNING', check, detail });
    console.log(`  ⚠ WARN  ${check}${detail ? ' — ' + detail : ''}`);
}

// ─── CHECK 1: DynamoDB Table Registry ────────────────────────────────────────

function discoverDynamoTables(files) {
    console.log('\n━━━ CHECK 1: DynamoDB Table Discovery ━━━');
    const tableMatches = grepAll(files, 'TableName.*mediconnect-|["\']mediconnect-[a-z-]+["\']');
    const tableNames = new Set();

    for (const m of tableMatches) {
        // Only match TableName context (not CDS Hook IDs, S3 buckets, etc.)
        if (!m.text.includes('TableName') && !m.text.includes('RequestItems')) continue;
        const matches = m.text.match(/mediconnect-[a-z0-9][-a-z0-9]*/g);
        if (matches) matches.forEach(t => {
            // Normalize: strip -eu/-us suffix (regional variant of same table)
            const base = t.replace(/-eu$/, '').replace(/-us$/, '');
            tableNames.add(base);
        });
    }

    // Also check env var patterns: TABLE_X || 'mediconnect-...' and DYNAMO_TABLE
    const envMatches = grepAll(files, "process\\.env\\.(TABLE_|DYNAMO_TABLE|CONSENT_TABLE)");
    for (const m of envMatches) {
        const fallback = m.text.match(/['"]mediconnect-[a-z0-9][-a-z0-9]*/g);
        if (fallback) fallback.forEach(t => {
            const base = t.replace(/['"]/g, '').replace(/-eu$/, '').replace(/-us$/, '');
            tableNames.add(base);
        });
    }

    // Filter out non-DynamoDB entries (CDS Hook service IDs, S3 bucket names, queue names)
    const nonTables = new Set([
        // CDS Hook service IDs (not DynamoDB tables)
        'mediconnect-patient-alerts', 'mediconnect-rx-safety',
        'mediconnect-order-guidance', 'mediconnect-order-review',
        // SQS queue names from event-bus.ts (not yet integrated)
        'mediconnect-appointment-events', 'mediconnect-appointment-events-dlq',
        'mediconnect-audit-events', 'mediconnect-audit-events-dlq',
        'mediconnect-clinical-events', 'mediconnect-clinical-events-dlq',
        'mediconnect-patient-events', 'mediconnect-patient-events-dlq',
        'mediconnect-security-events', 'mediconnect-security-events-dlq',
        'mediconnect-system-events', 'mediconnect-system-events-dlq',
        // Other non-table references
        'mediconnect-analytics', 'mediconnect-fhir-server', 'mediconnect-db',
        // S3 bucket names (tracked separately in Check 2)
        'mediconnect-consultation-recordings', 'mediconnect-data-lake-dlq',
        'mediconnect-doctor-data', 'mediconnect-ehr-records',
        'mediconnect-medical-images', 'mediconnect-patient-data',
        'mediconnect-prescriptions',
    ]);
    for (const nt of nonTables) tableNames.delete(nt);

    const sorted = [...tableNames].sort();
    console.log(`  Found ${sorted.length} DynamoDB tables:`);
    sorted.forEach(t => console.log(`    - ${t}`));

    return sorted;
}

// ─── CHECK 2: S3 Bucket Registry ────────────────────────────────────────────

function discoverS3Buckets(files) {
    console.log('\n━━━ CHECK 2: S3 Bucket Discovery ━━━');
    const bucketMatches = grepAll(files,
        "Bucket.*mediconnect|mediconnect.*bucket|S3_BUCKET|BUCKET_NAME|DLQ_BUCKET|RECORDING_BUCKET|EHR_BUCKET"
    );
    const bucketNames = new Set();

    for (const m of bucketMatches) {
        const matches = m.text.match(/mediconnect-[a-z0-9][-a-z0-9]*/g);
        if (matches) matches.forEach(b => {
            // Normalize: strip -eu, -us suffixes for grouping
            let base = b.replace(/-eu$/, '').replace(/-us$/, '');
            // Only include actual S3 bucket names (not DynamoDB tables)
            const knownBuckets = [
                'mediconnect-patient-data', 'mediconnect-doctor-data',
                'mediconnect-prescriptions', 'mediconnect-ehr-records',
                'mediconnect-medical-images', 'mediconnect-consultation-recordings',
                'mediconnect-data-lake-dlq'
            ];
            if (knownBuckets.includes(base) || m.text.includes('Bucket') || m.text.includes('BUCKET')) {
                bucketNames.add(base);
            }
        });
    }

    const sorted = [...bucketNames].sort();
    console.log(`  Found ${sorted.length} S3 bucket families:`);
    sorted.forEach(b => console.log(`    - ${b} (+ EU variant)`));

    return sorted;
}

// ─── CHECK 3: BigQuery Writer Registry ──────────────────────────────────────

function discoverBigQueryWriters(files) {
    console.log('\n━━━ CHECK 3: BigQuery Writer Discovery ━━━');

    const pushFunctions = [
        'pushRevenueToBigQuery',
        'pushAppointmentToBigQuery',
        'pushVitalToBigQuery',
        'pushToBigQuery',
        'logDoctorOnboarding',
        'pushDoctorOnboardingLog'
    ];

    const writers = [];
    for (const fn of pushFunctions) {
        const defs = grepAll(files, `(export|async)\\s.*(function|const)\\s+${fn}`);
        const calls = grepAll(files, `${fn}\\s*\\(`);

        if (defs.length > 0 || calls.length > 0) {
            writers.push({
                name: fn,
                definedIn: defs.map(d => `${relativePath(d.file)}:${d.line}`),
                calledFrom: calls.map(c => `${relativePath(c.file)}:${c.line}`)
            });
            console.log(`  ${fn}:`);
            console.log(`    Defined: ${defs.map(d => relativePath(d.file) + ':' + d.line).join(', ') || 'inline'}`);
            console.log(`    Called:  ${calls.length} sites`);
        }
    }

    // Also find inline BigQuery insertAll calls (not via push functions)
    const inlineBQ = grepAll(files, 'bigquery.*insertAll|tableDataInsertAllRequest');
    const nonFunctionBQ = inlineBQ.filter(m =>
        !pushFunctions.some(fn => m.text.includes(fn))
    );
    if (nonFunctionBQ.length > 0) {
        console.log(`  Inline BigQuery writes (not via push function):`);
        nonFunctionBQ.forEach(m => console.log(`    ${relativePath(m.file)}:${m.line}`));
        writers.push({ name: 'INLINE', calledFrom: nonFunctionBQ.map(m => `${relativePath(m.file)}:${m.line}`) });
    }

    return writers;
}

// ─── CHECK 4: GDPR Erasure Coverage ─────────────────────────────────────────

function checkGdprErasure(allTables, allBuckets, files) {
    console.log('\n━━━ CHECK 4: GDPR Erasure Coverage ━━━');

    // Find the erasure function
    const patientController = files.find(f => f.includes('patient-service') && f.endsWith('patient.controller.ts'));
    if (!patientController) {
        fail('GDPR Erasure', 'Cannot find patient.controller.ts');
        return;
    }

    const content = readFile(patientController);

    // Find deleteProfile/deletePatient function boundaries
    const deleteStart = content.indexOf('deleteProfile') !== -1
        ? content.indexOf('deleteProfile')
        : content.indexOf('deletePatient');

    if (deleteStart === -1) {
        fail('GDPR Erasure', 'Cannot find deleteProfile/deletePatient function');
        return;
    }

    // Extract the erasure function body (from deleteProfile to the next export)
    const erasureBody = content.substring(deleteStart);

    // Find all table names referenced in the erasure function
    const erasureTables = new Set();
    const tableRefs = erasureBody.match(/mediconnect-[a-z0-9][-a-z0-9]*/g) || [];
    tableRefs.forEach(t => {
        const base = t.replace(/-eu$/, '').replace(/-us$/, '');
        erasureTables.add(base);
    });

    // The main patients table is accessed via CONFIG.DYNAMO_TABLE (not hardcoded in erasure body)
    // Check if CONFIG or DYNAMO_TABLE appears in the erasure function
    if (/CONFIG\.DYNAMO_TABLE|DYNAMO_TABLE/.test(erasureBody)) {
        erasureTables.add('mediconnect-patients');
    }

    // Also check env var table references in erasure body
    const envTableRefs = erasureBody.match(/process\.env\.(TABLE_\w+|DYNAMO_TABLE\w*)/g) || [];
    envTableRefs.forEach(ref => {
        // Map env vars to table names
        const envMap = {
            'TABLE_MPI': 'mediconnect-mpi-links',
            'TABLE_ALLERGIES': 'mediconnect-allergies',
            'TABLE_IMMUNIZATIONS': 'mediconnect-immunizations',
            'TABLE_CARE_PLANS': 'mediconnect-care-plans',
            'TABLE_LAB_ORDERS': 'mediconnect-lab-orders',
            'TABLE_REFERRALS': 'mediconnect-referrals',
            'TABLE_RECONCILIATIONS': 'mediconnect-reconciliations',
            'TABLE_MED_RECON': 'mediconnect-med-reconciliations',
            'TABLE_APPOINTMENTS': 'mediconnect-appointments',
            'TABLE_TRANSACTIONS': 'mediconnect-transactions',
            'TABLE_SESSIONS': 'mediconnect-video-sessions',
            'TABLE_EXPORTS': 'mediconnect-bulk-exports',
            'TABLE_SDOH': 'mediconnect-sdoh-assessments',
            'TABLE_ELIGIBILITY': 'mediconnect-eligibility-checks',
            'TABLE_PRIOR_AUTH': 'mediconnect-prior-auth',
            'TABLE_REMINDERS': 'mediconnect-reminders',
            'TABLE_BB_CONNECTIONS': 'mediconnect-bluebutton-connections',
            'TABLE_ECR': 'mediconnect-ecr-reports',
            'TABLE_ELR': 'mediconnect-elr-reports',
            'TABLE_EHR': 'mediconnect-health-records',
            'DYNAMO_TABLE': 'mediconnect-patients',
            'DYNAMO_TABLE_VITALS': 'mediconnect-iot-vitals',
        };
        const varName = ref.replace('process.env.', '');
        if (envMap[varName]) erasureTables.add(envMap[varName]);
    });

    // Find all S3 buckets referenced in erasure
    const erasureBuckets = new Set();
    const bucketRefs = erasureBody.match(/mediconnect-[a-z0-9][-a-z0-9]*/g) || [];
    bucketRefs.forEach(b => {
        const base = b.replace(/-eu$/, '').replace(/-us$/, '');
        if (allBuckets.includes(base)) erasureBuckets.add(base);
    });

    // Determine which tables have patientId
    const tablesWithPatientId = new Set();
    for (const table of allTables) {
        // Check if any write to this table includes patientId
        const writePattern = `${table}.*patientId|patientId.*${table}`;
        const writes = grepAll(files, table);
        for (const w of writes) {
            const surroundingContent = readFile(w.file);
            const lines = surroundingContent.split('\n');
            const start = Math.max(0, w.line - 10);
            const end = Math.min(lines.length, w.line + 10);
            const context = lines.slice(start, end).join('\n');
            if (/patientId|userId|senderId|recipientId|patient_id/i.test(context)) {
                tablesWithPatientId.add(table);
                break;
            }
        }
    }

    // Intentionally excluded tables (with reasons)
    const intentionalExclusions = {
        'mediconnect-audit-logs': 'HIPAA 7-year retention requirement',
        'mediconnect-consent-ledger': 'Legal proof of consent (included in export)',
        'mediconnect-chat-connections': 'Auto-cleaned via 2hr TTL (ephemeral WebSocket state)',
        'mediconnect-booking-locks': 'Auto-cleaned via TTL (ephemeral lock state)',
        'mediconnect-knowledge-base': 'Public content, not patient-specific',
        'mediconnect-drug-interactions': 'Reference data, not patient-specific',
        'mediconnect-drug-cache': 'Cache with 24hr TTL, no patient data',
        'mediconnect-pharmacy-inventory': 'Inventory data, not patient-specific',
        'mediconnect-staff-shifts': 'Staff data, not patient-specific',
        'mediconnect-staff-tasks': 'Staff data, not patient-specific',
        'mediconnect-staff-announcements': 'Staff data, not patient-specific',
        'mediconnect-webhook-events': 'Stripe event IDs only, 30-day TTL, no patient PII',
        'mediconnect-emergency-access': 'HIPAA audit (7-year TTL), included in export',
        'mediconnect-doctor-data': 'Doctor identity data (handled in doctor account closure)',
        'mediconnect-doctors': 'Doctor data (handled in doctor account closure)',
    };

    // Compute diff
    console.log('\n  Tables with patient data vs erasure coverage:');
    let covered = 0, excluded = 0, gaps = 0;

    for (const table of allTables) {
        const hasPatient = tablesWithPatientId.has(table);
        const inErasure = erasureTables.has(table);
        const exclusionReason = intentionalExclusions[table];

        if (!hasPatient) {
            // No patient data — no erasure needed
            continue;
        }

        if (inErasure) {
            covered++;
            pass(`Erasure: ${table}`, 'covered');
        } else if (exclusionReason) {
            excluded++;
            pass(`Erasure: ${table}`, `excluded — ${exclusionReason}`);
        } else {
            gaps++;
            fail(`Erasure: ${table}`, 'HAS patientId but NOT in erasure cascade');
        }
    }

    console.log(`\n  S3 buckets with patient data vs erasure coverage:`);
    for (const bucket of allBuckets) {
        const inErasure = erasureBuckets.has(bucket);
        const exclusionReason = intentionalExclusions[bucket];

        if (exclusionReason) {
            pass(`Erasure S3: ${bucket}`, `excluded — ${exclusionReason}`);
        } else if (inErasure) {
            pass(`Erasure S3: ${bucket}`, 'covered');
        } else {
            // Check if this bucket actually has patient data
            const bucketWrites = grepAll(files, `PutObjectCommand.*${bucket}|${bucket}.*PutObjectCommand`);
            if (bucketWrites.length > 0) {
                fail(`Erasure S3: ${bucket}`, 'HAS patient data but NOT in erasure cascade');
            }
        }
    }

    console.log(`\n  Summary: ${covered} covered, ${excluded} intentionally excluded, ${gaps} gaps`);
}

// ─── CHECK 5: GDPR Export Coverage ──────────────────────────────────────────

function checkGdprExport(allTables, files) {
    console.log('\n━━━ CHECK 5: GDPR Export Coverage ━━━');

    const patientController = files.find(f => f.includes('patient-service') && f.endsWith('patient.controller.ts'));
    if (!patientController) {
        fail('GDPR Export', 'Cannot find patient.controller.ts');
        return;
    }

    const content = readFile(patientController);
    const exportStart = content.indexOf('exportPatientData');
    if (exportStart === -1) {
        fail('GDPR Export', 'Cannot find exportPatientData function');
        return;
    }

    const exportBody = content.substring(exportStart);

    // Find all table names in export function
    const exportTables = new Set();
    const refs = exportBody.match(/mediconnect-[a-z0-9][-a-z0-9]*/g) || [];
    refs.forEach(t => {
        const base = t.replace(/-eu$/, '').replace(/-us$/, '');
        exportTables.add(base);
    });

    // The main patients table is accessed via CONFIG.DYNAMO_TABLE
    if (/CONFIG\.DYNAMO_TABLE|DYNAMO_TABLE|getProfile|userCheck/.test(exportBody)) {
        exportTables.add('mediconnect-patients');
    }

    // Also resolve env var references
    const envRefs = exportBody.match(/process\.env\.(TABLE_\w+|DYNAMO_TABLE\w*)/g) || [];
    const envMap = {
        'TABLE_ALLERGIES': 'mediconnect-allergies',
        'TABLE_IMMUNIZATIONS': 'mediconnect-immunizations',
        'TABLE_CARE_PLANS': 'mediconnect-care-plans',
        'TABLE_LAB_ORDERS': 'mediconnect-lab-orders',
        'TABLE_REFERRALS': 'mediconnect-referrals',
        'TABLE_MED_RECON': 'mediconnect-med-reconciliations',
        'TABLE_RECONCILIATIONS': 'mediconnect-reconciliations',
        'TABLE_APPOINTMENTS': 'mediconnect-appointments',
        'TABLE_TRANSACTIONS': 'mediconnect-transactions',
        'TABLE_SESSIONS': 'mediconnect-video-sessions',
        'TABLE_EXPORTS': 'mediconnect-bulk-exports',
        'TABLE_SDOH': 'mediconnect-sdoh-assessments',
        'TABLE_ELIGIBILITY': 'mediconnect-eligibility-checks',
        'TABLE_PRIOR_AUTH': 'mediconnect-prior-auth',
        'TABLE_REMINDERS': 'mediconnect-reminders',
        'TABLE_BB_CONNECTIONS': 'mediconnect-bluebutton-connections',
        'TABLE_ECR': 'mediconnect-ecr-reports',
        'TABLE_ELR': 'mediconnect-elr-reports',
        'TABLE_EHR': 'mediconnect-health-records',
        'TABLE_EMERGENCY_ACCESS': 'mediconnect-emergency-access',
        'TABLE_MPI': 'mediconnect-mpi-links',
        'DYNAMO_TABLE': 'mediconnect-patients',
        'DYNAMO_TABLE_VITALS': 'mediconnect-iot-vitals',
    };
    envRefs.forEach(ref => {
        const varName = ref.replace('process.env.', '');
        if (envMap[varName]) exportTables.add(envMap[varName]);
    });

    // Patient content stores that SHOULD be in export
    const patientContentStores = [
        'mediconnect-patients', 'mediconnect-appointments', 'mediconnect-prescriptions',
        'mediconnect-allergies', 'mediconnect-immunizations', 'mediconnect-care-plans',
        'mediconnect-lab-orders', 'mediconnect-referrals', 'mediconnect-iot-vitals',
        'mediconnect-health-records', 'mediconnect-chat-history', 'mediconnect-sdoh-assessments',
        'mediconnect-ecr-reports', 'mediconnect-elr-reports', 'mediconnect-consent-ledger',
        'mediconnect-transactions', 'mediconnect-video-sessions', 'mediconnect-prior-auth',
        'mediconnect-eligibility-checks', 'mediconnect-hl7-messages', 'mediconnect-emergency-access',
        'mediconnect-bluebutton-connections', 'mediconnect-reminders', 'mediconnect-mpi-links',
    ];

    let covered = 0, gaps = 0;
    for (const store of patientContentStores) {
        // Check both direct name and env var resolved name
        const inExport = exportTables.has(store) ||
            (store === 'mediconnect-med-reconciliations' && exportTables.has('mediconnect-reconciliations')) ||
            (store === 'mediconnect-reconciliations' && exportTables.has('mediconnect-med-reconciliations'));

        if (inExport) {
            covered++;
            pass(`Export: ${store}`, 'included');
        } else {
            gaps++;
            fail(`Export: ${store}`, 'patient content NOT in GDPR export');
        }
    }

    console.log(`\n  Summary: ${covered}/${patientContentStores.length} patient content stores in export`);
}

// ─── CHECK 6: BigQuery PatientId Hashing ────────────────────────────────────

function checkBigQueryHashing(files) {
    console.log('\n━━━ CHECK 6: BigQuery PatientId Hashing Consistency ━━━');

    // Find all BigQuery write sites and check if patientId is hashed nearby
    const bqWrites = grepAll(files, 'tableDataInsertAllRequest|insertAll|bigquery.*rows');
    const pushFunctions = grepAll(files, 'push(Revenue|Appointment|Vital|To)BigQuery|logDoctorOnboarding');

    // For each BQ write location, check if createHash/sha256/HIPAA_SALT appears in the function
    for (const write of bqWrites) {
        const content = readFile(write.file);
        const lines = content.split('\n');
        // Use wide context window (50 lines each direction) to catch hash in same function
        const start = Math.max(0, write.line - 50);
        const end = Math.min(lines.length, write.line + 30);
        const context = lines.slice(start, end).join('\n');

        const hasPatientId = /patient_id|patientId/i.test(context);
        const isHashed = /createHash|sha256|HIPAA_SALT/i.test(context);
        const isAnonymized = /ANONYMIZED/i.test(context);

        if (!hasPatientId) continue; // No patient ID in this write — skip

        const location = `${relativePath(write.file)}:${write.line}`;

        if (isHashed) {
            pass(`BQ Hash: ${location}`, 'patientId is SHA-256 hashed');
        } else if (isAnonymized) {
            pass(`BQ Hash: ${location}`, 'patientId is ANONYMIZED_GDPR literal');
        } else {
            fail(`BQ Hash: ${location}`, 'patientId sent to BigQuery WITHOUT SHA-256 hashing');
        }
    }
}

// ─── CHECK 7: PHI Encryption Symmetry ───────────────────────────────────────

function checkPhiSymmetry(files) {
    console.log('\n━━━ CHECK 7: PHI Encryption/Decryption Symmetry ━━━');

    const encryptCalls = grepAll(files, 'encryptPHI\\s*\\(');
    const decryptCalls = grepAll(files, 'decryptPHI\\s*\\(');

    // Group by service
    const encryptByService = {};
    const decryptByService = {};

    for (const e of encryptCalls) {
        const service = relativePath(e.file).split('/')[0];
        if (!encryptByService[service]) encryptByService[service] = [];
        encryptByService[service].push(e);
    }

    for (const d of decryptCalls) {
        const service = relativePath(d.file).split('/')[0];
        if (!decryptByService[service]) decryptByService[service] = [];
        decryptByService[service].push(d);
    }

    const allServices = new Set([...Object.keys(encryptByService), ...Object.keys(decryptByService)]);

    for (const service of allServices) {
        const encrypts = (encryptByService[service] || []).length;
        const decrypts = (decryptByService[service] || []).length;

        if (encrypts > 0 && decrypts > 0) {
            pass(`PHI Symmetry: ${service}`, `${encrypts} encrypt, ${decrypts} decrypt calls`);
        } else if (encrypts > 0 && decrypts === 0) {
            fail(`PHI Symmetry: ${service}`, `${encrypts} encrypt calls but 0 decrypt — data may be returned encrypted`);
        } else if (encrypts === 0 && decrypts > 0) {
            warn(`PHI Symmetry: ${service}`, `0 encrypt but ${decrypts} decrypt — reads from another service's encrypted data`);
        }
    }

    // Check for phi:kms: prefix in API responses (leak check)
    // Exclude: kms-crypto.ts (definition), test files, and decrypt guard patterns (.startsWith('phi:kms:'))
    const prefixLeaks = grepAll(files, 'phi:kms:');
    const nonCryptoLeaks = prefixLeaks.filter(m =>
        !m.file.includes('kms-crypto') &&
        !m.file.includes('test') &&
        !m.file.includes('verify_data_integrity') &&
        !m.text.includes('startsWith') && // Decrypt guards that check prefix then call decryptPHI
        !m.text.includes('isEncrypted')
    );
    if (nonCryptoLeaks.length > 0) {
        warn('PHI Prefix Leak', `"phi:kms:" string found in ${nonCryptoLeaks.length} non-crypto/non-guard files — verify not exposed to client`);
        nonCryptoLeaks.forEach(m => console.log(`    ${relativePath(m.file)}:${m.line}: ${m.text.substring(0, 80)}`));
    } else {
        pass('PHI Prefix Leak', 'No "phi:kms:" references outside of crypto/guards/tests');
    }
}

// ─── CHECK 8: Audit Log Coverage ────────────────────────────────────────────

function checkAuditCoverage(files) {
    console.log('\n━━━ CHECK 8: Audit Log Coverage ━━━');

    // Find all controller files
    const controllers = files.filter(f =>
        f.includes('controller') && f.endsWith('.ts') &&
        !f.includes('node_modules') && !f.includes('__tests__')
    );

    // For each controller, find mutation functions and check for writeAuditLog
    for (const controllerPath of controllers) {
        const content = readFile(controllerPath);
        const relPath = relativePath(controllerPath);

        // Find exported async functions (controller handlers)
        const funcRegex = /export\s+const\s+(\w+)\s*=\s*async/g;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
            const funcName = match[1];
            const funcStart = match.index;

            // Find the function body (rough: from export to next export or EOF)
            const nextExport = content.indexOf('export const', funcStart + 1);
            const funcBody = content.substring(funcStart, nextExport !== -1 ? nextExport : undefined);

            // Check if function performs DynamoDB mutations
            const hasMutation = /PutCommand|UpdateCommand|DeleteCommand|TransactWriteCommand|BatchWriteCommand/.test(funcBody);

            if (!hasMutation) continue;

            // Skip known exceptions
            const isHealthCheck = /health|ready|healthCheck|readiness/i.test(funcName);
            const isAuditItself = funcName === 'writeAuditLog';
            if (isHealthCheck || isAuditItself) continue;

            // Check for writeAuditLog call
            const hasAudit = /writeAuditLog/.test(funcBody);

            if (hasAudit) {
                pass(`Audit: ${relPath} → ${funcName}`, 'has writeAuditLog');
            } else {
                // Determine if this is patient/clinical/financial data
                const isSensitive = /patient|doctor|appointment|prescription|billing|transaction|clinical|ehr|allergy|immuniz|care.?plan|lab|referral|consent/i.test(funcBody);
                if (isSensitive) {
                    fail(`Audit: ${relPath} → ${funcName}`, 'DynamoDB mutation on sensitive data WITHOUT writeAuditLog');
                } else {
                    warn(`Audit: ${relPath} → ${funcName}`, 'DynamoDB mutation without writeAuditLog (non-sensitive)');
                }
            }
        }
    }
}

// ─── CHECK 9: Notification Symmetry ─────────────────────────────────────────

function checkNotificationSymmetry(files) {
    console.log('\n━━━ CHECK 9: Notification Symmetry ━━━');

    const notifCalls = grepAll(files, "sendNotification\\s*\\(");

    // Extract notification types
    const types = new Set();
    for (const call of notifCalls) {
        const content = readFile(call.file);
        const lines = content.split('\n');
        // Look at surrounding 5 lines for type
        const start = Math.max(0, call.line - 1);
        const end = Math.min(lines.length, call.line + 5);
        const context = lines.slice(start, end).join('\n');

        const typeMatch = context.match(/type:\s*['"](\w+)['"]/);
        if (typeMatch) types.add(typeMatch[1]);
    }

    console.log(`  Found notification types: ${[...types].join(', ')}`);

    // Check counterparts
    const counterparts = [
        ['BOOKING_CONFIRMATION', 'BOOKING_CANCELLATION'],
        ['PAYMENT_SUCCESS', 'PAYMENT_FAILED'],
        ['PRESCRIPTION_ISSUED', 'PRESCRIPTION_CANCELLED'],
        ['SHIFT_ASSIGNED', 'GENERAL'], // shift cancellation uses GENERAL
        ['TASK_ASSIGNED', 'GENERAL'],   // task updates use GENERAL (if exists)
    ];

    for (const [create, cancel] of counterparts) {
        const hasCreate = types.has(create);
        const hasCancel = types.has(cancel);

        if (hasCreate && hasCancel) {
            pass(`Notification pair: ${create} / ${cancel}`, 'both exist');
        } else if (hasCreate && !hasCancel) {
            warn(`Notification pair: ${create}`, `no ${cancel} counterpart found`);
        }
    }
}

// ─── CHECK 10: External API Write Paths ─────────────────────────────────────

function checkExternalAPIs(files) {
    console.log('\n━━━ CHECK 10: External API Integrations ━━━');

    const apis = [
        { name: 'Stripe', pattern: 'stripe\\.(paymentIntents|refunds|webhooks)' },
        { name: 'Google Calendar', pattern: 'calendar\\.events\\.(insert|delete|update)' },
        { name: 'Amazon Chime', pattern: 'Create(Meeting|Attendee|MediaCapturePipeline)Command|Delete(Meeting|MediaCapturePipeline)Command' },
        { name: 'Cognito', pattern: 'Admin(AddUserToGroup|DeleteUser|GetUser)Command' },
        { name: 'SES Email', pattern: 'SendEmailCommand' },
        { name: 'SNS', pattern: 'PublishCommand' },
        { name: 'AWS Bedrock', pattern: 'InvokeModelCommand' },
        { name: 'Orthanc PACS', pattern: 'send_to_pacs|orthanc|ORTHANC_URL' },
        { name: 'RxNorm API', pattern: 'rxnav\\.nlm\\.nih\\.gov' },
        { name: 'SNOMED/Snowstorm', pattern: 'browser\\.ihtsdotools\\.org|snowstorm' },
        { name: 'openFDA', pattern: 'api\\.fda\\.gov' },
        { name: 'WHO ICD-11', pattern: 'id\\.who\\.int|icdaccessmanagement' },
        { name: 'NPPES NPI', pattern: 'npiregistry\\.cms\\.hhs\\.gov' },
    ];

    for (const api of apis) {
        const matches = grepAll(files, api.pattern);
        if (matches.length > 0) {
            const locations = [...new Set(matches.map(m => relativePath(m.file)))];
            pass(`External API: ${api.name}`, `${matches.length} call sites in ${locations.join(', ')}`);
        }
    }
}

// ─── CHECK 11: Cross-Service Import Integrity ───────────────────────────────

function checkImportPaths(files) {
    console.log('\n━━━ CHECK 11: Import Path Integrity ━━━');

    const tsFiles = files.filter(f => f.endsWith('.ts'));

    for (const file of tsFiles) {
        const content = readFile(file);
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
            // Check for shared/ imports
            const importMatch = line.match(/from\s+['"](\.\.\/.*)shared\//);
            if (importMatch) {
                const importPath = importMatch[1] + 'shared/';
                const relFile = relativePath(file);

                // Count the depth: how many ../ segments
                const upCount = (importPath.match(/\.\.\//g) || []).length;

                // Determine expected depth based on file location
                // Files in service/src/controllers/ should be ../../../shared/
                // Files in service/src/modules/x/ should be ../../../../shared/
                // Files in service/src/utils/ should be ../../../shared/
                const parts = relFile.split('/');
                const srcIndex = parts.indexOf('src');

                if (srcIndex !== -1) {
                    const depth = parts.length - srcIndex - 1; // levels below src/
                    const expectedUp = depth + 1; // +1 to get from service/ to backend_v2/

                    if (upCount !== expectedUp) {
                        fail(`Import: ${relFile}:${idx + 1}`,
                            `shared/ import has ${upCount} levels up, expected ${expectedUp}`);
                    }
                }
            }
        });
    }

    // If no failures were reported, pass
    const importFailures = RESULTS.findings.filter(f => f.check.startsWith('Import:'));
    if (importFailures.length === 0) {
        pass('Import Path Integrity', 'All shared/ imports have correct relative depth');
    }
}

// ─── CHECK 12: Revenue BigQuery Push Completeness ───────────────────────────

function checkRevenueBQCompleteness(files) {
    console.log('\n━━━ CHECK 12: Revenue Analytics Completeness ━━━');

    // Find all places where REFUND transactions are created
    const refundWrites = grepAll(files, "type.*REFUND|REFUND.*type");
    const refundWithBQ = [];
    const refundWithoutBQ = [];

    for (const rw of refundWrites) {
        if (!rw.text.includes('PutCommand') && !rw.text.includes("'REFUND'") && !rw.text.includes('"REFUND"')) continue;

        const content = readFile(rw.file);
        const lines = content.split('\n');
        const start = Math.max(0, rw.line - 5);
        const end = Math.min(lines.length, rw.line + 30);
        const context = lines.slice(start, end).join('\n');

        if (/pushRevenueToBigQuery/.test(context)) {
            refundWithBQ.push(rw);
        } else if (/PutCommand|billId/.test(context)) {
            refundWithoutBQ.push(rw);
        }
    }

    // Check webhook handlers specifically
    const webhookHandlers = ['handlePaymentSuccess', 'handlePaymentFailure', 'handleChargeRefunded', 'handleDisputeCreated'];
    for (const handler of webhookHandlers) {
        const calls = grepAll(files, `pushRevenueToBigQuery`);
        const handlerFiles = grepAll(files, handler);

        for (const hf of handlerFiles) {
            const content = readFile(hf.file);
            const handlerStart = content.indexOf(handler);
            if (handlerStart === -1) continue;

            const nextHandler = content.indexOf('export', handlerStart + handler.length);
            const handlerBody = content.substring(handlerStart, nextHandler !== -1 ? nextHandler : undefined);

            if (handlerBody.includes('pushRevenueToBigQuery')) {
                pass(`Revenue BQ: ${handler}`, 'pushes to BigQuery');
            } else if (handlerBody.includes('billId') || handlerBody.includes('transaction')) {
                // Has financial data but doesn't push to BQ
                fail(`Revenue BQ: ${handler}`, 'writes financial data but does NOT push to BigQuery');
            }
        }
    }

    // Check cancellation flows
    const bookingController = files.find(f => f.includes('booking-service') && f.includes('booking.controller'));
    if (bookingController) {
        const content = readFile(bookingController);

        // cancelBookingUser
        const cancelUserIdx = content.indexOf('cancelBookingUser');
        if (cancelUserIdx !== -1) {
            const cancelBody = content.substring(cancelUserIdx, content.indexOf('export const', cancelUserIdx + 1) || undefined);
            if (cancelBody.includes('REFUND') && !cancelBody.includes('pushRevenueToBigQuery')) {
                warn('Revenue BQ: cancelBookingUser', 'creates REFUND transaction but does NOT push to BigQuery');
            } else if (cancelBody.includes('pushRevenueToBigQuery')) {
                pass('Revenue BQ: cancelBookingUser', 'REFUND pushes to BigQuery');
            }
        }

        // cancelAppointment helper — find the actual function definition
        let cancelHelperIdx = content.indexOf('function cancelAppointment');
        if (cancelHelperIdx === -1) cancelHelperIdx = content.indexOf('const cancelAppointment');
        if (cancelHelperIdx !== -1) {
            const helperBody = content.substring(cancelHelperIdx, content.indexOf('\nexport ', cancelHelperIdx + 1) !== -1 ? content.indexOf('\nexport ', cancelHelperIdx + 1) : undefined);
            if (helperBody.includes('REFUND') && !helperBody.includes('pushRevenueToBigQuery')) {
                warn('Revenue BQ: cancelAppointment helper', 'creates REFUND transaction but does NOT push to BigQuery');
            } else if (helperBody.includes('pushRevenueToBigQuery')) {
                pass('Revenue BQ: cancelAppointment helper', 'REFUND pushes to BigQuery');
            }
        }
    }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     MediConnect Data Integrity Verification                 ║');
    console.log('║     Deterministic • Reproducible • Complete                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`\nScanning: ${BACKEND_DIR}`);
    console.log(`Time: ${new Date().toISOString()}\n`);

    // Discover all source files
    const allFiles = findFiles(BACKEND_DIR, ['.ts', '.py', '.mjs']);
    console.log(`Discovered ${allFiles.length} source files\n`);

    // Phase 3: Build registry
    const tables = discoverDynamoTables(allFiles);
    const buckets = discoverS3Buckets(allFiles);
    const bqWriters = discoverBigQueryWriters(allFiles);

    // Phase 4: Verify
    checkGdprErasure(tables, buckets, allFiles);
    checkGdprExport(tables, allFiles);
    checkBigQueryHashing(allFiles);
    checkPhiSymmetry(allFiles);
    checkAuditCoverage(allFiles);
    checkNotificationSymmetry(allFiles);
    checkExternalAPIs(allFiles);
    checkImportPaths(allFiles);
    checkRevenueBQCompleteness(allFiles);

    // Final report
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     VERIFICATION SUMMARY                                    ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  ✓ Passed:   ${String(RESULTS.passed).padStart(3)}                                          ║`);
    console.log(`║  ⚠ Warnings: ${String(RESULTS.warnings).padStart(3)}                                          ║`);
    console.log(`║  ✗ Failed:   ${String(RESULTS.failed).padStart(3)}                                          ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    if (RESULTS.findings.length > 0) {
        console.log('\nFindings requiring attention:');
        RESULTS.findings
            .sort((a, b) => (a.severity === 'BROKEN' ? 0 : 1) - (b.severity === 'BROKEN' ? 0 : 1))
            .forEach((f, i) => {
                const icon = f.severity === 'BROKEN' ? '✗' : '⚠';
                console.log(`  ${i + 1}. [${f.severity}] ${f.check} — ${f.detail}`);
            });
    } else {
        console.log('\nNo issues found. All checks passed.');
    }

    console.log(`\nCompleted in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    // Exit code: 1 if any failures
    process.exit(RESULTS.failed > 0 ? 1 : 0);
}

const startTime = Date.now();
main();
