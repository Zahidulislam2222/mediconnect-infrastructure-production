/**
 * KMS Envelope Encryption Utility
 * ================================
 * Security Fix: Google OAuth refresh tokens were stored as plaintext in
 * DynamoDB. Anyone with DB access (or a DB dump) could use these tokens
 * to access doctors' Google Calendars.
 *
 * This utility provides encrypt/decrypt functions using AWS KMS envelope
 * encryption. The KMS key ID is loaded from environment variables.
 *
 * Used by: doctor-service (write/read tokens), booking-service (read tokens)
 */

import { EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { getRegionalKMSClient } from './aws-config';
import { safeError } from './logger';

// KMS key alias or ARN — set per region in environment
const KMS_KEY_ID_US = () => process.env.KMS_KEY_ID_US || process.env.KMS_KEY_ID || "";
const KMS_KEY_ID_EU = () => process.env.KMS_KEY_ID_EU || process.env.KMS_KEY_ID || "";

// Prefix to distinguish encrypted values from plaintext (migration safety)
const ENCRYPTED_PREFIX = "kms:";

function getKmsKeyId(region: string): string {
    const isEU = region?.toUpperCase().includes('EU');
    const keyId = isEU ? KMS_KEY_ID_EU() : KMS_KEY_ID_US();
    if (!keyId) {
        throw new Error(`KMS_CRITICAL: Missing KMS key ID for region ${region}. Set KMS_KEY_ID_US or KMS_KEY_ID_EU.`);
    }
    return keyId;
}

/**
 * Encrypt a plaintext string using KMS.
 * Returns a prefixed base64 string: "kms:<base64_ciphertext>"
 *
 * The prefix allows safe migration — existing plaintext values can be
 * detected and re-encrypted on read (see decryptToken).
 */
export async function encryptToken(plaintext: string, region: string): Promise<string> {
    if (!plaintext) return "";

    const kmsClient = getRegionalKMSClient(region);
    const keyId = getKmsKeyId(region);

    try {
        const result = await kmsClient.send(new EncryptCommand({
            KeyId: keyId,
            Plaintext: Buffer.from(plaintext, 'utf-8'),
        }));

        if (!result.CiphertextBlob) {
            throw new Error("KMS returned empty ciphertext");
        }

        const cipherBase64 = Buffer.from(result.CiphertextBlob).toString('base64');
        return `${ENCRYPTED_PREFIX}${cipherBase64}`;

    } catch (err: any) {
        safeError(`KMS Encrypt Failed [${region}]:`, err.message);
        throw new Error("Failed to encrypt sensitive data");
    }
}

/**
 * Decrypt a KMS-encrypted token string.
 *
 * MIGRATION SAFETY: If the value doesn't start with "kms:", it's a
 * legacy plaintext token from before this fix. In that case, return
 * it as-is (the caller should re-encrypt it on next write).
 */
export async function decryptToken(ciphertext: string, region: string): Promise<string> {
    if (!ciphertext) return "";

    // Migration safety: handle legacy plaintext tokens gracefully
    if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) {
        safeError("KMS: Found unencrypted token (legacy). Will be encrypted on next write.");
        return ciphertext;
    }

    const cipherBase64 = ciphertext.slice(ENCRYPTED_PREFIX.length);
    const kmsClient = getRegionalKMSClient(region);

    try {
        const result = await kmsClient.send(new DecryptCommand({
            CiphertextBlob: Buffer.from(cipherBase64, 'base64'),
        }));

        if (!result.Plaintext) {
            throw new Error("KMS returned empty plaintext");
        }

        return Buffer.from(result.Plaintext).toString('utf-8');

    } catch (err: any) {
        safeError(`KMS Decrypt Failed [${region}]:`, err.message);
        throw new Error("Failed to decrypt sensitive data");
    }
}

/** Check if a value is already encrypted (has KMS prefix). Useful for migration-safe encryption. */
export function isEncrypted(value: string): boolean {
    return value?.startsWith(ENCRYPTED_PREFIX) || false;
}

// Prefix to distinguish PHI-encrypted fields
const PHI_PREFIX = "phi:";

/**
 * Encrypt all PHI fields in a record using KMS.
 * Each value is encrypted via encryptToken and tagged with the PHI prefix.
 * Empty or null values are skipped (preserved as-is).
 */
export async function encryptPHI(
    fields: Record<string, string>,
    region: string
): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(fields)) {
        if (!value) {
            result[key] = value;
            continue;
        }
        const encrypted = await encryptToken(value, region);
        result[key] = `${PHI_PREFIX}${encrypted}`;
    }

    return result;
}

/**
 * Decrypt all PHI fields in a record using KMS.
 * Each value with the PHI prefix is unwrapped and decrypted via decryptToken.
 * Empty or null values are skipped (preserved as-is).
 */
export async function decryptPHI(
    fields: Record<string, string>,
    region: string
): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(fields)) {
        if (!value) {
            result[key] = value;
            continue;
        }
        if (value.startsWith(PHI_PREFIX)) {
            const inner = value.slice(PHI_PREFIX.length);
            result[key] = await decryptToken(inner, region);
        } else {
            result[key] = value;
        }
    }

    return result;
}
