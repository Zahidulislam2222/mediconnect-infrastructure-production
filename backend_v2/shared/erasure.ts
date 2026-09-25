/**
 * Value the patient-service erasure workflow writes over identifying fields (for example a prescription's patientName
 * and a bill's patientId). Services that must recognise erased records compare against this definition; the erasure
 * workflow in patient-service still writes the literal and should move to this constant.
 */
export const ERASED_MARKER = 'ANONYMIZED_GDPR';
