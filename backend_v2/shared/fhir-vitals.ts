import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// Stable terminology and unit identifiers, not provider endpoints or adjustable thresholds.
const OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const MEASUREMENTS = [
  { field: 'heartRate', code: '8867-4', display: 'Heart rate', unit: 'beats/minute', unitCode: '/min' },
  { field: 'temperature', code: '8310-5', display: 'Body temperature', unit: 'degrees Celsius', unitCode: 'Cel' },
  { field: 'oxygenSaturation', code: '2708-6', display: 'Oxygen saturation', unit: '%', unitCode: '%' },
] as const;

export function mapVitalObservations(patientId: string, items: Record<string, unknown>[]) {
  return items.flatMap(item => {
    const time = z.string().datetime({ offset: true }).safeParse(item.timestamp ?? item.createdAt);
    return MEASUREMENTS.flatMap(measurement => {
      const value = item[measurement.field];
      if (typeof value !== 'number' || !Number.isFinite(value)) return [];
      const id = uuidv4();
      return [{
        fullUrl: `urn:uuid:${id}`,
        resource: {
          resourceType: 'Observation', id, status: 'preliminary',
          category: [{ coding: [{ system: OBSERVATION_CATEGORY, code: 'vital-signs' }] }],
          code: { coding: [{ system: LOINC, code: measurement.code, display: measurement.display }] },
          subject: { reference: `Patient/${patientId}` },
          ...(time.success ? { effectiveDateTime: time.data } : {}),
          valueQuantity: { value, unit: measurement.unit, system: UCUM, code: measurement.unitCode },
        },
      }];
    });
  });
}
