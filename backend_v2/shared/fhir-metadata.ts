import { Request, Response } from 'express';
import { setting } from './settings';
import { fhirOutcome } from './fhir-patient';

export const getCapabilityStatement = (_req: Request, res: Response) => {
    const base = setting('FHIR_BASE_URL').replace(/\/$/, '');
    return res.type('application/fhir+json').json({
        resourceType: 'CapabilityStatement', id: 'mediconnect-fhir-server',
        url: `${base}/metadata`, status: 'draft', experimental: true,
        date: new Date().toISOString(), kind: 'instance',
        implementation: { description: 'Patient-owned FHIR read interface', url: base },
        fhirVersion: '4.0.1', format: ['application/fhir+json'],
        rest: [{ mode: 'server',
            security: { description: 'Regional Cognito authentication; verified patient ownership is required. SMART App Launch is not implemented.' },
            resource: [{ type: 'Patient', interaction: [{ code: 'read' }] }],
        }],
    });
};

export const getSmartConfiguration = (_req: Request, res: Response) =>
    fhirOutcome(res, 501, 'not-supported', 'SMART App Launch is not implemented');
export const getSmartLaunchContext = getSmartConfiguration;
