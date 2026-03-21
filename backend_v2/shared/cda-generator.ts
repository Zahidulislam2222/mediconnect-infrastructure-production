/**
 * CDA/C-CDA Document Generator
 * Generates CCD (Continuity of Care Document) from FHIR resources
 * Follows HL7 CDA R2 / C-CDA 2.1 specification
 */

import { v4 as uuidv4 } from "uuid";

interface CDAPatient {
    id: string;
    name: string;
    givenName?: string;
    familyName?: string;
    gender?: string;
    birthDate?: string;
    phone?: string;
    email?: string;
    address?: {
        line?: string[];
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
    };
}

interface CDASection {
    title: string;
    code: string;
    codeSystem: string;
    displayName: string;
    entries: any[];
}

interface CDAOptions {
    patient: CDAPatient;
    author?: { name: string; npi?: string; organization?: string };
    custodian?: { name: string; telecom?: string };
    problems?: Array<{ code: string; system: string; display: string; status: string; onset?: string }>;
    medications?: Array<{ name: string; rxcui?: string; dosage?: string; status: string; startDate?: string }>;
    allergies?: Array<{ substance: string; reaction?: string; severity?: string; status: string }>;
    vitals?: Array<{ code: string; display: string; value: number; unit: string; date: string }>;
    procedures?: Array<{ code: string; system: string; display: string; date?: string; status: string }>;
    encounters?: Array<{ type: string; date: string; provider?: string; reason?: string }>;
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function genderCode(gender: string | undefined): { code: string; displayName: string } {
    switch (gender?.toLowerCase()) {
        case "male": return { code: "M", displayName: "Male" };
        case "female": return { code: "F", displayName: "Female" };
        case "other": return { code: "UN", displayName: "Undifferentiated" };
        default: return { code: "UN", displayName: "Unknown" };
    }
}

function formatCDADate(date: string | undefined): string {
    if (!date) return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    return date.replace(/[-:T.Z]/g, "").slice(0, 14);
}

function buildProblemsSection(problems: CDAOptions["problems"]): string {
    if (!problems || problems.length === 0) return "";
    const rows = problems.map(p =>
        `<tr><td>${escapeXml(p.display)}</td><td>${escapeXml(p.status)}</td><td>${p.onset || "Unknown"}</td></tr>`
    ).join("\n");

    const entries = problems.map(p => `
        <entry typeCode="DRIV">
            <act classCode="ACT" moodCode="EVN">
                <templateId root="2.16.840.1.113883.10.20.22.4.3"/>
                <id root="${uuidv4()}"/>
                <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
                <statusCode code="active"/>
                <entryRelationship typeCode="SUBJ">
                    <observation classCode="OBS" moodCode="EVN">
                        <templateId root="2.16.840.1.113883.10.20.22.4.4"/>
                        <id root="${uuidv4()}"/>
                        <code code="55607006" codeSystem="2.16.840.1.113883.6.96" displayName="Problem"/>
                        <statusCode code="completed"/>
                        <value xsi:type="CD" code="${escapeXml(p.code)}" codeSystem="${p.system === "http://snomed.info/sct" ? "2.16.840.1.113883.6.96" : "2.16.840.1.113883.6.3"}" displayName="${escapeXml(p.display)}"/>
                    </observation>
                </entryRelationship>
            </act>
        </entry>`).join("\n");

    return `
    <component>
        <section>
            <templateId root="2.16.840.1.113883.10.20.22.2.5.1"/>
            <code code="11450-4" codeSystem="2.16.840.1.113883.6.1" displayName="Problem List"/>
            <title>Problems</title>
            <text><table border="1"><thead><tr><th>Problem</th><th>Status</th><th>Onset</th></tr></thead><tbody>${rows}</tbody></table></text>
            ${entries}
        </section>
    </component>`;
}

function buildMedicationsSection(medications: CDAOptions["medications"]): string {
    if (!medications || medications.length === 0) return "";
    const rows = medications.map(m =>
        `<tr><td>${escapeXml(m.name)}</td><td>${m.dosage || "N/A"}</td><td>${escapeXml(m.status)}</td><td>${m.startDate || "Unknown"}</td></tr>`
    ).join("\n");

    const entries = medications.map(m => `
        <entry typeCode="DRIV">
            <substanceAdministration classCode="SBADM" moodCode="EVN">
                <templateId root="2.16.840.1.113883.10.20.22.4.16"/>
                <id root="${uuidv4()}"/>
                <statusCode code="${m.status === 'active' ? 'active' : 'completed'}"/>
                <consumable>
                    <manufacturedProduct classCode="MANU">
                        <templateId root="2.16.840.1.113883.10.20.22.4.23"/>
                        <manufacturedMaterial>
                            <code code="${m.rxcui || ''}" codeSystem="2.16.840.1.113883.6.88" displayName="${escapeXml(m.name)}"/>
                        </manufacturedMaterial>
                    </manufacturedProduct>
                </consumable>
            </substanceAdministration>
        </entry>`).join("\n");

    return `
    <component>
        <section>
            <templateId root="2.16.840.1.113883.10.20.22.2.1.1"/>
            <code code="10160-0" codeSystem="2.16.840.1.113883.6.1" displayName="Medications"/>
            <title>Medications</title>
            <text><table border="1"><thead><tr><th>Medication</th><th>Dosage</th><th>Status</th><th>Start Date</th></tr></thead><tbody>${rows}</tbody></table></text>
            ${entries}
        </section>
    </component>`;
}

function buildAllergiesSection(allergies: CDAOptions["allergies"]): string {
    if (!allergies || allergies.length === 0) return "";
    const rows = allergies.map(a =>
        `<tr><td>${escapeXml(a.substance)}</td><td>${a.reaction || "Unknown"}</td><td>${a.severity || "Unknown"}</td><td>${escapeXml(a.status)}</td></tr>`
    ).join("\n");

    const entries = allergies.map(a => `
        <entry typeCode="DRIV">
            <act classCode="ACT" moodCode="EVN">
                <templateId root="2.16.840.1.113883.10.20.22.4.30"/>
                <id root="${uuidv4()}"/>
                <code code="CONC" codeSystem="2.16.840.1.113883.5.6"/>
                <statusCode code="active"/>
                <entryRelationship typeCode="SUBJ">
                    <observation classCode="OBS" moodCode="EVN">
                        <templateId root="2.16.840.1.113883.10.20.22.4.7"/>
                        <id root="${uuidv4()}"/>
                        <code code="ASSERTION" codeSystem="2.16.840.1.113883.5.4"/>
                        <statusCode code="completed"/>
                        <value xsi:type="CD" code="419199007" codeSystem="2.16.840.1.113883.6.96" displayName="Allergy to substance"/>
                        <participant typeCode="CSM">
                            <participantRole classCode="MANU">
                                <playingEntity classCode="MMAT">
                                    <name>${escapeXml(a.substance)}</name>
                                </playingEntity>
                            </participantRole>
                        </participant>
                    </observation>
                </entryRelationship>
            </act>
        </entry>`).join("\n");

    return `
    <component>
        <section>
            <templateId root="2.16.840.1.113883.10.20.22.2.6.1"/>
            <code code="48765-2" codeSystem="2.16.840.1.113883.6.1" displayName="Allergies"/>
            <title>Allergies and Adverse Reactions</title>
            <text><table border="1"><thead><tr><th>Substance</th><th>Reaction</th><th>Severity</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></text>
            ${entries}
        </section>
    </component>`;
}

function buildVitalsSection(vitals: CDAOptions["vitals"]): string {
    if (!vitals || vitals.length === 0) return "";
    const rows = vitals.map(v =>
        `<tr><td>${escapeXml(v.display)}</td><td>${v.value} ${v.unit}</td><td>${v.date}</td></tr>`
    ).join("\n");

    return `
    <component>
        <section>
            <templateId root="2.16.840.1.113883.10.20.22.2.4.1"/>
            <code code="8716-3" codeSystem="2.16.840.1.113883.6.1" displayName="Vital Signs"/>
            <title>Vital Signs</title>
            <text><table border="1"><thead><tr><th>Vital Sign</th><th>Value</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></text>
        </section>
    </component>`;
}

function buildProceduresSection(procedures: CDAOptions["procedures"]): string {
    if (!procedures || procedures.length === 0) return "";
    const rows = procedures.map(p =>
        `<tr><td>${escapeXml(p.display)}</td><td>${p.date || "Unknown"}</td><td>${escapeXml(p.status)}</td></tr>`
    ).join("\n");

    return `
    <component>
        <section>
            <templateId root="2.16.840.1.113883.10.20.22.2.7.1"/>
            <code code="47519-4" codeSystem="2.16.840.1.113883.6.1" displayName="Procedures"/>
            <title>Procedures</title>
            <text><table border="1"><thead><tr><th>Procedure</th><th>Date</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></text>
        </section>
    </component>`;
}

function buildEncountersSection(encounters: CDAOptions["encounters"]): string {
    if (!encounters || encounters.length === 0) return "";
    const rows = encounters.map(e =>
        `<tr><td>${escapeXml(e.type)}</td><td>${e.date}</td><td>${e.provider || "N/A"}</td><td>${e.reason || "N/A"}</td></tr>`
    ).join("\n");

    return `
    <component>
        <section>
            <templateId root="2.16.840.1.113883.10.20.22.2.22.1"/>
            <code code="46240-8" codeSystem="2.16.840.1.113883.6.1" displayName="Encounters"/>
            <title>Encounters</title>
            <text><table border="1"><thead><tr><th>Type</th><th>Date</th><th>Provider</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table></text>
        </section>
    </component>`;
}

/**
 * Generate a C-CDA 2.1 Continuity of Care Document (CCD)
 * Returns valid XML string
 */
export function generateCCD(options: CDAOptions): string {
    const { patient, author, custodian } = options;
    const docId = uuidv4();
    const now = formatCDADate(new Date().toISOString());
    const g = genderCode(patient.gender);
    const givenName = patient.givenName || patient.name.split(" ")[0] || "";
    const familyName = patient.familyName || patient.name.split(" ").slice(1).join(" ") || patient.name;

    return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="CDA.xsl"?>
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:voc="urn:hl7-org:v3/voc" xmlns:sdtc="urn:hl7-org:sdtc">
    <!-- C-CDA 2.1 CCD Template -->
    <realmCode code="US"/>
    <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
    <templateId root="2.16.840.1.113883.10.20.22.1.1" extension="2015-08-01"/>
    <templateId root="2.16.840.1.113883.10.20.22.1.2" extension="2015-08-01"/>
    <id root="${docId}"/>
    <code code="34133-9" codeSystem="2.16.840.1.113883.6.1" codeSystemName="LOINC" displayName="Summarization of Episode Note"/>
    <title>Continuity of Care Document — MediConnect</title>
    <effectiveTime value="${now}"/>
    <confidentialityCode code="N" codeSystem="2.16.840.1.113883.5.25"/>
    <languageCode code="en-US"/>

    <!-- Patient -->
    <recordTarget>
        <patientRole>
            <id root="2.16.840.1.113883.19" extension="${escapeXml(patient.id)}"/>
            ${patient.phone ? `<telecom use="HP" value="tel:${escapeXml(patient.phone)}"/>` : ""}
            ${patient.email ? `<telecom use="HP" value="mailto:${escapeXml(patient.email)}"/>` : ""}
            ${patient.address ? `
            <addr use="HP">
                ${(patient.address.line || []).map(l => `<streetAddressLine>${escapeXml(l)}</streetAddressLine>`).join("")}
                <city>${escapeXml(patient.address.city || "")}</city>
                <state>${escapeXml(patient.address.state || "")}</state>
                <postalCode>${escapeXml(patient.address.postalCode || "")}</postalCode>
                <country>${escapeXml(patient.address.country || "US")}</country>
            </addr>` : ""}
            <patient>
                <name>
                    <given>${escapeXml(givenName)}</given>
                    <family>${escapeXml(familyName)}</family>
                </name>
                <administrativeGenderCode code="${g.code}" codeSystem="2.16.840.1.113883.5.1" displayName="${g.displayName}"/>
                ${patient.birthDate ? `<birthTime value="${formatCDADate(patient.birthDate)}"/>` : ""}
            </patient>
        </patientRole>
    </recordTarget>

    <!-- Author -->
    <author>
        <time value="${now}"/>
        <assignedAuthor>
            <id root="2.16.840.1.113883.19" extension="${author?.npi || 'system'}"/>
            <assignedPerson>
                <name>${escapeXml(author?.name || "MediConnect System")}</name>
            </assignedPerson>
            ${author?.organization ? `
            <representedOrganization>
                <name>${escapeXml(author.organization)}</name>
            </representedOrganization>` : ""}
        </assignedAuthor>
    </author>

    <!-- Custodian -->
    <custodian>
        <assignedCustodian>
            <representedCustodianOrganization>
                <id root="2.16.840.1.113883.19"/>
                <name>${escapeXml(custodian?.name || "MediConnect Healthcare Platform")}</name>
            </representedCustodianOrganization>
        </assignedCustodian>
    </custodian>

    <!-- Document Body -->
    <component>
        <structuredBody>
            ${buildProblemsSection(options.problems)}
            ${buildMedicationsSection(options.medications)}
            ${buildAllergiesSection(options.allergies)}
            ${buildVitalsSection(options.vitals)}
            ${buildProceduresSection(options.procedures)}
            ${buildEncountersSection(options.encounters)}
        </structuredBody>
    </component>
</ClinicalDocument>`;
}
