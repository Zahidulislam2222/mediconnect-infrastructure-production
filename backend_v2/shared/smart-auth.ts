/**
 * SMART on FHIR Authorization Handler
 * Implements the EHR launch sequence per SMART App Launch Framework (STU 2.0)
 *
 * Flow:
 * 1. EHR redirects to /fhir/authorize with launch context
 * 2. Server validates client_id, redirect_uri, scope
 * 3. Server issues authorization code
 * 4. Client exchanges code at Cognito token endpoint
 *
 * Since MediConnect uses AWS Cognito as the identity provider,
 * this handler acts as a SMART-to-Cognito bridge.
 */

import { Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { COGNITO_CONFIG } from './aws-config';

// In-memory launch context store (production: use DynamoDB with TTL)
const launchContexts: Map<string, { patientId?: string; practitionerId?: string; encounter?: string; created: number }> = new Map();

// Cleanup expired contexts (15 min TTL)
setInterval(() => {
    const now = Date.now();
    for (const [key, ctx] of launchContexts) {
        if (now - ctx.created > 15 * 60 * 1000) launchContexts.delete(key);
    }
}, 60 * 1000);

/**
 * Register a launch context (called by EHR when launching a SMART app)
 * POST /fhir/launch-context
 */
export const registerLaunchContext = (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const launchId = randomUUID();
    launchContexts.set(launchId, {
        patientId: req.body.patient || (user.isPatient ? user.id : undefined),
        practitionerId: user.isDoctor ? user.fhirId : undefined,
        encounter: req.body.encounter,
        created: Date.now(),
    });

    res.json({ launch: launchId });
};

/**
 * SMART authorize endpoint — bridges to Cognito OAuth2
 * GET /fhir/authorize
 *
 * Required params: response_type, client_id, redirect_uri, scope, state, aud
 * Optional: launch (launch context token)
 */
export const smartAuthorize = (req: Request, res: Response) => {
    const { response_type, client_id, redirect_uri, scope, state, launch, aud } = req.query as Record<string, string>;

    // Validate required params
    if (!response_type || response_type !== 'code') {
        res.status(400).json({
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', code: 'invalid', diagnostics: 'response_type must be "code"' }]
        });
        return;
    }

    if (!client_id || !redirect_uri || !state) {
        res.status(400).json({
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', code: 'required', diagnostics: 'Missing required parameters: client_id, redirect_uri, state' }]
        });
        return;
    }

    // Validate scope contains required SMART scopes
    const scopes = (scope || '').split(' ');
    const validScopes = [
        'openid', 'fhirUser', 'launch', 'launch/patient', 'launch/practitioner',
        'patient/*.read', 'patient/*.write', 'user/*.read', 'user/*.write', 'offline_access',
        'patient/Patient.read', 'patient/Observation.read', 'patient/MedicationRequest.read',
        'patient/AllergyIntolerance.read', 'patient/Condition.read', 'patient/Procedure.read',
    ];
    const invalidScopes = scopes.filter(s => !validScopes.includes(s) && !s.match(/^(patient|user|system)\/.+\.(read|write|\*)$/));

    // Resolve launch context if provided
    let launchContext: any = {};
    if (launch && launchContexts.has(launch)) {
        launchContext = launchContexts.get(launch);
    }

    // Build Cognito OAuth2 authorize URL
    const region = (req.headers['x-user-region'] || 'us-east-1') as string;
    const regionKey = region.toUpperCase().includes('EU') ? 'EU' : 'US';
    const config = COGNITO_CONFIG[regionKey];

    const cognitoBaseUrl = `https://${config.USER_POOL_ID?.split('_')[1]?.toLowerCase() || 'mediconnect'}.auth.${region.includes('eu') ? 'eu-central-1' : 'us-east-1'}.amazoncognito.com`;

    // Encode launch context in state parameter (client can decode after callback)
    const enrichedState = Buffer.from(JSON.stringify({
        originalState: state,
        launchContext,
        smartScopes: scopes,
    })).toString('base64url');

    const cognitoUrl = new URL(`${cognitoBaseUrl}/oauth2/authorize`);
    cognitoUrl.searchParams.set('response_type', 'code');
    cognitoUrl.searchParams.set('client_id', client_id);
    cognitoUrl.searchParams.set('redirect_uri', redirect_uri);
    cognitoUrl.searchParams.set('scope', 'openid email profile');
    cognitoUrl.searchParams.set('state', enrichedState);

    res.redirect(302, cognitoUrl.toString());
};

/**
 * SMART token endpoint wrapper — adds launch context to Cognito token response
 * POST /fhir/token
 */
export const smartToken = async (req: Request, res: Response) => {
    const { grant_type, code, redirect_uri, client_id, client_secret } = req.body;

    if (grant_type !== 'authorization_code') {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
    }

    const region = (req.headers['x-user-region'] || 'us-east-1') as string;
    const regionKey = region.toUpperCase().includes('EU') ? 'EU' : 'US';
    const config = COGNITO_CONFIG[regionKey];

    const cognitoBaseUrl = `https://${config.USER_POOL_ID?.split('_')[1]?.toLowerCase() || 'mediconnect'}.auth.${region.includes('eu') ? 'eu-central-1' : 'us-east-1'}.amazoncognito.com`;

    try {
        // Exchange code at Cognito token endpoint
        const tokenResponse = await fetch(`${cognitoBaseUrl}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri,
                client_id,
                ...(client_secret && { client_secret }),
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            res.status(tokenResponse.status).json(tokenData);
            return;
        }

        // Add SMART launch context to token response
        // The launch context was encoded in the state parameter
        res.json({
            ...tokenData,
            token_type: 'Bearer',
            scope: req.body.scope || 'openid fhirUser launch',
            patient: req.body._patient_context || undefined,
            practitioner: req.body._practitioner_context || undefined,
        });
    } catch (err: any) {
        res.status(502).json({ error: 'server_error', error_description: 'Failed to exchange authorization code' });
    }
};

/**
 * SMART style metadata endpoint for FHIR-aware clients
 * GET /fhir/.well-known/smart-configuration
 * (This is already implemented in fhir-metadata.ts, this is just re-exported for clarity)
 */
