/**
 * Optimistic Locking Utility — SOC 2 PI1 (Processing Integrity)
 * Prevents lost updates via version-based concurrency control.
 *
 * Uses a `version` attribute on DynamoDB items. Updates include a
 * condition expression that fails if the version has changed since read.
 *
 * Usage:
 *   const item = await getWithVersion(db, table, key);
 *   await updateWithVersion(db, table, key, item.version, updateExpr, values);
 */

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { safeError } from './logger';

export class OptimisticLockError extends Error {
    constructor(tableName: string, key: Record<string, any>) {
        super(`Concurrent modification detected on ${tableName}: ${JSON.stringify(key)}`);
        this.name = 'OptimisticLockError';
    }
}

/**
 * Read an item and return it with its current version number.
 * If the item has no version field, returns version 0 (first-time migration).
 */
export async function getWithVersion(
    db: any,
    tableName: string,
    key: Record<string, any>
): Promise<{ item: any; version: number }> {
    const result = await db.send(new GetCommand({ TableName: tableName, Key: key }));
    if (!result.Item) {
        return { item: null, version: 0 };
    }
    return {
        item: result.Item,
        version: result.Item._version || 0
    };
}

/**
 * Update an item with optimistic locking.
 * Appends a version condition to the update expression.
 * Throws OptimisticLockError if the version has changed since read.
 */
export async function updateWithVersion(
    db: any,
    tableName: string,
    key: Record<string, any>,
    expectedVersion: number,
    updateExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
): Promise<{ newVersion: number }> {
    const newVersion = expectedVersion + 1;

    // Append version update to expression
    const versionExpr = updateExpression.includes('SET ')
        ? updateExpression + ', _version = :newVer'
        : 'SET _version = :newVer, ' + updateExpression.replace('SET ', '');

    const conditionExpression = expectedVersion === 0
        ? 'attribute_not_exists(_version) OR _version = :expectedVer'
        : '_version = :expectedVer';

    try {
        await db.send(new UpdateCommand({
            TableName: tableName,
            Key: key,
            UpdateExpression: versionExpr,
            ConditionExpression: conditionExpression,
            ExpressionAttributeValues: {
                ...expressionAttributeValues,
                ':newVer': newVersion,
                ':expectedVer': expectedVersion,
            },
            ...(expressionAttributeNames && { ExpressionAttributeNames: expressionAttributeNames }),
        }));
        return { newVersion };
    } catch (error: any) {
        if (error.name === 'ConditionalCheckFailedException') {
            throw new OptimisticLockError(tableName, key);
        }
        throw error;
    }
}

/**
 * Extract version from If-Match header (ETag format).
 * Returns the version number or null if not present.
 */
export function parseIfMatchVersion(req: any): number | null {
    const ifMatch = req.headers['if-match'];
    if (!ifMatch) return null;
    const match = ifMatch.replace(/"/g, '').match(/^v(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Set ETag header with the current version.
 */
export function setETagVersion(res: any, version: number): void {
    res.setHeader('ETag', `"v${version}"`);
}
