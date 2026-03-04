// C:\Dev\mediconnect-project\mediconnect-infrastructure-develop\backend_v2\shared\aws-config.ts

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { RekognitionClient } from "@aws-sdk/client-rekognition";
import { SNSClient } from "@aws-sdk/client-sns";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { KMSClient } from "@aws-sdk/client-kms";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { NodeHttpHandler } from "@smithy/node-http-handler";

// 🟢 HIPAA 2026 High Availability (HA) Configuration
// PROPER AWS SDK v3 Implementation: Prevents Multi-Cloud Cold Starts and Socket Hangs
const requestHandler = new NodeHttpHandler({
    connectionTimeout: 5000,
    socketTimeout: 5000,
});

// AWS SDK v3 standard config for resiliency
const awsConfigBase = {
    requestHandler,
    maxAttempts: 3, // Automatic retries on network blips
};

// 🟢 GDPR STRICT ROUTING
// Maps frontend headers strictly to the two physical legal jurisdictions.
const normalizeRegion = (region: string = "us-east-1"): string => {
    const r = region?.toUpperCase();
    return (r === 'EU' || r === 'EU-CENTRAL-1') ? 'eu-central-1' : 'us-east-1';
};

// Memory Cache for Regional Instances
const clients: any = {
    ddb: {} as Record<string, DynamoDBDocumentClient>,
    s3: {} as Record<string, S3Client>,
    rek: {} as Record<string, RekognitionClient>,
    sns: {} as Record<string, SNSClient>,
    ssm: {} as Record<string, SSMClient>,
    kms: {} as Record<string, KMSClient>,
    secrets: {} as Record<string, SecretsManagerClient>
};

// =========================================================================
// 🏭 REGIONAL FACTORIES (NO STATIC CLIENTS ALLOWED)
// =========================================================================

export const getRegionalClient = (region: string = "us-east-1"): DynamoDBDocumentClient => {
    const target = normalizeRegion(region);
    if (clients.ddb[target]) return clients.ddb[target];

    const client = new DynamoDBClient({ ...awsConfigBase, region: target });
    clients.ddb[target] = DynamoDBDocumentClient.from(client, {
        marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true }
    });
    return clients.ddb[target];
};

export const getRegionalS3Client = (region: string = "us-east-1"): S3Client => {
    const target = normalizeRegion(region);
    if (clients.s3[target]) return clients.s3[target];
    clients.s3[target] = new S3Client({ ...awsConfigBase, region: target });
    return clients.s3[target];
};

export const getRegionalRekognitionClient = (region: string = "us-east-1"): RekognitionClient => {
    const target = normalizeRegion(region);
    if (clients.rek[target]) return clients.rek[target];
    clients.rek[target] = new RekognitionClient({ ...awsConfigBase, region: target });
    return clients.rek[target];
};

export const getRegionalSNSClient = (region: string = "us-east-1"): SNSClient => {
    const target = normalizeRegion(region);
    if (clients.sns[target]) return clients.sns[target];
    clients.sns[target] = new SNSClient({ ...awsConfigBase, region: target });
    return clients.sns[target];
};

export const getRegionalSSMClient = (region: string = "us-east-1"): SSMClient => {
    const target = normalizeRegion(region);
    if (clients.ssm[target]) return clients.ssm[target];
    clients.ssm[target] = new SSMClient({ ...awsConfigBase, region: target });
    return clients.ssm[target];
};

export const getRegionalKMSClient = (region: string = "us-east-1"): KMSClient => {
    const target = normalizeRegion(region);
    if (clients.kms[target]) return clients.kms[target];
    clients.kms[target] = new KMSClient({ ...awsConfigBase, region: target });
    return clients.kms[target];
};

// 🟢 Specific for Booking Service Webhooks
export const getRegionalSecretsClient = (region: string = "us-east-1"): SecretsManagerClient => {
    const target = normalizeRegion(region);
    if (clients.secrets[target]) return clients.secrets[target];
    clients.secrets[target] = new SecretsManagerClient({ ...awsConfigBase, region: target });
    return clients.secrets[target];
};

// =========================================================================
// 🔐 IDENTITY & SECRETS MANAGEMENT
// =========================================================================

export const COGNITO_CONFIG: Record<string, any> = {
    US: {
        REGION: 'us-east-1',
        get USER_POOL_ID() { return process.env.COGNITO_USER_POOL_ID_US || process.env.COGNITO_USER_POOL_ID || '' },
        get CLIENT_PATIENT() { return process.env.COGNITO_CLIENT_ID_US_PATIENT || process.env.COGNITO_CLIENT_ID || '' }, 
        get CLIENT_DOCTOR() { return process.env.COGNITO_CLIENT_ID_US_DOCTOR || process.env.COGNITO_CLIENT_ID || '' },
    },
    EU: {
        REGION: 'eu-central-1',
        get USER_POOL_ID() { return process.env.COGNITO_USER_POOL_ID_EU || '' },
        get CLIENT_PATIENT() { return process.env.COGNITO_CLIENT_ID_EU_PATIENT || '' },
        get CLIENT_DOCTOR() { return process.env.COGNITO_CLIENT_ID_EU_DOCTOR || '' },
    }
};

const secretCache: Record<string, string> = {};

// 🟢 Secure Regional Parameter Store Fetcher (Used by all services)
export const getSSMParameter = async (path: string, region: string = "us-east-1", isSecure: boolean = true): Promise<string | undefined> => {
    const target = normalizeRegion(region);
    const cacheKey = `${target}:${path}`;
    if (secretCache[cacheKey]) return secretCache[cacheKey];

    try {
        const regionalSsm = getRegionalSSMClient(target);
        const command = new GetParameterCommand({ Name: path, WithDecryption: isSecure });
        const response = await regionalSsm.send(command);
        const value = response.Parameter?.Value;

        if (value) {
            secretCache[cacheKey] = value; 
        }
        return value;
    } catch (error: any) {
        console.error(`❌ [VAULT_ERROR][${target.toUpperCase()}] SSM Fetch Failed: ${path}`);
        return undefined;
    }
};

// 🟢 Secure Regional Secrets Manager Fetcher (Used by Booking Service Stripe Webhooks)
export async function getSecret(secretName: string, region: string = "us-east-1"): Promise<string | null> {
    const target = normalizeRegion(region);
    try {
        const regionalSecrets = getRegionalSecretsClient(target);
        const data = await regionalSecrets.send(new GetSecretValueCommand({ SecretId: secretName }));
        if (data.SecretString) {
            try {
                const parsed = JSON.parse(data.SecretString);
                return parsed.secretKey || parsed;
            } catch {
                return data.SecretString;
            }
        }
        return null;
    } catch (err) {
        console.error(`❌[VAULT_ERROR][${target.toUpperCase()}] Secret Fetch Failed: ${secretName}`);
        return null;
    }
}