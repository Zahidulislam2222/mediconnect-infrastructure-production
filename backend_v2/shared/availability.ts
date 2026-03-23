/**
 * Availability Configuration — SOC 2 A1 (Availability)
 * Defines RTO/RPO targets, capacity thresholds, and health-check
 * integration constants for disaster recovery compliance.
 *
 * Referenced by: health endpoints, deployment scripts, DR runbook.
 */

/** Recovery Time Objective — maximum tolerable downtime */
export const RTO_SECONDS = {
    CRITICAL: 300,      // 5 min — auth, patient data, appointments
    HIGH: 900,          // 15 min — prescriptions, billing
    MEDIUM: 3600,       // 1 hr — analytics, reports
    LOW: 86400,         // 24 hr — batch exports, non-urgent
} as const;

/** Recovery Point Objective — maximum tolerable data loss */
export const RPO_SECONDS = {
    CRITICAL: 0,        // Zero data loss — DynamoDB continuous backup
    HIGH: 300,          // 5 min — BigQuery streaming
    MEDIUM: 3600,       // 1 hr — S3 cross-region replication
    LOW: 86400,         // 24 hr — cold backups
} as const;

/** Service tiers for capacity planning */
export const SERVICE_TIERS: Record<string, {
    rto: number;
    rpo: number;
    minInstances: number;
    maxInstances: number;
    cpuThreshold: number;
    memoryThreshold: number;
}> = {
    'patient-service': { rto: RTO_SECONDS.CRITICAL, rpo: RPO_SECONDS.CRITICAL, minInstances: 1, maxInstances: 5, cpuThreshold: 70, memoryThreshold: 80 },
    'doctor-service': { rto: RTO_SECONDS.CRITICAL, rpo: RPO_SECONDS.CRITICAL, minInstances: 1, maxInstances: 5, cpuThreshold: 70, memoryThreshold: 80 },
    'booking-service': { rto: RTO_SECONDS.CRITICAL, rpo: RPO_SECONDS.CRITICAL, minInstances: 1, maxInstances: 5, cpuThreshold: 70, memoryThreshold: 80 },
    'communication-service': { rto: RTO_SECONDS.HIGH, rpo: RPO_SECONDS.HIGH, minInstances: 1, maxInstances: 3, cpuThreshold: 75, memoryThreshold: 85 },
    'admin-service': { rto: RTO_SECONDS.MEDIUM, rpo: RPO_SECONDS.MEDIUM, minInstances: 0, maxInstances: 2, cpuThreshold: 80, memoryThreshold: 90 },
    'staff-service': { rto: RTO_SECONDS.HIGH, rpo: RPO_SECONDS.HIGH, minInstances: 1, maxInstances: 3, cpuThreshold: 75, memoryThreshold: 85 },
    'dicom-service': { rto: RTO_SECONDS.HIGH, rpo: RPO_SECONDS.HIGH, minInstances: 0, maxInstances: 2, cpuThreshold: 80, memoryThreshold: 90 },
};

/** Health check configuration for readiness probes */
export const HEALTH_CHECK_CONFIG = {
    interval: 10,           // seconds between checks
    timeout: 5,             // seconds before timeout
    healthyThreshold: 2,    // consecutive successes to mark healthy
    unhealthyThreshold: 3,  // consecutive failures to mark unhealthy
    gracePeriod: 30,        // seconds after startup before checks begin
} as const;

/** Backup verification schedule */
export const BACKUP_SCHEDULE = {
    dynamodb: { type: 'continuous', pitrEnabled: true, retentionDays: 35 },
    s3: { type: 'cross-region-replication', versioningEnabled: true },
    bigquery: { type: 'snapshot', frequencyHours: 24, retentionDays: 90 },
} as const;

/**
 * Check if a service's capacity thresholds are exceeded.
 * Returns true if the service should scale up.
 */
export function shouldScaleUp(
    serviceName: string,
    currentCpu: number,
    currentMemory: number
): boolean {
    const tier = SERVICE_TIERS[serviceName];
    if (!tier) return false;
    return currentCpu > tier.cpuThreshold || currentMemory > tier.memoryThreshold;
}

/**
 * Get the failover configuration for a service.
 */
export function getFailoverConfig(serviceName: string) {
    const tier = SERVICE_TIERS[serviceName];
    return {
        rtoSeconds: tier?.rto || RTO_SECONDS.MEDIUM,
        rpoSeconds: tier?.rpo || RPO_SECONDS.MEDIUM,
        primaryRegion: 'us-east-1',
        failoverRegion: 'eu-central-1',
        healthEndpoint: '/health',
        readinessEndpoint: '/ready',
    };
}
