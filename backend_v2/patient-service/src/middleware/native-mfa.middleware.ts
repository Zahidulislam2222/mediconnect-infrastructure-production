import { Request, Response } from 'express';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider';
import { getRegionalClient, getRegionalCognitoClient } from '../../../shared/aws-config';
import { getNativeMfaSettings, getSensitiveOperationSettings, setting } from '../../../shared/settings';
import { completeNativeMfa, MfaDependencies, MfaPrincipal, MfaProof, NATIVE_MFA_CHALLENGE } from '../../../shared/native-mfa-proof';

export function nativeMfaDependencies(verify: MfaDependencies['verify']): MfaDependencies {
    return {
        now: () => Math.floor(Date.now() / 1000),
        maxAgeSeconds: getSensitiveOperationSettings().maxAuthAgeSeconds,
        verify,
        respond: async (user, session, code) => {
            if (typeof user.username !== 'string' || !user.username) throw new Error('NATIVE_USERNAME_UNAVAILABLE');
            const response = await getRegionalCognitoClient(user.region).send(new RespondToAuthChallengeCommand({
                ClientId: user.clientId, ChallengeName: NATIVE_MFA_CHALLENGE,
                Session: session, ChallengeResponses: { USERNAME: user.username, SOFTWARE_TOKEN_MFA_CODE: code },
            }));
            return response.AuthenticationResult?.IdToken;
        },
        write: async proof => {
            await getRegionalClient(proof.region).send(new PutCommand({
                TableName: setting('TABLE_SESSIONS'), Item: proof,
                ConditionExpression: 'attribute_not_exists(appointmentId) OR (patientId = :subject AND #kind = :kind)',
                ExpressionAttributeNames: { '#kind': 'kind' },
                ExpressionAttributeValues: { ':subject': proof.patientId, ':kind': proof.kind },
            }));
        },
        read: async (key, region) => {
            const result = await getRegionalClient(region).send(new GetCommand({
                TableName: setting('TABLE_SESSIONS'), Key: { appointmentId: key }, ConsistentRead: true,
            }));
            return result.Item as MfaProof | undefined;
        },
    };
}

export function completeNativeMfaHandler(verify: MfaDependencies['verify']) {
    return async (req: Request, res: Response) => {
        try {
            if (!getNativeMfaSettings().enabled) return res.status(503).json({ error: 'NATIVE_MFA_UNAVAILABLE' });
            const expiresAt = await completeNativeMfa((req as Request & { user: MfaPrincipal }).user, req.body, nativeMfaDependencies(verify));
            return res.json({ verified: true, expiresAt });
        } catch {
            // Provider/session/password/TOTP material never enters application logs or responses.
            return res.status(403).json({ error: 'NATIVE_MFA_NOT_VERIFIED' });
        }
    };
}
