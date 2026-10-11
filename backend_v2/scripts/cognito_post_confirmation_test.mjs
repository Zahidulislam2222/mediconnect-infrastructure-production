import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createConfirmationHandler } from "../cognito-triggers/index.mjs";
import { loadSettings } from "../cognito-triggers/settings.mjs";

const environment = (region) => ({ AWS_REGION: region, COGNITO_USER_POOL_ID: `${region}_testpool`,
    COGNITO_CLIENT_ID_PATIENT: "test-patient", COGNITO_CLIENT_ID_DOCTOR: "test-doctor",
    COGNITO_POST_CONFIRMATION_MAX_ATTEMPTS: "1" });
const eventFor = (settings, clientId, triggerSource = "PostConfirmation_ConfirmSignUp") => ({
    region: settings.region, userPoolId: settings.userPoolId, userName: "test-private-subject",
    triggerSource, callerContext: { clientId }, request: { userAttributes: { email: "test@example.invalid" } },
});
const harness = (region) => {
    const settings = loadSettings(environment(region));
    const calls = [];
    return { settings, calls, run: createConfirmationHandler(settings, { send: async command => {
        calls.push(command.input);
        return {};
    } }) };
};

for (const region of ["us-east-1", "eu-central-1"]) {
    for (const role of ["admin", "staff", "unknown"]) {
        test(`${region}: public ${role} signup cannot grant any group`, async () => {
            const { settings, calls, run } = harness(region);
            await assert.rejects(run(eventFor(settings, `test-${role}`)), /not permitted/);
            assert.deepEqual(calls, []);
        });
    }
    for (const role of ["patient", "doctor"]) {
        test(`${region}: explicit ${role} enrollment uses the configured pool`, async () => {
            const { settings, calls, run } = harness(region);
            const event = eventFor(settings, `test-${role}`);
            assert.equal(await run(event), event);
            assert.deepEqual(calls, [{ UserPoolId: settings.userPoolId,
                Username: event.userName, GroupName: role }]);
        });
    }
    test(`${region}: retried confirmation preserves the same enrollment group`, async () => {
        const { settings, calls, run } = harness(region);
        const event = eventFor(settings, "test-patient");
        await run(event);
        await run(event);
        assert.equal(calls.length, 2);
        assert.deepEqual(calls[0], calls[1]);
    });
    test(`${region}: password recovery cannot overwrite a privileged membership`, async () => {
        const { settings, calls, run } = harness(region);
        const event = eventFor(settings, "test-admin", "PostConfirmation_ConfirmForgotPassword");
        assert.equal(await run(event), event);
        assert.deepEqual(calls, []);
    });
    test(`${region}: wrong pool/region/trigger and malformed events fail before assignment`, async () => {
        const { settings, calls, run } = harness(region);
        const valid = eventFor(settings, "test-patient");
        for (const invalid of [null, {}, { ...valid, region: "test-wrong-region" },
            { ...valid, userPoolId: `${region}_otherpool` }, { ...valid, userName: "" },
            { ...valid, callerContext: null }, { ...valid, callerContext: {} },
            { ...valid, triggerSource: "test-unsupported-trigger" }]) {
            await assert.rejects(run(invalid));
        }
        assert.deepEqual(calls, []);
    });
    test(`${region}: SDK failure propagates without exposing event or provider data`, async t => {
        const log = t.mock.method(console, "log", () => {});
        const error = t.mock.method(console, "error", () => {});
        const settings = loadSettings(environment(region));
        const run = createConfirmationHandler(settings, { send: async () => {
            throw new Error("test-private-subject test@example.invalid test-provider-detail");
        } });
        await assert.rejects(run(eventFor(settings, "test-patient")), value => {
            assert.equal(value.message, "Cognito enrollment group assignment failed");
            assert.equal(value.cause, undefined);
            return true;
        });
        assert.equal(log.mock.callCount(), 0);
        assert.equal(error.mock.callCount(), 0);
    });
}

test("Every required runtime setting fails closed without leaking its value", () => {
    const configured = environment("us-east-1");
    for (const name of Object.keys(configured)) {
        const missing = { ...configured };
        delete missing[name];
        assert.throws(() => loadSettings(missing), new RegExp(name));
        assert.throws(() => loadSettings({ ...configured, [name]: " " }), new RegExp(name));
    }
    for (const value of ["0", "-1", "1.5", "test-private-invalid"]) {
        assert.throws(() => loadSettings({ ...configured, COGNITO_POST_CONFIRMATION_MAX_ATTEMPTS: value }),
            /Invalid configuration: COGNITO_POST_CONFIRMATION_MAX_ATTEMPTS/);
    }
    assert.throws(() => loadSettings({ ...configured, COGNITO_USER_POOL_ID: "test-wrong-pool" }), /does not match/);
    assert.throws(() => loadSettings({ ...configured, COGNITO_CLIENT_ID_DOCTOR: "test-patient" }), /must differ/);
});

test("Generic Lambda deployment cannot replace the independently inventoried Cognito hooks", () => {
    const workflow = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
    assert.ok(workflow.includes("npm run typecheck:cognito"));
    const lambdaJob = workflow.slice(workflow.indexOf("\n  deploy-lambdas:"));
    assert.ok(lambdaJob.includes("vars.DEPLOY_LAMBDAS == 'true'"));
    const lists = [...lambdaJob.matchAll(/(?:LAMBDAS="|for fn in )([^";\n]+)/g)];
    assert.equal(lists.length, 4); // The manifest plus packaging and two regional loops.
    for (const [, list] of lists) assert.ok(!list.includes("cognito"));
    assert.ok(!lambdaJob.includes("--function-name mediconnect-cognito"));
});
