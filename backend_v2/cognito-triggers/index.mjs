// backend_v2/cognito-triggers/index.mjs
// Cognito Post-Confirmation Trigger — Auto-assigns user to doctor/patient group
// Deployed per-region: US (us-east-1) and EU (eu-central-1)

import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

// AWS_REGION is set automatically by Lambda runtime
const REGION = process.env.AWS_REGION || "us-east-1";
const IS_EU = REGION.includes("eu");

// Regional Cognito client (matches shared/aws-config.ts factory pattern)
const client = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async (event) => {
    console.log(`[cognito-triggers][${REGION}] Post-confirmation event received`);

    // Resolve regional client IDs (new per-region env var pattern, with legacy fallback)
    const DOCTOR_CLIENT_ID = IS_EU
        ? (process.env.COGNITO_CLIENT_ID_EU_DOCTOR || process.env.DOCTOR_CLIENT_ID)
        : (process.env.COGNITO_CLIENT_ID_US_DOCTOR || process.env.DOCTOR_CLIENT_ID);

    const ADMIN_CLIENT_ID = IS_EU
        ? process.env.COGNITO_CLIENT_ID_EU_ADMIN
        : process.env.COGNITO_CLIENT_ID_US_ADMIN;

    const STAFF_CLIENT_ID = IS_EU
        ? process.env.COGNITO_CLIENT_ID_EU_STAFF
        : process.env.COGNITO_CLIENT_ID_US_STAFF;

    if (!DOCTOR_CLIENT_ID) {
        console.error(`[cognito-triggers][${REGION}] CRITICAL: Doctor client ID env var is missing`);
        return event;
    }

    const clientId = event.callerContext.clientId;

    // Map client ID to Cognito group
    let targetGroup;
    if (clientId === DOCTOR_CLIENT_ID) {
        targetGroup = "doctor";
    } else if (ADMIN_CLIENT_ID && clientId === ADMIN_CLIENT_ID) {
        targetGroup = "admin";
    } else if (STAFF_CLIENT_ID && clientId === STAFF_CLIENT_ID) {
        targetGroup = "staff";
    } else {
        targetGroup = "patient";
    }

    try {
        await client.send(new AdminAddUserToGroupCommand({
            UserPoolId: event.userPoolId,
            Username: event.userName,
            GroupName: targetGroup,
        }));
        console.log(`[cognito-triggers][${REGION}] Assigned ${event.userName} -> [${targetGroup}]`);
    } catch (error) {
        console.error(`[cognito-triggers][${REGION}] Failed to assign ${event.userName} -> [${targetGroup}]:`, error.message);
    }

    return event;
};
