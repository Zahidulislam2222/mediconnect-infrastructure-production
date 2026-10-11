/**
 * Configuration boundary for the independently deployed confirmation Lambda.
 * @typedef {Readonly<{region: string, userPoolId: string, patientClientId: string,
 * doctorClientId: string, maxAttempts: number}>} CognitoSettings
 */

/** @param {Record<string, string | undefined>} environment
 * @returns {CognitoSettings} */
export function loadSettings(environment) {
    /** @param {string} name */
    const requireEnv = (name) => {
        const value = environment[name]?.trim();
        if (!value) throw new Error(`Missing required configuration: ${name}`);
        return value;
    };
    const region = requireEnv("AWS_REGION");
    const userPoolId = requireEnv("COGNITO_USER_POOL_ID");
    const patientClientId = requireEnv("COGNITO_CLIENT_ID_PATIENT");
    const doctorClientId = requireEnv("COGNITO_CLIENT_ID_DOCTOR");
    const maxAttempts = Number(requireEnv("COGNITO_POST_CONFIRMATION_MAX_ATTEMPTS"));
    if (!userPoolId.startsWith(`${region}_`) || userPoolId.length <= region.length + 1) {
        throw new Error("Cognito pool does not match configured region");
    }
    if (patientClientId === doctorClientId) throw new Error("Cognito enrollment clients must differ");
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
        throw new Error("Invalid configuration: COGNITO_POST_CONFIRMATION_MAX_ATTEMPTS");
    }
    return Object.freeze({ region, userPoolId, patientClientId, doctorClientId, maxAttempts });
}
