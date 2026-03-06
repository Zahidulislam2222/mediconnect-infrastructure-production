import { CognitoJwtVerifier } from "aws-jwt-verify";

// 1. Initialize verifier
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId:[
      process.env.COGNITO_CLIENT_ID_PATIENT, 
      process.env.COGNITO_CLIENT_ID_DOCTOR
  ].filter(Boolean),
});

// 2. Helper function for Policy Generation
const generatePolicy = (principalId, effect, resource, payload = {}) => {
    return {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement:[{
                Action: 'execute-api:Invoke',
                Effect: effect,
                Resource: resource
            }]
        },
        context: {
            sub: payload.sub || "",
            email: payload.email || "",
            role: payload["custom:role"] || (payload["cognito:groups"] ? payload["cognito:groups"][0] : "patient")
        }
    };
};

// 3. Export the handler using ES Module syntax
export const handler = async (event) => {
    try {
        const token = event.queryStringParameters?.token;
        if (!token) throw new Error("Missing token");

        const payload = await verifier.verify(token);
        return generatePolicy(payload.sub, 'Allow', event.methodArn, payload);
    } catch (err) {
        console.error("WS Auth Failed:", err.message);
        return generatePolicy('unauthorized', 'Deny', event.methodArn);
    }
};