export {};
// Source coverage complements the executable privacy-operation and local HTTP tests.
// It cannot establish regulatory compliance or successful live erasure.
import * as fs from 'fs';
import * as path from 'path';
import assert from 'assert/strict';
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'patient-service/src/controllers/patient.controller.ts'), 'utf8');
const body = source.slice(source.indexOf('export const deleteProfile'), source.indexOf('const erasureReviewSchema'));
const operations = fs.readFileSync(path.join(root, 'shared/privacy-operations.ts'), 'utf8');
const analytics = fs.readFileSync(path.join(root, 'shared/privacy-analytics.ts'), 'utf8');
const packageSource = JSON.parse(fs.readFileSync(path.join(root, 'patient-service/package.json'), 'utf8'));
let passed = 0;
function check(condition: unknown, description: string) { assert.ok(condition, description); passed++; }

const stages = ['appointments', 'analytics', 'chat', 'graph', 'reverse-graph', 'prescriptions', 'mpi', 'allergies', 'immunizations', 'care-plans', 'labs', 'referrals', 'medications', 'vitals', 'ehr', 'sdoh', 'eligibility', 'prior-authorization', 'video-sessions', 'blue-button', 'exports', 'reminders', 'hl7', 'recordings', 'dicom-images', 'dicom-metadata', 'ecr', 'elr', 'transactions', 'analytics-dlq', 'biometrics', 'ehr-objects', 'completion-audit', 'identity', 'profile'];
for (const stage of stages) check(body.includes(`workflow.stage('${stage}'`), `Missing durable erasure stage: ${stage}`);
check(body.includes('completePrivacyClient(rawDb, config)'), 'All erasure database reads/writes use complete pagination/batch boundary');
check(operations.includes('LastEvaluatedKey') && operations.includes('UnprocessedItems'), 'Pagination and unfinished writes must be handled');
check(body.includes('eraseS3Versions') && operations.includes('DeleteMarkers') && operations.includes('deleted.Errors'), 'Object versions and partial-delete errors must be handled');
check(body.includes('erasureApproval') && body.includes('config.policyVersion') && body.includes('legalHold'), 'Execution requires matching approval and no legal hold');
check(body.includes('REVIEW_REQUIRED') && body.includes('RETRY_REQUIRED'), 'Request and failure states must remain explicit');
check(!body.includes('SET #s = :s, #ttl = :ttl'), 'Do not expire/erase the recovery anchor before the cascade');
check(body.includes('ConditionExpression') && body.includes('erasureOwner'), 'Concurrent workers require conditional ownership');
check(body.indexOf("workflow.stage('identity'") > body.indexOf("workflow.stage('ehr-objects'"), 'Identity removal follows data stages');
check(!body.includes('SendEmailCommand') && !body.includes('Account fully anonymized'), 'No premature success notification or blanket anonymization claim');
check(analytics.includes("job.status.state === 'DONE'") && analytics.includes('errorResult'), 'Analytics completion is confirmed, not merely submitted');
check(packageSource.scripts.test.includes('privacy_operations_test.mjs') && packageSource.scripts.test.includes('privacy_http_test.mjs'), 'Behavioral privacy gates must remain wired into CI');
console.log(`GDPR workflow source coverage: ${passed} checks passed; live compliance is not inferred.`);
