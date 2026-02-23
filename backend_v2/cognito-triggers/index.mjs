// backend_v2/cognito-triggers/index.mjs
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({});

export const handler = async (event) => {
    console.log("Triggered Event:", JSON.stringify(event));

    const clientId = event.callerContext.clientId;
    
    // 🟢 Pull from Environment Variables (Set in AWS Console)
    const DOCTOR_CLIENT_ID = process.env.DOCTOR_CLIENT_ID;

    if (!DOCTOR_CLIENT_ID) {
        console.error("CRITICAL SYSTEM ERROR: DOCTOR_CLIENT_ID environment variable is missing.");
        return event; 
    }

    const targetGroup = (clientId === DOCTOR_CLIENT_ID) ? "doctor" : "patient";

    const command = new AdminAddUserToGroupCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        GroupName: targetGroup
    });

    try {
        await client.send(command);
        console.log(`Success: Assigned user ${event.userName} to [${targetGroup}] group.`);
    } catch (error) {
        console.error(`Error assigning user to ${targetGroup} group:`, error);
    }

    return event;
};