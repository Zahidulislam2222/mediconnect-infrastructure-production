import { calculateDiscountedPrice, calculateShares, isDoctorRateIncreaseAllowed, isGpSpecialty } from '../shared/subscription';

let pass = 0;
let fail = 0;
function check(condition: boolean, name: string) {
    if (condition) { pass++; console.log(`  OK: ${name}`); }
    else { fail++; console.error(`  FAIL: ${name}`); }
}

console.log('\n=== Discount Calculation ===');
const free = calculateDiscountedPrice(200, 'free');
check(free.discountedPrice === 200, 'Free: $200 → $200 (no discount)');
check(free.savings === 0, 'Free: $0 savings');

const plus = calculateDiscountedPrice(200, 'plus');
check(plus.discountedPrice === 160, `Plus: $200 → $${plus.discountedPrice} (expected $160)`);
check(plus.savings === 40, `Plus: saves $${plus.savings} (expected $40)`);
check(plus.discountPercent === 20, 'Plus: 20% discount');

const premium = calculateDiscountedPrice(200, 'premium');
check(premium.discountedPrice === 140, `Premium: $200 → $${premium.discountedPrice} (expected $140)`);
check(premium.savings === 60, `Premium: saves $${premium.savings} (expected $60)`);

const cheap = calculateDiscountedPrice(50, 'plus');
check(cheap.discountedPrice === 40, `Plus $50 → $${cheap.discountedPrice} (expected $40)`);

console.log('\n=== Revenue Shares ===');
const newDoc = calculateShares(160, 'new');
check(newDoc.doctorShare === 128, `New doctor $160: gets $${newDoc.doctorShare} (expected $128)`);
check(newDoc.platformShare === 32, `New platform: gets $${newDoc.platformShare} (expected $32)`);

const est = calculateShares(160, 'established');
check(est.doctorShare === 136, `Established $160: gets $${est.doctorShare} (expected $136)`);

const top = calculateShares(160, 'top');
check(top.doctorShare === 140.8, `Top $160: gets $${top.doctorShare} (expected $140.80)`);

console.log('\n=== Rate Cap ===');
check(isDoctorRateIncreaseAllowed(100, 105, []).allowed === true, '5% increase: ALLOWED');
check(isDoctorRateIncreaseAllowed(100, 120, []).allowed === false, '20% increase: BLOCKED');
check(isDoctorRateIncreaseAllowed(100, 80, []).allowed === true, 'Decrease: ALLOWED');
check(isDoctorRateIncreaseAllowed(100, 105, [{ rate: 95, effectiveDate: new Date().toISOString(), approvedBy: 'x' }]).allowed === false, 'Recent change: BLOCKED');

console.log('\n=== GP Specialty ===');
check(isGpSpecialty('general_practice') === true, 'general_practice is GP');
check(isGpSpecialty('family_medicine') === true, 'family_medicine is GP');
check(isGpSpecialty('cardiology') === false, 'cardiology is NOT GP');
check(isGpSpecialty('primary_care') === true, 'primary_care is GP');

console.log('\n=== Platform Profit (every scenario) ===');
for (const plan of ['plus', 'premium'] as const) {
    for (const tier of ['new', 'established', 'top'] as const) {
        for (const fee of [50, 100, 200, 300]) {
            const price = calculateDiscountedPrice(fee, plan);
            const shares = calculateShares(price.discountedPrice, tier);
            check(shares.platformShare > 0, `${plan}/${tier}/$${fee}: platform=$${shares.platformShare} > 0`);
        }
    }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`  Results: ${pass} passed, ${fail} failed`);
console.log(`${'='.repeat(50)}`);
if (fail > 0) process.exit(1);
