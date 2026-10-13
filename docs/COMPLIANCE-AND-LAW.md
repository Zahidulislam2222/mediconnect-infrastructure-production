# Law and service-activation requirements

Reviewed 2026-10-13. MediConnect's intended service scope includes the United States and European Union. Applicable duties depend on the actual operator, customer relationship, location, data and intended clinical use. This document is the engineering compliance map; it does not replace the published terms, privacy notice, contracts or jurisdiction-specific legal review.

## Operating identity and launch decisions

The approved public name is **MediConnect**. Public support: **muhammadzahidulislam2222@gmail.com**. Before activating regulated services, publish the responsible operating entity, business address, applicable governing-law and dispute terms, privacy/controller contact, and required representative or officer details. Those registrations and appointments are not established by the current release evidence.

For each launch jurisdiction, the operator must approve the service model, eligible patient ages/locations, clinician licensing and supervision, consent, prescription rules, emergency handling, accessibility, billing/refunds, record retention and complaint route. US/EU scope does not select one universal law or authorize cross-border clinical practice.

## Applicability and required evidence

| Framework | Applicability decision | Required evidence before relevant activation |
|---|---|---|
| US HIPAA | Determine whether each operator/customer/vendor is a covered entity, business associate or subcontractor | Documented risk analysis, assigned safeguards, workforce controls, applicable BAAs, patient-rights and breach procedures; service-specific vendor eligibility |
| GDPR | Determine controller/processor roles, territorial scope, purposes and lawful bases; health data needs an applicable special-category condition | Processing records, notices, processor contracts, rights workflow, retention/deletion schedule, security measures, required DPIA, officer/representative assessment and lawful international-transfer mechanism |
| US consumer-health and privacy law | Assess FTC coverage and relevant state laws, including Washington health-data and California privacy rules | Data and advertising inventory, required notices/consent, rights processes, vendor restrictions and notification procedure |
| Clinical practice and prescribing | Assess each patient/clinician jurisdiction, service and medication category | Licensing/credential checks, professional responsibility, informed consent, prescribing controls and clinical escalation agreements |
| FDA/device and EU medical-device rules | Assess intended use, claims and function of each clinical or AI feature | Regulatory classification and assessment, required quality/validation/approval pathway, qualified accountable reviewer |
| EU AI Act | Classify the actual AI system/use and operator/provider role; check the current phased obligations | AI inventory, literacy and oversight arrangements, transparency, evaluation, risk and incident records; required conformity work if applicable |
| European Health Data Space | Assess whether the future service/products and data uses fall within phased EHDS requirements | Interoperability, access and secondary-use plan appropriate to the applicable implementation stage |
| Accessibility and consumer protection | Assess applicable US/EU service, procurement and accessibility duties | Published service terms, truthful capability claims, accessible journeys and complaint/remediation process |

Encryption or local hosting alone does not settle these decisions. Under HHS guidance, an applicable cloud service can be a business associate even when it stores only encrypted ePHI without the decryption key. An Article 6 basis alone does not resolve health-data processing under GDPR. Consent must be specific to its actual purpose; a cookie choice is not clinical or AI-processing consent.

## Activation checklist

1. Approve the operator, jurisdictions, intended use and customer/vendor roles.
2. Inventory data, services, subprocessors, regions and cross-border support access.
3. Complete applicable legal agreements and privacy/security risk assessment.
4. Approve clinical responsibility, patient eligibility, emergency and adverse-event handling.
5. Test rights, retention, deletion, incident notification and recovery using controlled data.
6. Review public notices and product claims against the accepted release.
7. Record the approver, evidence, scope and review/expiry date; keep the feature unavailable if a required gate is missing.

## Notices and incidents

Public notices must identify the responsible party, purposes, data categories, recipients, retention criteria, rights, contact and service limits. Terms must accurately describe fees, cancellations, refunds, availability and dispute arrangements. Separate marketing consent from care access where required. Do not promise absolute security, universal legal compliance or clinical accuracy.

For an incident, preserve evidence, establish affected data/persons/jurisdictions and obtain the responsible legal assessment immediately. HIPAA, GDPR, FTC and state notification duties have different triggers, recipients and deadlines. Maintain a current jurisdiction-specific notification matrix; a single generic deadline is insufficient. See [incident operations](OPERATIONS.md).

## Primary references

- [HHS: HIPAA and cloud computing](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html)
- [GDPR official regulation](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
- [FTC Health Breach Notification Rule guidance](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0)
- [Washington Attorney General: consumer health-data protection](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy)
- [California Attorney General: CCPA](https://oag.ca.gov/privacy/ccpa)
- [FDA: clinical decision support software guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software)
- [European Commission: AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [EHDS official regulation](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A32025R0327)

Recheck current law and implementation guidance before launch or a material change. See [privacy](PRIVACY-AND-DATA.md), [security](SECURITY-ARCHITECTURE.md) and [AI governance](AI-GOVERNANCE.md) for implementation requirements.
