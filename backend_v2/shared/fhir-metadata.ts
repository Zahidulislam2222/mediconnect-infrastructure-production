import { Request, Response } from 'express';

export const getCapabilityStatement = (req: Request, res: Response) => {
    const capabilityStatement = {
        resourceType: "CapabilityStatement",
        id: "mediconnect-fhir-server",
        url: "https://api.mediconnect.com/fhir/metadata",
        version: "1.0.0",
        name: "MediConnectFHIRServer",
        title: "MediConnect FHIR R4 Capability Statement",
        status: "active",
        experimental: false,
        date: new Date().toISOString(),
        publisher: "MediConnect Healthcare Platform",
        kind: "instance",
        software: {
            name: "MediConnect",
            version: "2.0.0"
        },
        implementation: {
            description: "MediConnect FHIR R4 Server",
            url: "https://api.mediconnect.com/fhir"
        },
        fhirVersion: "4.0.1",
        format: ["json"],
        rest: [{
            mode: "server",
            security: {
                cors: true,
                service: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/restful-security-service", code: "SMART-on-FHIR" }] }],
                description: "OAuth2 via AWS Cognito, HIPAA/GDPR compliant"
            },
            resource: [
                {
                    type: "Patient",
                    profile: "http://hl7.org/fhir/StructureDefinition/Patient",
                    interaction: [
                        { code: "read" }, { code: "search-type" }, { code: "create" }, { code: "update" }, { code: "delete" }
                    ],
                    searchParam: [
                        { name: "_id", type: "token" },
                        { name: "name", type: "string" },
                        { name: "email", type: "token" },
                        { name: "identifier", type: "token" },
                        { name: "_lastUpdated", type: "date" }
                    ]
                },
                {
                    type: "Practitioner",
                    profile: "http://hl7.org/fhir/StructureDefinition/Practitioner",
                    interaction: [
                        { code: "read" }, { code: "search-type" }, { code: "create" }, { code: "update" }
                    ],
                    searchParam: [
                        { name: "_id", type: "token" },
                        { name: "name", type: "string" },
                        { name: "identifier", type: "token" }
                    ]
                },
                {
                    type: "PractitionerRole",
                    profile: "http://hl7.org/fhir/StructureDefinition/PractitionerRole",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "practitioner", type: "reference" },
                        { name: "specialty", type: "token" }
                    ]
                },
                {
                    type: "Appointment",
                    profile: "http://hl7.org/fhir/StructureDefinition/Appointment",
                    interaction: [
                        { code: "read" }, { code: "search-type" }, { code: "create" }, { code: "update" }
                    ],
                    searchParam: [
                        { name: "_id", type: "token" },
                        { name: "patient", type: "reference" },
                        { name: "practitioner", type: "reference" },
                        { name: "date", type: "date" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "Observation",
                    profile: "http://hl7.org/fhir/StructureDefinition/Observation",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "code", type: "token" },
                        { name: "date", type: "date" },
                        { name: "category", type: "token" }
                    ]
                },
                {
                    type: "MedicationRequest",
                    profile: "http://hl7.org/fhir/StructureDefinition/MedicationRequest",
                    interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "requester", type: "reference" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "DiagnosticReport",
                    profile: "http://hl7.org/fhir/StructureDefinition/DiagnosticReport",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "category", type: "token" },
                        { name: "code", type: "token" }
                    ]
                },
                {
                    type: "RiskAssessment",
                    profile: "http://hl7.org/fhir/StructureDefinition/RiskAssessment",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "performer", type: "reference" }
                    ]
                },
                {
                    type: "Communication",
                    profile: "http://hl7.org/fhir/StructureDefinition/Communication",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "sender", type: "reference" },
                        { name: "recipient", type: "reference" }
                    ]
                },
                {
                    type: "Coverage",
                    profile: "http://hl7.org/fhir/StructureDefinition/Coverage",
                    interaction: [{ code: "read" }],
                    searchParam: [
                        { name: "subscriber", type: "reference" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "Consent",
                    profile: "http://hl7.org/fhir/StructureDefinition/Consent",
                    interaction: [{ code: "read" }, { code: "create" }, { code: "update" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "ClinicalImpression",
                    profile: "http://hl7.org/fhir/StructureDefinition/ClinicalImpression",
                    interaction: [{ code: "read" }, { code: "create" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "assessor", type: "reference" },
                        { name: "status", type: "token" }
                    ]
                },
                {
                    type: "DocumentReference",
                    profile: "http://hl7.org/fhir/StructureDefinition/DocumentReference",
                    interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }],
                    searchParam: [
                        { name: "patient", type: "reference" },
                        { name: "type", type: "token" },
                        { name: "date", type: "date" }
                    ]
                },
                {
                    type: "AuditEvent",
                    profile: "http://hl7.org/fhir/StructureDefinition/AuditEvent",
                    interaction: [{ code: "read" }, { code: "search-type" }],
                    searchParam: [
                        { name: "agent", type: "reference" },
                        { name: "entity", type: "reference" },
                        { name: "date", type: "date" },
                        { name: "action", type: "token" }
                    ]
                }
            ]
        }]
    };

    res.json(capabilityStatement);
};
