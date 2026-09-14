import { z } from "zod";

// These standardized process variables are consumed directly by the AWS SDK,
// including before application modules initialize; their examples live in .env.example.
export const SDK_ENVIRONMENT_NAMES = ["AWS_EC2_METADATA_DISABLED"] as const;

const resourceNameSchema = z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z0-9_.-]+$/, "must be a valid cloud resource name");

export type TableEnvironmentVariable =
    | "TABLE_DRUG_INTERACTIONS"
    | "TABLE_CHAT_HISTORY"
    | "TABLE_CHAT_CONNECTIONS"
    | "TABLE_CONSENT_LEDGER"
    | "TABLE_KNOWLEDGE_BASE"
    | "TABLE_DICOM_STUDIES"
    | "TABLE_HL7_MESSAGES"
    | "TABLE_EHR"
    | "TABLE_INVENTORY";

export function requiredEnv(name: string): string {
    const parsed = z.string().trim().min(1).safeParse(process.env[name]);
    if (!parsed.success) {
        throw new Error(`Missing required configuration: ${name}`);
    }
    return parsed.data;
}

// Business modules use this alias so environment reads have one validated owner.
export const setting = requiredEnv;

export function getSensitiveOperationSettings() {
    return z.object({ maxAuthAgeSeconds: z.coerce.number().int().positive() })
        .parse({ maxAuthAgeSeconds: setting('SENSITIVE_OPERATION_AUTH_MAX_AGE_SECONDS') });
}

export function getMonitoringSettings() {
    return z.object({ maxSessionSeconds: z.coerce.number().int().positive().max(2147483),
        highHeartRateThreshold: z.coerce.number().finite().positive() })
        .parse({ maxSessionSeconds: setting('MONITORING_MAX_SESSION_SECONDS'),
            highHeartRateThreshold: setting('MONITORING_HIGH_HEART_RATE_THRESHOLD') });
}

const exactOrigin = z.string().transform((value, context) => {
    try {
        const url = new URL(value);
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        const protocolAllowed = url.protocol === 'https:' ||
            (loopback && url.protocol === 'http:') ||
            (url.hostname === 'localhost' && url.protocol === 'capacitor:');
        if (!protocolAllowed || url.username || url.password || url.search || url.hash ||
            !['', '/'].includes(url.pathname) || url.hostname.includes('*')) throw new Error('Invalid origin');
        return url.protocol === 'capacitor:' ? `${url.protocol}//${url.host}` : url.origin;
    } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected an exact HTTPS or explicit local-client origin' });
        return z.NEVER;
    }
});

export function getApiBrowserSettings() {
    const origins = z.array(exactOrigin);
    const cspOrigins = z.array(exactOrigin.refine(value => value.startsWith('https:'), 'CSP origins must use HTTPS'));
    return {
        origins: origins.parse([
            ...setting('ALLOWED_ORIGINS').split(',').map(value => value.trim()).filter(Boolean),
            ...z.array(z.string()).parse(JSON.parse(setting('CORS_ADDITIONAL_ORIGINS_JSON'))),
        ]),
        credentials: z.enum(['true', 'false']).parse(setting('CORS_CREDENTIALS')) === 'true',
        methods: z.array(z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']))
            .nonempty().parse(setting('CORS_ALLOWED_METHODS').split(',').map(value => value.trim())),
        headers: z.array(z.string().regex(/^[A-Za-z0-9-]+$/)).nonempty()
            .parse(setting('CORS_ALLOWED_HEADERS').split(',').map(value => value.trim())),
        hstsMaxAge: z.coerce.number().int().positive().parse(setting('HTTP_HSTS_MAX_AGE_SECONDS')),
        connectOrigins: cspOrigins.parse(JSON.parse(setting('HTTP_CSP_CONNECT_ORIGINS_JSON'))),
        scriptOrigins: cspOrigins.parse(JSON.parse(setting('HTTP_CSP_SCRIPT_ORIGINS_JSON'))),
        imageOrigins: cspOrigins.parse(JSON.parse(setting('HTTP_CSP_IMAGE_ORIGINS_JSON'))),
    };
}

export function getVitalsSettings() {
    return z.object({ historyLimit: z.coerce.number().int().positive() })
        .parse({ historyLimit: setting('VITALS_HISTORY_LIMIT') });
}

export function getSocketTicketSettings() {
    return z.object({ lifetimeSeconds: z.coerce.number().int().positive().max(300) })
        .parse({ lifetimeSeconds: setting('WS_TICKET_LIFETIME_SECONDS') });
}

export function getPrivacySettings() {
    return z.object({
        maxPages: z.coerce.number().int().positive(),
        batchAttempts: z.coerce.number().int().positive().max(10),
        retryDelayMs: z.coerce.number().int().nonnegative(),
        leaseSeconds: z.coerce.number().int().positive(),
        policyVersion: z.string().min(1),
        executionEnabled: z.enum(['true', 'false']).transform(value => value === 'true'),
        usRegion: z.string().min(1), euRegion: z.string().min(1),
    }).parse({
        maxPages: setting('PRIVACY_MAX_PAGES'), batchAttempts: setting('PRIVACY_BATCH_ATTEMPTS'),
        retryDelayMs: setting('PRIVACY_RETRY_DELAY_MS'), leaseSeconds: setting('PRIVACY_LEASE_SECONDS'),
        policyVersion: setting('PRIVACY_POLICY_VERSION'), executionEnabled: setting('PRIVACY_EXECUTION_ENABLED'),
        usRegion: setting('PRIVACY_US_REGION'), euRegion: setting('PRIVACY_EU_REGION'),
    });
}

export function getPrivacyAnalyticsSettings(region: 'US' | 'EU') {
    const identifier = z.string().regex(/^[A-Za-z0-9_]+$/);
    return z.object({
        endpoint: z.string().url().refine(value => {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
        }, 'Analytics endpoint must use HTTPS without credentials, query or fragment'), location: z.string().min(1),
        analyticsDataset: identifier, aiDataset: identifier, iotDataset: identifier, iotTable: identifier,
        maxPolls: z.coerce.number().int().positive(), pollDelayMs: z.coerce.number().int().nonnegative(),
        timeoutMs: z.coerce.number().int().positive(),
    }).parse({
        endpoint: setting('PRIVACY_BQ_ENDPOINT'), location: setting(`PRIVACY_BQ_LOCATION_${region}`),
        analyticsDataset: setting(`PRIVACY_BQ_ANALYTICS_${region}`), aiDataset: setting(`PRIVACY_BQ_AI_${region}`),
        iotDataset: setting(`PRIVACY_BQ_IOT_${region}`), iotTable: setting('IOT_ANALYTICS_TABLE'), maxPolls: setting('PRIVACY_BQ_MAX_POLLS'),
        pollDelayMs: setting('PRIVACY_BQ_POLL_DELAY_MS'), timeoutMs: setting('PRIVACY_BQ_TIMEOUT_MS'),
    });
}

export function getBillingSettings() {
    return z.object({
        parameterPath: z.string().startsWith('/'),
        currency: z.string().regex(/^[a-z]{3}$/),
        minorUnitScale: z.coerce.number().int().positive(),
    }).parse({
        parameterPath: setting('BILLING_STRIPE_PARAMETER_PATH'),
        currency: setting('BILLING_CURRENCY'),
        minorUnitScale: setting('BILLING_MINOR_UNIT_SCALE'),
    });
}

export function requiredPositiveInteger(name: string): number {
    const parsed = z.coerce.number().int().positive().safeParse(requiredEnv(name));
    if (!parsed.success) {
        throw new Error(`Invalid positive integer configuration: ${name}`);
    }
    return parsed.data;
}

export function requiredUnitInterval(name: string): number {
    const parsed = z.coerce.number().min(0).max(1).safeParse(requiredEnv(name));
    if (!parsed.success) {
        throw new Error(`Invalid 0..1 configuration: ${name}`);
    }
    return parsed.data;
}

export function requiredResourceName(name: TableEnvironmentVariable): string {
    const parsed = resourceNameSchema.safeParse(requiredEnv(name));
    if (!parsed.success) {
        throw new Error(`Missing or invalid required configuration: ${name}`);
    }
    return parsed.data;
}

export const TABLE_NAMES = {
    get drugInteractions(): string {
        return requiredResourceName("TABLE_DRUG_INTERACTIONS");
    },
    get chatHistory(): string {
        return requiredResourceName("TABLE_CHAT_HISTORY");
    },
    get chatConnections(): string {
        return requiredResourceName("TABLE_CHAT_CONNECTIONS");
    },
    get consentLedger(): string {
        return requiredResourceName("TABLE_CONSENT_LEDGER");
    },
    get knowledgeBase(): string {
        return requiredResourceName("TABLE_KNOWLEDGE_BASE");
    },
    get dicomStudies(): string {
        return requiredResourceName("TABLE_DICOM_STUDIES");
    },
    get hl7Messages(): string {
        return requiredResourceName("TABLE_HL7_MESSAGES");
    },
    get ehr(): string {
        return requiredResourceName("TABLE_EHR");
    },
    get inventory(): string {
        return requiredResourceName("TABLE_INVENTORY");
    },
} as const;
