import { z } from 'zod';

// Cognito's documented SOFTWARE_TOKEN_MFA protocol and our private table namespace.
export const NATIVE_MFA_CHALLENGE = 'SOFTWARE_TOKEN_MFA';
export const NATIVE_MFA_PROOF_KIND = 'NATIVE_TOTP_SESSION_PROOF';
export const nativeMfaInput = z.object({ session: z.string().min(20).max(2048), code: z.string().regex(/^\d{6}$/) }).strict();

export interface MfaPrincipal { id: string; username?: string; region: string; clientId: string; sessionTokenHash: string }
export interface MfaProof {
    appointmentId: string; kind: typeof NATIVE_MFA_PROOF_KIND; patientId: string;
    region: string; clientId: string; proofAuthTime: number; expiresAt: number; ttl: number;
}
export interface MfaDependencies {
    now(): number;
    maxAgeSeconds: number;
    respond(user: MfaPrincipal, session: string, code: string): Promise<string | undefined>;
    verify(token: string, region: string): Promise<{ sub: string; aud: string; auth_time?: unknown; exp: number }>;
    write(proof: MfaProof): Promise<void>;
    read(key: string, region: string): Promise<MfaProof | undefined>;
}

export function mfaProofKey(user: MfaPrincipal): string {
    if (!/^[a-f0-9]{64}$/.test(user.sessionTokenHash)) throw new Error('INVALID_SESSION_BINDING');
    return 'native-mfa#' + user.sessionTokenHash;
}

export async function completeNativeMfa(user: MfaPrincipal, input: unknown, dependencies: MfaDependencies): Promise<number> {
    const parsed = nativeMfaInput.parse(input);
    const key = mfaProofKey(user);
    const token = await dependencies.respond(user, parsed.session, parsed.code);
    if (!token) throw new Error('NATIVE_MFA_NOT_COMPLETED');
    const claims = await dependencies.verify(token, user.region);
    const now = dependencies.now();
    if (claims.sub !== user.id || claims.aud !== user.clientId ||
        !Number.isSafeInteger(claims.auth_time) || typeof claims.auth_time !== 'number' ||
        claims.auth_time <= 0 || claims.auth_time > now || now - claims.auth_time > dependencies.maxAgeSeconds ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now) {
        throw new Error('NATIVE_MFA_SESSION_MISMATCH');
    }
    const expiresAt = Math.min(claims.exp, claims.auth_time + dependencies.maxAgeSeconds);
    await dependencies.write({ appointmentId: key, kind: NATIVE_MFA_PROOF_KIND, patientId: user.id,
        region: user.region, clientId: user.clientId, proofAuthTime: claims.auth_time, expiresAt, ttl: expiresAt });
    return expiresAt;
}

export async function readNativeMfa(user: MfaPrincipal, dependencies: MfaDependencies): Promise<number | undefined> {
    const key = mfaProofKey(user);
    const proof = await dependencies.read(key, user.region);
    const now = dependencies.now();
    if (!proof || proof.appointmentId !== key || proof.kind !== NATIVE_MFA_PROOF_KIND ||
        proof.patientId !== user.id || proof.region !== user.region || proof.clientId !== user.clientId ||
        !Number.isSafeInteger(proof.proofAuthTime) || proof.proofAuthTime <= 0 || proof.proofAuthTime > now ||
        now - proof.proofAuthTime > dependencies.maxAgeSeconds ||
        !Number.isSafeInteger(proof.expiresAt) || proof.expiresAt <= now) return undefined;
    return proof.proofAuthTime;
}
