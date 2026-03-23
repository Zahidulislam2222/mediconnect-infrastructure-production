/**
 * CloudWatch Custom Metrics — SOC 2 CC6 (Security Monitoring)
 * Publishes custom metrics to CloudWatch for security monitoring,
 * performance tracking, and anomaly detection.
 *
 * Graceful degradation: if CloudWatch is unavailable, logs locally.
 */

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { safeLog, safeError } from './logger';

const NAMESPACE = 'MediConnect';

const cwClients: Record<string, CloudWatchClient> = {};

function getCWClient(region: string = 'us-east-1'): CloudWatchClient {
    const target = region?.toUpperCase().includes('EU') ? 'eu-central-1' : 'us-east-1';
    if (cwClients[target]) return cwClients[target];
    cwClients[target] = new CloudWatchClient({ region: target });
    return cwClients[target];
}

export enum MetricName {
    // Security metrics
    AUTH_FAILURE = 'AuthFailure',
    BREACH_ALERT = 'BreachAlert',
    PHI_ACCESS = 'PHIAccess',
    MFA_BYPASS_ATTEMPT = 'MFABypassAttempt',
    EMERGENCY_ACCESS = 'EmergencyAccess',

    // Performance metrics
    REQUEST_LATENCY = 'RequestLatency',
    REQUEST_COUNT = 'RequestCount',
    ERROR_COUNT = 'ErrorCount',

    // Business metrics
    APPOINTMENT_BOOKED = 'AppointmentBooked',
    APPOINTMENT_CANCELLED = 'AppointmentCancelled',
    PRESCRIPTION_ISSUED = 'PrescriptionIssued',
    GDPR_ERASURE = 'GDPRErasure',
    GDPR_EXPORT = 'GDPRExport',
}

/**
 * Publish a single metric data point to CloudWatch.
 * Non-blocking: failures are logged, never thrown.
 */
export async function publishMetric(
    metricName: MetricName | string,
    value: number = 1,
    unit: 'Count' | 'Milliseconds' | 'Bytes' | 'None' = 'Count',
    dimensions?: Record<string, string>,
    region?: string
): Promise<void> {
    try {
        const cw = getCWClient(region);
        const metricDimensions = dimensions
            ? Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }))
            : [{ Name: 'Service', Value: process.env.SERVICE_NAME || 'unknown' }];

        await cw.send(new PutMetricDataCommand({
            Namespace: NAMESPACE,
            MetricData: [{
                MetricName: metricName,
                Value: value,
                Unit: unit,
                Timestamp: new Date(),
                Dimensions: metricDimensions
            }]
        }));
    } catch (error: any) {
        // Non-blocking: CloudWatch failure should not break business logic
        safeError('[METRICS] CloudWatch publish failed', { metric: metricName, error: error.message });
    }
}

/**
 * Express middleware that tracks request latency and count.
 * Apply early in the middleware stack (after health checks).
 */
export function metricsMiddleware() {
    return (req: any, res: any, next: any) => {
        if (req.path === '/health' || req.path === '/ready') return next();

        const start = Date.now();
        const service = process.env.SERVICE_NAME || 'unknown';

        res.on('finish', () => {
            const latency = Date.now() - start;
            const dims = { Service: service, Method: req.method, Path: req.route?.path || req.path };

            publishMetric(MetricName.REQUEST_LATENCY, latency, 'Milliseconds', dims).catch(() => {});
            publishMetric(MetricName.REQUEST_COUNT, 1, 'Count', dims).catch(() => {});

            if (res.statusCode >= 500) {
                publishMetric(MetricName.ERROR_COUNT, 1, 'Count', dims).catch(() => {});
            }
        });

        next();
    };
}
