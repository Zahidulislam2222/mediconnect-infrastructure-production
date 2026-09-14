// Regional boundary regression tests. These do not prove deployment residency or legal compliance.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { resolveAuthRegion } from '../../region-context';
import { getPrivacyAnalyticsSettings } from '../../settings';
import { getRegionalClient, getRegionalS3Client, getRegionalSNSClient, getRegionalSSMClient, getRegionalKMSClient, getRegionalSESClient } from '../../aws-config';

async function main() {
    let passed = 0;
    for (const region of ['US', 'EU'] as const) {
        assert.equal(resolveAuthRegion(region), region);
        assert.equal(resolveAuthRegion(process.env[`PRIVACY_${region}_REGION`]), region);
        for (const factory of [getRegionalClient, getRegionalS3Client, getRegionalSNSClient, getRegionalSSMClient, getRegionalKMSClient, getRegionalSESClient]) {
            const client = factory(region);
            assert.equal(await client.config.region(), process.env[`PRIVACY_${region}_REGION`]);
            passed++;
        }
        const settings = getPrivacyAnalyticsSettings(region);
        assert.equal(settings.analyticsDataset, process.env[`PRIVACY_BQ_ANALYTICS_${region}`]);
        assert.equal(settings.location, process.env[`PRIVACY_BQ_LOCATION_${region}`]);
        const key = `PRIVACY_BQ_ANALYTICS_${region}`;
        const original = process.env[key]; process.env[key] = `test_${region.toLowerCase()}_analytics`;
        assert.equal(getPrivacyAnalyticsSettings(region).analyticsDataset, process.env[key]);
        process.env[key] = original;
        passed++;
    }
    for (const invalid of [undefined, [], ['EU', 'US'], 'not-eu', 'EU, US', 'ap-south-1', '']) {
        assert.throws(() => resolveAuthRegion(invalid), /INVALID_AUTH_REGION/); passed++;
    }
    assert.throws(() => getRegionalS3Client('not-eu'), /INVALID_AUTH_REGION/); passed++;
    for (const service of ['patient', 'doctor', 'booking', 'communication']) {
        const source = fs.readFileSync(path.resolve(__dirname, '../../../', `${service}-service/src/middleware/auth.middleware.ts`), 'utf8');
        assert.ok(source.includes('resolveAuthRegion'));
        assert.ok(source.includes("req.headers['x-user-region'] ="));
        assert.ok(!source.includes('req.body?.requestContext?.authorizer'));
        passed++;
    }
    console.log(`Regional boundary: ${passed} checks passed; no cloud network requests`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
