// ─── FEATURE #16: US Core FHIR Profiles ────────────────────────────────────
// US Core Implementation Guide validators for FHIR R4 resources.
// Validates required fields per US Core 6.1 profiles.
// Used across services to ensure FHIR resources meet US Core constraints.
// ────────────────────────────────────────────────────────────────────────────

// ─── US Core Profile URLs ──────────────────────────────────────────────────

export const US_CORE_PROFILES = {
    Patient: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
    Practitioner: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-practitioner',
    Organization: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-organization',
    Encounter: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter',
    Condition: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns',
    AllergyIntolerance: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance',
    Medication: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-medication',
    MedicationRequest: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest',
    Observation: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab',
    ObservationVitals: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-vital-signs',
    DiagnosticReport: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab',
    Immunization: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-immunization',
    Procedure: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-procedure',
    CarePlan: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-careplan',
    DocumentReference: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-documentreference',
    ServiceRequest: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-servicerequest',
    Coverage: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-coverage',
    Goal: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-goal',
} as const;

// ─── Validation Result Type ────────────────────────────────────────────────

export interface ValidationResult {
    valid: boolean;
    profile: string;
    errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }>;
    warnings: Array<{ path: string; message: string }>;
}

function makeResult(profile: string): ValidationResult {
    return { valid: true, profile, errors: [], warnings: [] };
}

function addError(result: ValidationResult, path: string, message: string) {
    result.errors.push({ path, message, severity: 'error' });
    result.valid = false;
}

function addWarning(result: ValidationResult, path: string, message: string) {
    result.warnings.push({ path, message });
}

function hasCodeableConcept(obj: any): boolean {
    return obj && (obj.coding?.length > 0 || obj.text);
}

function hasCoding(obj: any, system?: string): boolean {
    if (!obj?.coding || !Array.isArray(obj.coding)) return false;
    if (!system) return obj.coding.length > 0;
    return obj.coding.some((c: any) => c.system === system);
}

// ─── US Core Patient ───────────────────────────────────────────────────────
// Required: identifier, name, gender
// Must Support: birthDate, address, telecom, communication, race, ethnicity

export function validateUSCorePatient(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Patient);

    if (resource.resourceType !== 'Patient') {
        addError(result, 'resourceType', 'Must be Patient');
        return result;
    }

    // identifier (1..*)
    if (!resource.identifier || !Array.isArray(resource.identifier) || resource.identifier.length === 0) {
        addError(result, 'identifier', 'US Core Patient requires at least one identifier');
    }

    // name (1..*)
    if (!resource.name || !Array.isArray(resource.name) || resource.name.length === 0) {
        addError(result, 'name', 'US Core Patient requires at least one name');
    } else {
        const name = resource.name[0];
        if (!name.family) addError(result, 'name[0].family', 'Family name is required');
    }

    // gender (1..1)
    if (!resource.gender) {
        addError(result, 'gender', 'Gender is required');
    } else {
        const validGenders = ['male', 'female', 'other', 'unknown'];
        if (!validGenders.includes(resource.gender)) {
            addError(result, 'gender', `Invalid gender: ${resource.gender}`);
        }
    }

    // Must-support warnings
    if (!resource.birthDate) addWarning(result, 'birthDate', 'birthDate is Must Support in US Core');
    if (!resource.address || resource.address.length === 0) addWarning(result, 'address', 'address is Must Support');
    if (!resource.telecom || resource.telecom.length === 0) addWarning(result, 'telecom', 'telecom is Must Support');

    // US Core race/ethnicity extensions
    const extensions = resource.extension || [];
    const hasRace = extensions.some((e: any) => e.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race');
    const hasEthnicity = extensions.some((e: any) => e.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity');
    if (!hasRace) addWarning(result, 'extension(race)', 'US Core Race extension is Must Support');
    if (!hasEthnicity) addWarning(result, 'extension(ethnicity)', 'US Core Ethnicity extension is Must Support');

    return result;
}

// ─── US Core Practitioner ──────────────────────────────────────────────────
// Required: identifier (NPI), name

export function validateUSCorePractitioner(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Practitioner);

    if (resource.resourceType !== 'Practitioner') {
        addError(result, 'resourceType', 'Must be Practitioner');
        return result;
    }

    // identifier with NPI (1..*)
    if (!resource.identifier || resource.identifier.length === 0) {
        addError(result, 'identifier', 'US Core Practitioner requires at least one identifier');
    } else {
        const hasNPI = resource.identifier.some((id: any) =>
            id.system === 'http://hl7.org/fhir/sid/us-npi'
        );
        if (!hasNPI) addWarning(result, 'identifier', 'NPI identifier (http://hl7.org/fhir/sid/us-npi) is recommended');
    }

    // name (1..*)
    if (!resource.name || resource.name.length === 0) {
        addError(result, 'name', 'Name is required');
    } else {
        if (!resource.name[0].family) addError(result, 'name[0].family', 'Family name is required');
    }

    return result;
}

// ─── US Core Encounter ─────────────────────────────────────────────────────
// Required: identifier, status, class, type, subject, period

export function validateUSCoreEncounter(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Encounter);

    if (resource.resourceType !== 'Encounter') {
        addError(result, 'resourceType', 'Must be Encounter');
        return result;
    }

    if (!resource.status) addError(result, 'status', 'Status is required');
    if (!resource.class) addError(result, 'class', 'Class is required');
    if (!resource.type || !Array.isArray(resource.type) || resource.type.length === 0) {
        addError(result, 'type', 'At least one type is required');
    }
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');
    if (!resource.period?.start) addWarning(result, 'period.start', 'Period start is Must Support');

    return result;
}

// ─── US Core Condition ─────────────────────────────────────────────────────
// Required: clinicalStatus, verificationStatus, category, code, subject

export function validateUSCoreCondition(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Condition);

    if (resource.resourceType !== 'Condition') {
        addError(result, 'resourceType', 'Must be Condition');
        return result;
    }

    if (!hasCodeableConcept(resource.clinicalStatus)) addError(result, 'clinicalStatus', 'Clinical status is required');
    if (!hasCodeableConcept(resource.verificationStatus)) addError(result, 'verificationStatus', 'Verification status is required');
    if (!resource.category || resource.category.length === 0) addError(result, 'category', 'Category is required');
    if (!hasCodeableConcept(resource.code)) addError(result, 'code', 'Code is required');
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');

    return result;
}

// ─── US Core AllergyIntolerance ────────────────────────────────────────────
// Required: clinicalStatus, verificationStatus, code, patient

export function validateUSCoreAllergyIntolerance(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.AllergyIntolerance);

    if (resource.resourceType !== 'AllergyIntolerance') {
        addError(result, 'resourceType', 'Must be AllergyIntolerance');
        return result;
    }

    if (!hasCodeableConcept(resource.clinicalStatus)) addError(result, 'clinicalStatus', 'Clinical status is required');
    if (!hasCodeableConcept(resource.verificationStatus)) addError(result, 'verificationStatus', 'Verification status is required');
    if (!hasCodeableConcept(resource.code)) addError(result, 'code', 'Code is required');
    if (!resource.patient?.reference) addError(result, 'patient', 'Patient reference is required');

    return result;
}

// ─── US Core Observation (Lab) ─────────────────────────────────────────────
// Required: status, category (laboratory), code, subject

export function validateUSCoreObservationLab(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Observation);

    if (resource.resourceType !== 'Observation') {
        addError(result, 'resourceType', 'Must be Observation');
        return result;
    }

    if (!resource.status) addError(result, 'status', 'Status is required');
    if (!resource.category || resource.category.length === 0) {
        addError(result, 'category', 'Category is required');
    } else {
        const hasLab = resource.category.some((cat: any) =>
            hasCoding(cat, 'http://terminology.hl7.org/CodeSystem/observation-category')
        );
        if (!hasLab) addWarning(result, 'category', 'Should include observation-category coding');
    }

    if (!hasCodeableConcept(resource.code)) addError(result, 'code', 'Code is required (LOINC recommended)');
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');

    // Value[x] warning
    if (!resource.valueQuantity && !resource.valueCodeableConcept && !resource.valueString && !resource.dataAbsentReason) {
        addWarning(result, 'value[x]', 'Value or dataAbsentReason should be present');
    }

    return result;
}

// ─── US Core Immunization ──────────────────────────────────────────────────
// Required: status, vaccineCode (CVX), patient, occurrence

export function validateUSCoreImmunization(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Immunization);

    if (resource.resourceType !== 'Immunization') {
        addError(result, 'resourceType', 'Must be Immunization');
        return result;
    }

    if (!resource.status) addError(result, 'status', 'Status is required');
    if (!hasCodeableConcept(resource.vaccineCode)) {
        addError(result, 'vaccineCode', 'Vaccine code is required');
    } else {
        if (!hasCoding(resource.vaccineCode, 'http://hl7.org/fhir/sid/cvx')) {
            addWarning(result, 'vaccineCode', 'CVX coding (http://hl7.org/fhir/sid/cvx) is required');
        }
    }
    if (!resource.patient?.reference) addError(result, 'patient', 'Patient reference is required');
    if (!resource.occurrenceDateTime && !resource.occurrenceString) {
        addError(result, 'occurrence', 'Occurrence date is required');
    }

    return result;
}

// ─── US Core MedicationRequest ─────────────────────────────────────────────
// Required: status, intent, medication[x], subject, authoredOn, requester

export function validateUSCoreMedicationRequest(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.MedicationRequest);

    if (resource.resourceType !== 'MedicationRequest') {
        addError(result, 'resourceType', 'Must be MedicationRequest');
        return result;
    }

    if (!resource.status) addError(result, 'status', 'Status is required');
    if (!resource.intent) addError(result, 'intent', 'Intent is required');
    if (!resource.medicationCodeableConcept && !resource.medicationReference) {
        addError(result, 'medication', 'Medication code or reference is required');
    }
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');
    if (!resource.authoredOn) addWarning(result, 'authoredOn', 'authoredOn is Must Support');
    if (!resource.requester?.reference) addWarning(result, 'requester', 'requester is Must Support');

    return result;
}

// ─── US Core DiagnosticReport (Lab) ────────────────────────────────────────
// Required: status, category, code, subject, effective, issued

export function validateUSCoreDiagnosticReport(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.DiagnosticReport);

    if (resource.resourceType !== 'DiagnosticReport') {
        addError(result, 'resourceType', 'Must be DiagnosticReport');
        return result;
    }

    if (!resource.status) addError(result, 'status', 'Status is required');
    if (!resource.category || resource.category.length === 0) addError(result, 'category', 'Category is required');
    if (!hasCodeableConcept(resource.code)) addError(result, 'code', 'Code is required');
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');
    if (!resource.effectiveDateTime && !resource.effectivePeriod) addWarning(result, 'effective', 'effective is Must Support');
    if (!resource.issued) addWarning(result, 'issued', 'issued is Must Support');

    return result;
}

// ─── US Core Procedure ─────────────────────────────────────────────────────
// Required: status, code, subject, performed

export function validateUSCoreProcedure(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Procedure);

    if (resource.resourceType !== 'Procedure') {
        addError(result, 'resourceType', 'Must be Procedure');
        return result;
    }

    if (!resource.status) addError(result, 'status', 'Status is required');
    if (!hasCodeableConcept(resource.code)) addError(result, 'code', 'Code is required');
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');
    if (!resource.performedDateTime && !resource.performedPeriod) {
        addWarning(result, 'performed', 'performed is Must Support');
    }

    return result;
}

// ─── US Core CarePlan ─────────────────────────────────────────────────────
// Required: status, intent, category (assess-plan), subject
// Gap #4 FIX: Added to enable write-path validation for care plans.

export function validateUSCoreCarePlan(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.CarePlan);

    if (resource.resourceType !== 'CarePlan') {
        addError(result, 'resourceType', 'Must be CarePlan');
        return result;
    }

    if (!resource.status) addError(result, 'status', 'Status is required');
    if (!resource.intent) addError(result, 'intent', 'Intent is required');
    if (!resource.category || resource.category.length === 0) {
        addError(result, 'category', 'Category is required (assess-plan recommended)');
    }
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');

    // Must-support
    if (!resource.title) addWarning(result, 'title', 'title is Must Support in US Core CarePlan');
    if (!resource.period?.start) addWarning(result, 'period.start', 'period.start is Must Support');

    return result;
}

// ─── US Core Goal ─────────────────────────────────────────────────────────
// Required: lifecycleStatus, description, subject

export function validateUSCoreGoal(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Goal);

    if (resource.resourceType !== 'Goal') {
        addError(result, 'resourceType', 'Must be Goal');
        return result;
    }

    if (!resource.lifecycleStatus) addError(result, 'lifecycleStatus', 'lifecycleStatus is required');
    if (!resource.description?.text && !hasCodeableConcept(resource.description)) {
        addError(result, 'description', 'description is required');
    }
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');

    // Must-support
    if (!resource.target || resource.target.length === 0) addWarning(result, 'target', 'target is Must Support');

    return result;
}

// ─── US Core Organization ────────────────────────────────────────────────
// Required: name, active, identifier (with system + value)
// Must Support: telecom, address, type

export function validateUSCoreOrganization(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Organization);

    if (resource.resourceType !== 'Organization') {
        addError(result, 'resourceType', 'Must be Organization');
        return result;
    }

    // name (1..1)
    if (!resource.name) addError(result, 'name', 'Organization name is required');

    // active (1..1)
    if (resource.active === undefined || resource.active === null) {
        addError(result, 'active', 'Active status is required');
    } else if (typeof resource.active !== 'boolean') {
        addError(result, 'active', 'Active must be a boolean');
    }

    // identifier (1..*)
    if (!resource.identifier || !Array.isArray(resource.identifier) || resource.identifier.length === 0) {
        addError(result, 'identifier', 'US Core Organization requires at least one identifier');
    } else {
        const hasValid = resource.identifier.some((id: any) => id.system && id.value);
        if (!hasValid) addError(result, 'identifier', 'Identifier must include system and value');
    }

    // Must-support warnings
    if (!resource.telecom || resource.telecom.length === 0) addWarning(result, 'telecom', 'telecom is Must Support');
    if (!resource.address || resource.address.length === 0) addWarning(result, 'address', 'address is Must Support');
    if (!resource.type || resource.type.length === 0) addWarning(result, 'type', 'type is Must Support');

    return result;
}

// ─── US Core Medication ─────────────────────────────────────────────────
// Required: code (with coding containing system + code)
// Must Support: status, manufacturer, form

export function validateUSCoreMedication(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Medication);

    if (resource.resourceType !== 'Medication') {
        addError(result, 'resourceType', 'Must be Medication');
        return result;
    }

    // code (1..1) with coding
    if (!resource.code) {
        addError(result, 'code', 'Code is required');
    } else if (!resource.code.coding || !Array.isArray(resource.code.coding) || resource.code.coding.length === 0) {
        addError(result, 'code.coding', 'Code must include at least one coding entry');
    } else {
        const hasValid = resource.code.coding.some((c: any) => c.system && c.code);
        if (!hasValid) addError(result, 'code.coding', 'Coding must include system and code');
    }

    // Must-support warnings
    if (!resource.status) addWarning(result, 'status', 'status is Must Support');
    if (!resource.manufacturer) addWarning(result, 'manufacturer', 'manufacturer is Must Support');
    if (!resource.form) addWarning(result, 'form', 'form is Must Support');

    return result;
}

// ─── US Core Observation (Vital Signs) ──────────────────────────────────
// Required: status, category (vital-signs), code (LOINC), subject, effective[x]
// Must Support: value[x], dataAbsentReason

export function validateUSCoreObservationVitals(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.ObservationVitals);

    if (resource.resourceType !== 'Observation') {
        addError(result, 'resourceType', 'Must be Observation');
        return result;
    }

    // status (1..1)
    if (!resource.status) addError(result, 'status', 'Status is required');

    // category (1..*) must include vital-signs
    if (!resource.category || !Array.isArray(resource.category) || resource.category.length === 0) {
        addError(result, 'category', 'Category is required');
    } else {
        const hasVitalSigns = resource.category.some((cat: any) =>
            cat.coding?.some((c: any) =>
                c.system === 'http://terminology.hl7.org/CodeSystem/observation-category' && c.code === 'vital-signs'
            )
        );
        if (!hasVitalSigns) addError(result, 'category', 'Category must include vital-signs code');
    }

    // code (1..1) LOINC
    if (!hasCodeableConcept(resource.code)) addError(result, 'code', 'Code is required (LOINC recommended)');

    // subject (1..1)
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');

    // effective[x] (1..1)
    if (!resource.effectiveDateTime && !resource.effectivePeriod) {
        addError(result, 'effective', 'effectiveDateTime or effectivePeriod is required');
    }

    // Must-support: value[x] or dataAbsentReason
    if (!resource.valueQuantity && !resource.valueCodeableConcept && !resource.valueString) {
        if (!resource.dataAbsentReason) {
            addWarning(result, 'value[x]', 'Value or dataAbsentReason should be present');
        }
    } else if (resource.valueQuantity) {
        if (!resource.valueQuantity.unit) addWarning(result, 'valueQuantity.unit', 'unit is Must Support');
        if (!resource.valueQuantity.system) addWarning(result, 'valueQuantity.system', 'system is Must Support');
        if (!resource.valueQuantity.code) addWarning(result, 'valueQuantity.code', 'code is Must Support');
    }

    return result;
}

// ─── US Core DocumentReference ──────────────────────────────────────────
// Required: status, type (with coding), category, subject, date, content (attachment with contentType)
// Must Support: author, description, context

export function validateUSCoreDocumentReference(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.DocumentReference);

    if (resource.resourceType !== 'DocumentReference') {
        addError(result, 'resourceType', 'Must be DocumentReference');
        return result;
    }

    // status (1..1)
    if (!resource.status) addError(result, 'status', 'Status is required');

    // type (1..1) with coding
    if (!hasCodeableConcept(resource.type)) addError(result, 'type', 'Type is required');

    // category (1..*)
    if (!resource.category || !Array.isArray(resource.category) || resource.category.length === 0) {
        addError(result, 'category', 'Category is required');
    }

    // subject (1..1)
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');

    // date (1..1)
    if (!resource.date) addError(result, 'date', 'Date is required');

    // content (1..*) with attachment.contentType
    if (!resource.content || !Array.isArray(resource.content) || resource.content.length === 0) {
        addError(result, 'content', 'At least one content entry is required');
    } else {
        const hasAttachment = resource.content.some((c: any) => c.attachment?.contentType);
        if (!hasAttachment) addError(result, 'content.attachment', 'Content must include attachment with contentType');
    }

    // Must-support warnings
    if (!resource.author || resource.author.length === 0) addWarning(result, 'author', 'author is Must Support');
    if (!resource.description) addWarning(result, 'description', 'description is Must Support');
    if (!resource.context) addWarning(result, 'context', 'context is Must Support');

    return result;
}

// ─── US Core ServiceRequest ─────────────────────────────────────────────
// Required: status, intent, code (with coding), subject, authoredOn
// Must Support: requester, performer, reasonCode, priority

export function validateUSCoreServiceRequest(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.ServiceRequest);

    if (resource.resourceType !== 'ServiceRequest') {
        addError(result, 'resourceType', 'Must be ServiceRequest');
        return result;
    }

    // status (1..1)
    if (!resource.status) addError(result, 'status', 'Status is required');

    // intent (1..1)
    if (!resource.intent) addError(result, 'intent', 'Intent is required');

    // code (1..1) with coding
    if (!hasCodeableConcept(resource.code)) addError(result, 'code', 'Code is required');

    // subject (1..1)
    if (!resource.subject?.reference) addError(result, 'subject', 'Subject reference is required');

    // authoredOn (1..1)
    if (!resource.authoredOn) addError(result, 'authoredOn', 'authoredOn is required');

    // Must-support warnings
    if (!resource.requester?.reference) addWarning(result, 'requester', 'requester is Must Support');
    if (!resource.performer || resource.performer.length === 0) addWarning(result, 'performer', 'performer is Must Support');
    if (!resource.reasonCode || resource.reasonCode.length === 0) addWarning(result, 'reasonCode', 'reasonCode is Must Support');
    if (!resource.priority) addWarning(result, 'priority', 'priority is Must Support');

    return result;
}

// ─── US Core Coverage ───────────────────────────────────────────────────
// Required: status, beneficiary, payor
// Must Support: subscriberId, type, relationship, period, class

export function validateUSCoreCoverage(resource: any): ValidationResult {
    const result = makeResult(US_CORE_PROFILES.Coverage);

    if (resource.resourceType !== 'Coverage') {
        addError(result, 'resourceType', 'Must be Coverage');
        return result;
    }

    // status (1..1)
    if (!resource.status) addError(result, 'status', 'Status is required');

    // beneficiary (1..1)
    if (!resource.beneficiary?.reference) addError(result, 'beneficiary', 'Beneficiary reference is required');

    // payor (1..*)
    if (!resource.payor || !Array.isArray(resource.payor) || resource.payor.length === 0) {
        addError(result, 'payor', 'At least one payor is required');
    }

    // Must-support warnings
    if (!resource.subscriberId) addWarning(result, 'subscriberId', 'subscriberId is Must Support');
    if (!hasCodeableConcept(resource.type)) addWarning(result, 'type', 'type is Must Support');
    if (!hasCodeableConcept(resource.relationship)) addWarning(result, 'relationship', 'relationship is Must Support');
    if (!resource.period) addWarning(result, 'period', 'period is Must Support');
    if (!resource.class || resource.class.length === 0) addWarning(result, 'class', 'class (plan info) is Must Support');

    return result;
}

// ─── Generic Validator Dispatcher ──────────────────────────────────────────

const VALIDATORS: Record<string, (resource: any) => ValidationResult> = {
    Patient: validateUSCorePatient,
    Practitioner: validateUSCorePractitioner,
    Organization: validateUSCoreOrganization,
    Encounter: validateUSCoreEncounter,
    Condition: validateUSCoreCondition,
    AllergyIntolerance: validateUSCoreAllergyIntolerance,
    Medication: validateUSCoreMedication,
    Observation: validateUSCoreObservationLab,
    ObservationVitals: validateUSCoreObservationVitals,
    Immunization: validateUSCoreImmunization,
    MedicationRequest: validateUSCoreMedicationRequest,
    DiagnosticReport: validateUSCoreDiagnosticReport,
    Procedure: validateUSCoreProcedure,
    CarePlan: validateUSCoreCarePlan,
    Goal: validateUSCoreGoal,
    DocumentReference: validateUSCoreDocumentReference,
    ServiceRequest: validateUSCoreServiceRequest,
    Coverage: validateUSCoreCoverage,
};

/**
 * Validate a FHIR resource against its US Core profile.
 * Returns { valid, profile, errors, warnings }.
 */
export function validateUSCore(resource: any): ValidationResult {
    if (!resource?.resourceType) {
        return {
            valid: false,
            profile: 'unknown',
            errors: [{ path: 'resourceType', message: 'resourceType is required', severity: 'error' }],
            warnings: []
        };
    }

    const validator = VALIDATORS[resource.resourceType];
    if (!validator) {
        return {
            valid: true,
            profile: 'none',
            errors: [],
            warnings: [{ path: 'resourceType', message: `No US Core profile validator for ${resource.resourceType}` }]
        };
    }

    const result = validator(resource);

    // Add meta.profile if valid
    if (result.valid) {
        const profileUrl = (US_CORE_PROFILES as any)[resource.resourceType];
        if (profileUrl && (!resource.meta?.profile || !resource.meta.profile.includes(profileUrl))) {
            addWarning(result, 'meta.profile', `Should include profile URL: ${profileUrl}`);
        }
    }

    return result;
}

/** Get list of supported US Core profiles with their validation requirements. */
export function getSupportedProfiles(): Array<{ resourceType: string; profile: string; hasValidator: boolean }> {
    return Object.entries(US_CORE_PROFILES).map(([resourceType, profile]) => ({
        resourceType,
        profile,
        hasValidator: !!VALIDATORS[resourceType],
    }));
}

/** Add US Core meta.profile to a resource if not already present. */
export function addUSCoreProfile(resource: any): any {
    if (!resource?.resourceType) return resource;

    const profileUrl = (US_CORE_PROFILES as any)[resource.resourceType];
    if (!profileUrl) return resource;

    if (!resource.meta) resource.meta = {};
    if (!resource.meta.profile) resource.meta.profile = [];

    if (!resource.meta.profile.includes(profileUrl)) {
        resource.meta.profile.push(profileUrl);
    }

    return resource;
}
