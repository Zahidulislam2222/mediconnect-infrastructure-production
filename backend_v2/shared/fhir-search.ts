/**
 * FHIR R4 Search Parameter Support
 * Translates FHIR search parameters to DynamoDB query/filter expressions.
 */

export interface FHIRSearchParams {
    [key: string]: string | string[] | undefined;
}

export interface DynamoFilterResult {
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, any>;
}

/**
 * Parse FHIR search parameters from Express query string.
 * Handles modifiers like :exact, :contains, :missing
 */
export function parseFHIRSearchParams(query: Record<string, any>): FHIRSearchParams {
    const params: FHIRSearchParams = {};
    for (const [key, value] of Object.entries(query)) {
        if (key.startsWith('_') && key !== '_id' && key !== '_lastUpdated' && key !== '_count' && key !== '_offset') continue;
        params[key] = value;
    }
    return params;
}

/**
 * Build DynamoDB filter expressions from FHIR search params.
 * Maps standard FHIR search param names to DynamoDB attribute names.
 */
export function buildDynamoFilter(
    searchParams: FHIRSearchParams,
    fieldMapping: Record<string, string>
): DynamoFilterResult {
    const conditions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};
    let paramIndex = 0;

    for (const [fhirParam, value] of Object.entries(searchParams)) {
        if (!value || !fieldMapping[fhirParam]) continue;

        const dynamoField = fieldMapping[fhirParam];
        const nameKey = `#f${paramIndex}`;
        const valueKey = `:v${paramIndex}`;

        names[nameKey] = dynamoField;

        if (fhirParam === '_lastUpdated' || fhirParam === 'date') {
            // Date search: support prefixes ge, le, gt, lt, eq
            const strVal = Array.isArray(value) ? value[0] : value;
            const prefix = strVal.substring(0, 2);
            const dateVal = ['ge', 'le', 'gt', 'lt', 'eq'].includes(prefix) ? strVal.substring(2) : strVal;
            values[valueKey] = { S: dateVal };

            const opMap: Record<string, string> = { ge: '>=', le: '<=', gt: '>', lt: '<', eq: '=' };
            const op = opMap[prefix] || '=';
            conditions.push(`${nameKey} ${op} ${valueKey}`);
        } else if (fhirParam.endsWith(':contains')) {
            const baseName = fhirParam.replace(':contains', '');
            if (fieldMapping[baseName]) {
                names[nameKey] = fieldMapping[baseName];
                values[valueKey] = { S: Array.isArray(value) ? value[0] : value };
                conditions.push(`contains(${nameKey}, ${valueKey})`);
            }
        } else {
            values[valueKey] = { S: Array.isArray(value) ? value[0] : value };
            conditions.push(`${nameKey} = ${valueKey}`);
        }
        paramIndex++;
    }

    if (conditions.length === 0) return {};

    return {
        FilterExpression: conditions.join(' AND '),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
    };
}

/**
 * Apply _count and _offset pagination to results.
 */
export function applyPagination(items: any[], query: Record<string, any>): { items: any[]; total: number } {
    const total = items.length;
    const count = Math.min(parseInt(query._count || '50', 10), 1000);
    const offset = parseInt(query._offset || '0', 10);
    return { items: items.slice(offset, offset + count), total };
}

/**
 * Wrap results in a FHIR Bundle (searchset).
 */
export function toSearchBundle(
    resourceType: string,
    items: any[],
    total: number,
    baseUrl: string
): any {
    return {
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        link: [{ relation: 'self', url: `${baseUrl}/${resourceType}` }],
        entry: items.map(item => ({
            fullUrl: `${baseUrl}/${resourceType}/${item.id || item.patientId || item.appointmentId}`,
            resource: item,
            search: { mode: 'match' }
        }))
    };
}
