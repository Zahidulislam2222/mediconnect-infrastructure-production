import { Request, Response } from 'express';

export const getCapabilityStatement = (req: Request, res: Response) => {
    const capabilityStatement = {
        resourceType: "CapabilityStatement",
        id: "mediconnect-fhir-server",
        url: "https://api.mediconnect.com/fhir/metadata",
        version: "1.0.0",
        name: "MediConnectFHIRServer",
        title: "MediConnect FHIR R4 Capability Statement",
        status: "active",
        experimental: false,
        date: new Date().toISOString(),
        publisher: "MediConnect Healthcare Platform",
        kind: "instance",
        software: {
            name: "MediConnect",
            version: "2.0.0"
        },
        implementation: {
            description: "MediConnect FHIR R4 Server",
            url: "https://api.mediconnect.com/fhir"
        },
        fhirVersion: "4.0.1",
        format: ["json"],
        rest: [{
            mode: "server",
            security: {
                cors: true,
                service: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/restful-security-service", code: "SMART-on-FHIR" }] }],
                description: "OAuth2 via AWS Cognito, HIPAA/GDPR compliant, SMART App Launch 2.0",
                extension: [{
                    url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                    extension: [
                        { url: "authorize", valueUri: `${process.env.COGNITO_DOMAIN || 'https://mediconnect.auth.us-east-1.amazoncognito.com'}/oauth2/authorize` },
                        { url: "token", valueUri: `${process.env.COGNITO_DOMAIN || 'https://mediconnect.auth.us-east-1.amazoncognito.com'}/oauth2/token` },
                    ]
                }]
            },
            resource: [
                {
                    type: "Patient",
                    profile: "http://hl7.org/fhir/StructureDefinition/Patient",
                    interaction: [
                        { code: "read" }, { code: "search-type" }, { code: "create" }, { code: "update" }, { code: "delete" }
                    ],
                    searchParam: [
                        { name: "_id", type: "token" },
                        { name: "name", type: "string" },
                        { name: "email", type: "token" },
                        { name: "identifier", type: "token" },
                        { name: "_lastUpdated", type: "date" }
                    ]
                },
                {
                    type: "Practitioner",
                    profile: "http://hl7.org/fhir/StructureDefinition/Practitioner",
                    interaction: [
                        { code: "read" }, { code: "search-type" }, { code: "create" }, { code: "update" }
                    ],
                    searchParam: [
                        { name: "_id", type: "token" },
                        { name: "name", type: "string" },
                        { name: "identifier", type: "token" }
                    ]
                },
                {
                    type: "PractitionerRole",
                    profile: "http://hl7.org/fhir/StructureDefinition/PractitionerRole",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "practitioner", type: "reference" },
                        { name: "specialty", type: "token" }
                    ]
                },
                {
                    type: "Appointment",
                    profile: "http://hl7.org/fhir/StructureDefinition/Appointment",
                    interaction: [
                        { code: "read" }, { code: "search-type" }, { code: "create" }, { code: "update" }
                    ],
                    searchParam: [
                        { name: "_id", type: "token" },
                        { name: "patient", type: "reference" },
                        { name: "practitioner", type: "reference" },
                        { name: "date", type: "date" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "Observation",
                    profile: "http://hl7.org/fhir/StructureDefinition/Observation",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "code", type: "token" },
                        { name: "date", type: "date" },
                        { name: "category", type: "token" }
                    ]
                },
                {
                    type: "MedicationRequest",
                    profile: "http://hl7.org/fhir/StructureDefinition/MedicationRequest",
                    interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "requester", type: "reference" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "DiagnosticReport",
                    profile: "http://hl7.org/fhir/StructureDefinition/DiagnosticReport",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "category", type: "token" },
                        { name: "code", type: "token" }
                    ]
                },
                {
                    type: "RiskAssessment",
                    profile: "http://hl7.org/fhir/StructureDefinition/RiskAssessment",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "performer", type: "reference" }
                    ]
                },
                {
                    type: "Communication",
                    profile: "http://hl7.org/fhir/StructureDefinition/Communication",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "sender", type: "reference" },
                        { name: "recipient", type: "reference" }
                    ]
                },
                {
                    type: "Coverage",
                    profile: "http://hl7.org/fhir/StructureDefinition/Coverage",
                    interaction: [{ code: "read" }],
                    searchParam: [
                        { name: "subscriber", type: "reference" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "Consent",
                    profile: "http://hl7.org/fhir/StructureDefinition/Consent",
                    interaction: [{ code: "read" }, { code: "create" }, { code: "update" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "ClinicalImpression",
                    profile: "http://hl7.org/fhir/StructureDefinition/ClinicalImpression",
                    interaction: [{ code: "read" }, { code: "create" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "assessor", type: "reference" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "DocumentReference",
                    profile: "http://hl7.org/fhir/StructureDefinition/DocumentReference",
                    interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "type", type: "token" },
                        { name: "date", type: "date" }
                    ]
                },
                {
                    type: "AuditEvent",
                    profile: "http://hl7.org/fhir/StructureDefinition/AuditEvent",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "agent", type: "reference" },
                        { name: "entity", type: "reference" },
                        { name: "date", type: "date" },
                        { name: "action", type: "token" }
                    ]
                }
            ]
        }]
    };

    res.json(capabilityStatement);
};

// ─── Gap #4 FIX: SMART on FHIR Well-Known Configuration ─────────────────────
// SMART App Launch Framework conformance endpoint.
// Ref: http://hl7.org/fhir/smart-app-launch/conformance.html
// Exposed at: GET /.well-known/smart-configuration
// ────────────────────────────────────────────────────────────────────────────

export const getSmartConfiguration = (req: Request, res: Response) => {
    const baseUrl = process.env.FHIR_BASE_URL || 'https://api.mediconnect.com/fhir';
    const cognitoBaseUrl = process.env.COGNITO_DOMAIN || 'https://mediconnect.auth.us-east-1.amazoncognito.com';

    const smartConfig = {
        // REQUIRED fields per SMART App Launch 2.0
        issuer: baseUrl,
        authorization_endpoint: `${cognitoBaseUrl}/oauth2/authorize`,
        token_endpoint: `${cognitoBaseUrl}/oauth2/token`,
        jwks_uri: `${cognitoBaseUrl}/.well-known/jwks.json`,

        // Supported grant types
        grant_types_supported: [
            'authorization_code',
            'client_credentials',
        ],

        // SMART-specific capabilities
        scopes_supported: [
            'openid',
            'fhirUser',
            'launch',
            'launch/patient',
            'launch/practitioner',
            'patient/*.read',
            'patient/*.write',
            'user/*.read',
            'user/*.write',
            'offline_access',
        ],

        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],

        // SMART capabilities (what this server supports)
        capabilities: [
            'launch-ehr',
            'launch-standalone',
            'client-public',
            'client-confidential-symmetric',
            'sso-openid-connect',
            'context-ehr-patient',
            'context-standalone-patient',
            'permission-offline',
            'permission-patient',
            'permission-user',
        ],

        // Token introspection (if supported)
        introspection_endpoint: `${cognitoBaseUrl}/oauth2/introspect`,

        // Management endpoints
        management_endpoint: `${baseUrl}/manage`,
        registration_endpoint: `${cognitoBaseUrl}/oauth2/register`,
    };

    res.json(smartConfig);
};

// ─── GET /fhir/launch — SMART EHR Launch Context ────────────────────────────
// Returns launch context (patient, practitioner) for SMART app launch.
// Called by EHR to provide context to the SMART app being launched.
// ────────────────────────────────────────────────────────────────────────────

export const getSmartLaunchContext = (req: Request, res: Response) => {
    const user = (req as any).user;

    if (!user) {
        return res.status(401).json({ error: 'Authentication required for SMART launch' });
    }

    const patientId = req.query.patient as string || req.params.patientId;
    const launchId = `launch-${Date.now().toString(36)}`;

    const launchContext: any = {
        launch: launchId,
        // Include practitioner context if user is a doctor
        ...(user.isDoctor && { practitioner: user.id }),
        // Include patient context if specified or if user is a patient
        ...(patientId && { patient: patientId }),
        ...(!patientId && user.isPatient && { patient: user.id }),
        // FHIR server endpoint
        fhirServer: process.env.FHIR_BASE_URL || 'https://api.mediconnect.com/fhir',
        // Token endpoints for the SMART app to use
        tokenUrl: `${process.env.COGNITO_DOMAIN || 'https://mediconnect.auth.us-east-1.amazoncognito.com'}/oauth2/token`,
        // Supported scopes for this launch
        scope: user.isDoctor
            ? 'openid fhirUser launch user/*.read user/*.write'
            : 'openid fhirUser launch/patient patient/*.read',
    };

    res.json(launchContext);
};
