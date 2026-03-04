import { CognitoJwtVerifier } from "aws-jwt-verify";

// 1. Initialize outside the handler to prevent cold-start delays
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: process.env.COGNITO_CLIENT_ID,
});

export const handler = async (event) => {
    try {
        // 2. Extract token from the WebSocket connection URL (e.g., wss://api...?token=eyJ...)
        const token = event.queryStringParameters?.token;
        if (!token) throw new Error("Missing token in query string");

        // 3. Verify the token with AWS Cognito
        const payload = await verifier.verify(token);
        
        // 4. Return the 'Allow' IAM Policy and pass user data to the API Gateway context
        return generatePolicy(payload.sub, 'Allow', event.methodArn, payload);
    } catch (err) {
        console.error("WS Auth Failed:", err.message);
        // 5. Return the 'Deny' IAM Policy if token is invalid/expired
        return generatePolicy('unauthorized', 'Deny', event.methodArn);
    }
};

// Helper function to format the IAM Policy exactly how AWS demands it
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
            // This context gets sent to your mapping template in API Gateway
            sub: payload.sub || "",
            email: payload.email || "",
            role: payload["custom:role"] || (payload["cognito:groups"] ? payload["cognito:groups"][0] : "patient")
        }
    };
};