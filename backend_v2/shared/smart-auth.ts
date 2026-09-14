// The former bridge did not bind authorization scopes or patient context to issued tokens.
// Do not expose launch/token endpoints until a complete SMART authorization service is implemented.
import { Request, Response } from 'express';
import { fhirOutcome } from './fhir-patient';

const unsupportedSmart = (_req: Request, res: Response) =>
    fhirOutcome(res, 501, 'not-supported', 'SMART App Launch is not implemented');
export const registerLaunchContext = unsupportedSmart;
export const smartAuthorize = unsupportedSmart;
export const smartToken = unsupportedSmart;
