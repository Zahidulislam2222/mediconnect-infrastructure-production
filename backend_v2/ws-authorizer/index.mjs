// Only short-lived, single-use tickets are accepted. Never accept Cognito JWTs in URLs.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { socketAuthorizerSettings } from './settings.mjs';
import { consumeConnectionTicket } from './ticket.mjs';
let client;

const policy = (principalId, effect, resource, context = {}) => ({
    principalId, policyDocument: { Version: '2012-10-17', Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }] }, context,
});
export async function handler(event) {
    try {
        if (event.requestContext?.routeKey !== '$connect' || event.queryStringParameters?.token) throw new Error('INVALID_CONNECTION_REQUEST');
        const config = socketAuthorizerSettings();
        client ??= DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }));
        const identity = await consumeConnectionTicket(event.queryStringParameters?.ticket, client, config);
        return policy(identity.sub, 'Allow', event.methodArn, identity);
    } catch {
        // Do not log tickets, JWTs, subject identifiers or provider exception payloads.
        return policy('unauthorized', 'Deny', event.methodArn);
    }
}
