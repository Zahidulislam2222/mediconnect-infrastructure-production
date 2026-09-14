import { Server } from 'socket.io';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { z } from 'zod';
import { COGNITO_CONFIG } from '../../../../shared/aws-config';
import { canReadPatientClinicalData, PatientAccessContext } from '../../../../shared/patient-access';
import { projectVitalData } from '../../../../shared/vital-data';
import { resolveAuthRegion, Jurisdiction } from '../../../../shared/region-context';
import { getMonitoringSettings } from '../../../../shared/settings';
import { writeAuditLog } from '../../../../shared/audit';

const patientIdSchema = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/);
const roomName = (region: Jurisdiction, patientId: string) => `monitoring:${region}:${patientId}`;
type MonitoringIdentity = { id: string; region: Jurisdiction; isDoctor: boolean; expiresAt: number };
const context = (user: MonitoringIdentity): PatientAccessContext => ({ user, headers: { 'x-user-region': user.region } });

export function attachMonitoringAuthorization(io: Server) {
    const settings = getMonitoringSettings();
    const verifiers = new Map<Jurisdiction, ReturnType<typeof CognitoJwtVerifier.create>>();
    io.use(async (socket, next) => {
        try {
            const { token, region: suppliedRegion } = socket.handshake.auth;
            if (typeof token !== 'string' || !token) throw new Error('Missing token');
            const region = resolveAuthRegion(suppliedRegion);
            let verifier = verifiers.get(region);
            if (!verifier) {
                const configuration = COGNITO_CONFIG[region];
                verifier = CognitoJwtVerifier.create({ userPoolId: configuration.USER_POOL_ID, tokenUse: 'id',
                    clientId: [configuration.CLIENT_PATIENT, configuration.CLIENT_DOCTOR] });
                verifiers.set(region, verifier);
            }
            const payload = await verifier.verify(token);
            const expiresAt = z.number().int().positive().parse(payload.exp) * 1000;
            if (expiresAt <= Date.now()) throw new Error('Expired token');
            const id = patientIdSchema.parse(payload.sub);
            socket.data.identity = { id, region, expiresAt,
                isDoctor: payload['cognito:groups']?.some(group => ['doctor', 'doctors'].includes(group.toLowerCase())) === true } satisfies MonitoringIdentity;
            // Avoid retaining the original credential in socket metadata or logs after verification.
            delete socket.handshake.auth.token;
            next();
        } catch {
            next(new Error('Monitoring authentication required'));
        }
    });
    io.on('connection', socket => {
        const identity = socket.data.identity as MonitoringIdentity;
        const lifetime = Math.min(identity.expiresAt - Date.now(), settings.maxSessionSeconds * 1000);
        const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, lifetime));
        expiry.unref();
        socket.once('disconnect', () => clearTimeout(expiry));
        socket.on('join_monitoring', async (value: unknown, acknowledge: unknown) => {
            const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
            try {
                const patientId = patientIdSchema.parse(value);
                if (identity.expiresAt <= Date.now() || !await canReadPatientClinicalData(context(identity), patientId)) {
                    return reply({ ok: false, code: 'MONITORING_ACCESS_DENIED' });
                }
                await writeAuditLog(identity.id, patientId, 'MONITORING_JOIN', 'Authorized monitoring connection', { region: identity.region, requirePersistence: true });
                if (!socket.connected || identity.expiresAt <= Date.now()) return;
                await socket.join(roomName(identity.region, patientId));
                reply({ ok: true });
            } catch {
                reply({ ok: false, code: 'MONITORING_ACCESS_DENIED' });
            }
        });
    });
}

/** Recheck permission at delivery so a previously joined room does not bypass revocation. */
export async function emitAuthorizedMonitoring(io: Server, patientId: string, regionValue: string, event: 'vital_update' | 'critical_vital_alert', payload: object) {
    patientIdSchema.parse(patientId);
    const region = resolveAuthRegion(regionValue);
    const delivery = event === 'vital_update' ? projectVitalData(payload, patientId) : payload;
    const room = roomName(region, patientId);
    const sockets = await io.in(room).fetchSockets();
    await Promise.all(sockets.map(async socket => {
        const user = socket.data.identity as MonitoringIdentity | undefined;
        try {
            if (!user || user.region !== region || user.expiresAt <= Date.now() || !await canReadPatientClinicalData(context(user), patientId)) {
                await socket.leave(room); return;
            }
            await writeAuditLog(user.id, patientId, 'MONITORING_DELIVERY', 'Authorized telemetry delivery', { region, requirePersistence: true });
            if (user.expiresAt > Date.now()) socket.emit(event, delivery);
        } catch {
            await socket.leave(room);
        }
    }));
}

/** Broker configuration establishes jurisdiction, never a payload-supplied region. */
export function validateTelemetryJurisdiction(payload: { region?: unknown }, brokerRegion: string): Jurisdiction {
    const region = resolveAuthRegion(brokerRegion);
    if (payload.region !== undefined && resolveAuthRegion(payload.region) !== region) throw new Error('TELEMETRY_REGION_MISMATCH');
    return region;
}
