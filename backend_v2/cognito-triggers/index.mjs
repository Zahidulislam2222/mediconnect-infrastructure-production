import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { loadSettings } from "./settings.mjs";

// Cognito protocol constants: only public enrollment roles belong here.
const ENROLLMENT_GROUP = Object.freeze({ PATIENT: "patient", DOCTOR: "doctor" });
const CONFIRM_SIGNUP = "PostConfirmation_ConfirmSignUp";
const CONFIRM_PASSWORD_RESET = "PostConfirmation_ConfirmForgotPassword";

/** @param {import('./settings.mjs').CognitoSettings} settings
 * @param {{send: (command: AdminAddUserToGroupCommand) => Promise<unknown>}} client */
export function createConfirmationHandler(settings, client) {
    /** @param {unknown} event */
    return async (event) => {
        if (typeof event !== "object" || event === null) throw new Error("Invalid confirmation event");
        const envelope = /** @type {Record<string, unknown>} */ (event);
        const caller = envelope.callerContext;
        if (envelope.region !== settings.region || envelope.userPoolId !== settings.userPoolId
            || typeof envelope.userName !== "string" || !envelope.userName.trim()
            || typeof caller !== "object" || caller === null) {
            throw new Error("Invalid confirmation event");
        }
        const clientId = /** @type {Record<string, unknown>} */ (caller).clientId;
        if (typeof clientId !== "string" || !clientId.trim()) throw new Error("Invalid confirmation event");
        // Password recovery must preserve existing operator-assigned roles.
        if (envelope.triggerSource === CONFIRM_PASSWORD_RESET) return event;
        if (envelope.triggerSource !== CONFIRM_SIGNUP) throw new Error("Unsupported confirmation trigger");
        let targetGroup;
        if (clientId === settings.patientClientId) targetGroup = ENROLLMENT_GROUP.PATIENT;
        else if (clientId === settings.doctorClientId) targetGroup = ENROLLMENT_GROUP.DOCTOR;
        else throw new Error("Client is not permitted for public enrollment");
        try {
            await client.send(new AdminAddUserToGroupCommand({
                UserPoolId: settings.userPoolId, Username: envelope.userName, GroupName: targetGroup,
            }));
        } catch {
            // Provider errors and event payloads can contain personal identifiers.
            throw new Error("Cognito enrollment group assignment failed");
        }
        return event;
    };
}

/** @type {ReturnType<typeof createConfirmationHandler> | undefined} */
let runtimeHandler;

/** @param {unknown} event */
export const handler = async (event) => {
    if (!runtimeHandler) {
        const settings = loadSettings(process.env);
        runtimeHandler = createConfirmationHandler(settings, new CognitoIdentityProviderClient({
            region: settings.region, maxAttempts: settings.maxAttempts,
        }));
    }
    return runtimeHandler(event);
};
