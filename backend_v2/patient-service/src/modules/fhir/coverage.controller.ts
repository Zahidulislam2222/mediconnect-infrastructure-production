import { Request, Response } from 'express';
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';
import { safeError } from '../../../../shared/logger';

// =============================================================================
// FHIR R4 Coverage Resource (Insurance / Coverage)
// =============================================================================
// Maps patient insurance data to the FHIR Coverage resource format declared in
// the CapabilityStatement. Supports `read` interaction (by patient ID).
// =============================================================================

const PATIENT_TABLE = process.env.DYNAMO_TABLE || 'mediconnect-patients';

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || 'us-east-1');
};

/**
 * GET /me/coverage
 * Returns the authenticated patient's insurance/coverage data as a FHIR
 * Coverage resource. If no insurance is on file, returns a self-pay Coverage.
 */
export const getCoverage = async (req: Request, res: Response) => {
    try {
        const region = extractRegion(req);
        const dynamicDb = getRegionalClient(region);
        const patientId = (req as any).user?.id;

        if (!patientId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const response = await dynamicDb.send(new GetCommand({
            TableName: PATIENT_TABLE,
            Key: { patientId },
            ProjectionExpression: 'patientId, #n, insurance, email',
            ExpressionAttributeNames: { '#n': 'name' }
        }));

        if (!response.Item) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        const patient = response.Item;
        const insurance = patient.insurance || {};

        // Build FHIR R4 Coverage resource
        const fhirCoverage = {
            resourceType: "Coverage",
            id: `coverage-${patientId}`,
            status: insurance.planId ? "active" : "draft",
            type: {
                coding: [{
                    system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                    code: insurance.planId ? "EHCPOL" : "pay",
                    display: insurance.planId ? "Extended Healthcare" : "Self-pay"
                }]
            },
            subscriber: { reference: `Patient/${patientId}` },
            beneficiary: { reference: `Patient/${patientId}` },
            relationship: {
                coding: [{
                    system: "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
                    code: "self",
                    display: "Self"
                }]
            },
            period: {
                start: insurance.effectiveDate || new Date().toISOString().split('T')[0]
            },
            payor: insurance.provider
                ? [{ display: insurance.provider }]
                : [{ display: "Self-pay" }],
            class: insurance.planId
                ? [{
                    type: {
                        coding: [{
                            system: "http://terminology.hl7.org/CodeSystem/coverage-class",
                            code: "plan"
                        }]
                    },
                    value: insurance.planId,
                    name: insurance.planName || insurance.planId
                }]
                : []
        };

        await writeAuditLog(patientId, patientId, 'READ_COVERAGE', 'Patient viewed coverage/insurance data', {
            region,
            ipAddress: req.ip
        });

        return res.json({
            coverage: insurance,
            fhirResource: fhirCoverage
        });
    } catch (error: any) {
        safeError('[Coverage] GET failed:', error);
        return res.status(500).json({ error: 'Failed to retrieve coverage data' });
    }
};
