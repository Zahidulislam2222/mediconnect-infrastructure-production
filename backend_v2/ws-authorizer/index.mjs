// backend_v2/ws-authorizer/index.mjs
// API Gateway WebSocket Authorizer — Verifies Cognito JWT from query string
// Deployed per-region: US (us-east-1) and EU (eu-central-1)

import { CognitoJwtVerifier } from "aws-jwt-verify";

// AWS_REGION is set automatically by Lambda runtime
const REGION = process.env.AWS_REGION || "us-east-1";
const IS_EU = REGION.includes("eu");

// Regional Cognito config (matches shared/aws-config.ts COGNITO_CONFIG pattern)
const USER_POOL_ID = IS_EU
    ? (process.env.COGNITO_USER_POOL_ID_EU || process.env.COGNITO_USER_POOL_ID)
    : (process.env.COGNITO_USER_POOL_ID_US || process.env.COGNITO_USER_POOL_ID);

const CLIENT_PATIENT = IS_EU
    ? (process.env.COGNITO_CLIENT_ID_EU_PATIENT || process.env.COGNITO_CLIENT_ID_PATIENT)
    : (process.env.COGNITO_CLIENT_ID_US_PATIENT || process.env.COGNITO_CLIENT_ID_PATIENT);

const CLIENT_DOCTOR = IS_EU
    ? (process.env.COGNITO_CLIENT_ID_EU_DOCTOR || process.env.COGNITO_CLIENT_ID_DOCTOR)
    : (process.env.COGNITO_CLIENT_ID_US_DOCTOR || process.env.COGNITO_CLIENT_ID_DOCTOR);

// Lazy-initialized verifier (avoids crash if env vars resolve late)
let verifier = null;

const getVerifier = () => {
    if (verifier) return verifier;

    if (!USER_POOL_ID) {
        throw new Error(`AUTH_CRASH: Missing Cognito User Pool ID for ${IS_EU ? "EU" : "US"}`);
    }

    verifier = CognitoJwtVerifier.create({
        userPoolId: USER_POOL_ID,
        tokenUse: "id",
        clientId: [CLIENT_PATIENT, CLIENT_DOCTOR].filter(Boolean),
    });

    return verifier;
};

const generatePolicy = (principalId, effect, resource, payload = {}) => ({
    principalId,
    policyDocument: {
        Version: "2012-10-17",
        Statement: [{
            Action: "execute-api:Invoke",
            Effect: effect,
            Resource: resource,
        }],
    },
    context: {
        sub: payload.sub || "",
        email: payload.email || "",
        region: REGION,
        role: payload["custom:role"] || (payload["cognito:groups"]?.[0]) || "patient",
    },
});

export const handler = async (event) => {
    try {
        const token = event.queryStringParameters?.token;
        if (!token) throw new Error("Missing token");

        const v = getVerifier();
        const payload = await v.verify(token);

        console.log(`[ws-authorizer][${REGION}] Authorized: ${payload.sub}`);
        return generatePolicy(payload.sub, "Allow", event.methodArn, payload);
    } catch (err) {
        console.error(`[ws-authorizer][${REGION}] Auth failed: ${err.message}`);
        return generatePolicy("unauthorized", "Deny", event.methodArn);
    }
};
