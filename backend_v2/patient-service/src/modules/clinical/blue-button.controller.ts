// ─── FEATURE #28: Blue Button 2.0 ─────────────────────────────────────────
// CMS Blue Button 2.0 API integration for Medicare/Medicaid data access.
// OAuth2 flow with CMS sandbox. Fetches EOB, Coverage, and Patient data.
// Converts CMS FHIR resources to local FHIR R4 format.
// Sandbox: https://sandbox.bluebutton.cms.gov
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';
import { encryptToken, decryptToken } from '../../../../shared/kms-crypto';

const TABLE_BB_CONNECTIONS = process.env.TABLE_BB_CONNECTIONS || 'mediconnect-bluebutton-connections';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── CMS Blue Button Configuration ─────────────────────────────────────────

const BB_CONFIG = {
    sandbox: {
        authUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/authorize/',
        tokenUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/token/',
        apiBase: 'https://sandbox.bluebutton.cms.gov/v2/fhir',
    },
    production: {
        authUrl: 'https://api.bluebutton.cms.gov/v2/o/authorize/',
        tokenUrl: 'https://api.bluebutton.cms.gov/v2/o/token/',
        apiBase: 'https://api.bluebutton.cms.gov/v2/fhir',
    },
};

function getConfig() {
    const env = process.env.BB_ENVIRONMENT || 'sandbox';
    return env === 'production' ? BB_CONFIG.production : BB_CONFIG.sandbox;
}

function getClientId() { return process.env.BB_CLIENT_ID || ''; }
function getClientSecret() { return process.env.BB_CLIENT_SECRET || ''; }
function getCallbackUrl() { return process.env.BB_CALLBACK_URL || 'http://localhost:8081/bluebutton/callback'; }

// ─── GET /bluebutton/authorize — Start OAuth2 flow ──────────────────────────

export const startBlueButtonAuth = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const config = getConfig();
        const clientId = getClientId();

        if (!clientId) {
            return res.status(503).json({
                error: 'Blue Button 2.0 not configured',
                message: 'Set BB_CLIENT_ID, BB_CLIENT_SECRET, BB_CALLBACK_URL environment variables. Register at https://sandbox.bluebutton.cms.gov',
                registrationUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/applications/',
            });
        }

        const state = Buffer.from(JSON.stringify({
            userId: user.id,
            nonce: uuidv4(),
            timestamp: Date.now(),
        })).toString('base64');

        const authUrl = `${config.authUrl}?` + new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: getCallbackUrl(),
            scope: 'patient/Patient.read patient/Coverage.read patient/ExplanationOfBenefit.read profile',
            state,
        }).toString();

        res.json({
            authorizationUrl: authUrl,
            message: 'Redirect the user to this URL to authorize CMS Blue Button access',
            expiresIn: '10 minutes',
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to initiate Blue Button authorization', details: error.message });
    }
};

// ─── GET /bluebutton/callback — OAuth2 callback handler ─────────────────────

export const handleBlueButtonCallback = async (req: Request, res: Response) => {
    try {
        const { code, state, error: oauthError } = req.query;

        if (oauthError) {
            return res.status(400).json({ error: 'Authorization denied', details: oauthError });
        }

        if (!code || !state) {
            return res.status(400).json({ error: 'Missing code or state parameter' });
        }

        // Decode state
        let stateData: any;
        try {
            stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
        } catch {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        // Verify state is not expired (10 minutes)
        if (Date.now() - stateData.timestamp > 600000) {
            return res.status(400).json({ error: 'Authorization state expired' });
        }

        const config = getConfig();
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        // Exchange code for tokens
        const tokenResponse = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code as string,
                redirect_uri: getCallbackUrl(),
                client_id: getClientId(),
                client_secret: getClientSecret(),
            }).toString(),
        });

        if (!tokenResponse.ok) {
            const errBody = await tokenResponse.text();
            return res.status(400).json({ error: 'Token exchange failed', details: errBody });
        }

        const tokens = await tokenResponse.json();
        const now = new Date().toISOString();

        // Encrypt tokens with KMS before DynamoDB storage
        const encryptedAccess = await encryptToken(tokens.access_token, region);
        const encryptedRefresh = tokens.refresh_token ? await encryptToken(tokens.refresh_token, region) : null;

        await db.send(new PutCommand({
            TableName: TABLE_BB_CONNECTIONS,
            Item: {
                patientId: stateData.userId,
                connectionId: uuidv4(),
                status: 'connected',
                accessToken: encryptedAccess,
                refreshToken: encryptedRefresh,
                expiresAt: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
                cmsPatientId: tokens.patient,
                scope: tokens.scope,
                connectedAt: now,
                updatedAt: now,
            },
        }));

        await writeAuditLog(stateData.userId, stateData.userId, 'BLUEBUTTON_CONNECTED', 'Blue Button 2.0 account connected', { region });

        res.json({
            status: 'connected',
            message: 'Blue Button 2.0 account successfully connected',
            cmsPatientId: tokens.patient,
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Blue Button callback failed', details: error.message });
    }
};

// ─── Helper: Get active connection for patient ──────────────────────────────

async function getConnection(db: any, patientId: string, region: string): Promise<any | null> {
    const { Items } = await db.send(new QueryCommand({
        TableName: TABLE_BB_CONNECTIONS,
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': patientId },
    }));

    const active = (Items || []).find((c: any) => c.status === 'connected');
    if (!active) return null;

    // Decrypt tokens from KMS before use
    active.accessToken = await decryptToken(active.accessToken, region);
    if (active.refreshToken) {
        active.refreshToken = await decryptToken(active.refreshToken, region);
    }
    return active;
}

async function fetchFromCMS(accessToken: string, endpoint: string): Promise<any> {
    const config = getConfig();
    const response = await fetch(`${config.apiBase}${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/fhir+json',
        },
    });

    if (!response.ok) {
        throw new Error(`CMS API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

// ─── GET /bluebutton/patient/:patientId — Get CMS patient data ──────────────

export const getBlueButtonPatient = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const connection = await getConnection(db, patientId, region);
        if (!connection) {
            return res.status(404).json({
                error: 'No Blue Button connection found',
                message: 'Patient must authorize Blue Button access first via /bluebutton/authorize',
            });
        }

        const patient = await fetchFromCMS(connection.accessToken, `/Patient/${connection.cmsPatientId}`);

        const user = (req as any).user;
        await writeAuditLog(user.id, patientId, 'BLUEBUTTON_PATIENT_READ', 'Retrieved CMS patient data', { region });

        res.json(patient);

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch CMS patient data', details: error.message });
    }
};

// ─── GET /bluebutton/eob/:patientId — Get Explanation of Benefits ───────────

export const getBlueButtonEOB = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const connection = await getConnection(db, patientId, region);
        if (!connection) {
            return res.status(404).json({ error: 'No Blue Button connection. Authorize first.' });
        }

        const eob = await fetchFromCMS(connection.accessToken, `/ExplanationOfBenefit?patient=${connection.cmsPatientId}`);

        const user = (req as any).user;
        await writeAuditLog(user.id, patientId, 'BLUEBUTTON_EOB_READ', 'Retrieved CMS EOB data', { region });

        res.json(eob);

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch EOB data', details: error.message });
    }
};

// ─── GET /bluebutton/coverage/:patientId — Get Coverage data ────────────────

export const getBlueButtonCoverage = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const connection = await getConnection(db, patientId, region);
        if (!connection) {
            return res.status(404).json({ error: 'No Blue Button connection. Authorize first.' });
        }

        const coverage = await fetchFromCMS(connection.accessToken, `/Coverage?beneficiary=${connection.cmsPatientId}`);

        const user = (req as any).user;
        await writeAuditLog(user.id, patientId, 'BLUEBUTTON_COVERAGE_READ', 'Retrieved CMS coverage data', { region });

        res.json(coverage);

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch coverage data', details: error.message });
    }
};

// ─── GET /bluebutton/status/:patientId — Get connection status ──────────────

export const getBlueButtonStatus = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const connection = await getConnection(db, patientId, region);

        if (!connection) {
            return res.json({
                status: 'disconnected',
                message: 'No Blue Button 2.0 connection found',
                registrationUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/applications/',
            });
        }

        const isExpired = new Date(connection.expiresAt) < new Date();

        res.json({
            status: isExpired ? 'expired' : 'connected',
            cmsPatientId: connection.cmsPatientId,
            connectedAt: connection.connectedAt,
            expiresAt: connection.expiresAt,
            scope: connection.scope,
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get Blue Button status', details: error.message });
    }
};

// ─── DELETE /bluebutton/disconnect/:patientId — Disconnect Blue Button ──────

export const disconnectBlueButton = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        // Only the patient themselves or a doctor/admin can disconnect
        if (user.id !== patientId && !user.isDoctor && !user.isAdmin) {
            return res.status(403).json({ error: 'Not authorized to disconnect this account' });
        }

        const connection = await getConnection(db, patientId, region);
        if (!connection) {
            return res.status(404).json({ error: 'No Blue Button connection found' });
        }

        await db.send(new UpdateCommand({
            TableName: TABLE_BB_CONNECTIONS,
            Key: { patientId },
            UpdateExpression: 'SET #s = :s, updatedAt = :u, accessToken = :null, refreshToken = :null',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
                ':s': 'disconnected',
                ':u': new Date().toISOString(),
                ':null': null,
            },
        }));

        await writeAuditLog(user.id, patientId, 'BLUEBUTTON_DISCONNECTED', 'Blue Button 2.0 account disconnected', { region });

        res.json({ status: 'disconnected', message: 'Blue Button 2.0 account disconnected' });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to disconnect Blue Button', details: error.message });
    }
};
