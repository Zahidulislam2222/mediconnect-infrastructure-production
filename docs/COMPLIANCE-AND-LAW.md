# Law and compliance map

Last reviewed: **2026-09-24** · Operator: **MediConnect** · Jurisdictions designed for: United States, European Union, United Kingdom

> **Not legal advice and not a certification.** This is an engineering map of which laws are likely
> to apply, what they require, and which platform control answers each requirement. Whether a law
> applies depends on the operator's legal entity, customers, contracts and where patients live.
> MediConnect does **not** claim to be "HIPAA compliant", "GDPR compliant" or certified under any
> framework. Compliance is a property of an operating organisation, its contracts and its
> processes, not of source code. Any earlier badge or table in these repositories that says
> "compliant" or "100%" describes an internal control checklist and is marked as such.

Legal rules change. Dates below were checked on the review date against the linked sources.
Re-check before relying on them.

## 1. Which role MediConnect plays

| Scenario | United States | European Union / United Kingdom |
|---|---|---|
| Hospitals and clinics use MediConnect to treat their patients | MediConnect is a **business associate** of each covered entity and signs a Business Associate Agreement (BAA) | Clinics are **controllers**; MediConnect is a **processor** under a data processing agreement (Art. 28 GDPR) |
| MediConnect sells care directly to consumers (its own doctors or subscriptions) | MediConnect may be a **covered entity** (if it bills health plans electronically) or, if not, is regulated by the FTC and state consumer-health laws | MediConnect is a **controller** of health data |

The current documentation assumes the **processor / business associate** model, with direct-to-consumer
features (subscriptions, AI assistant) reviewed separately.

## 2. United States

| Law or rule | What it requires (short) | Platform control | Open items |
|---|---|---|---|
| **HIPAA Privacy Rule** (45 CFR Part 164 Subpart E) | Limit use and disclosure of PHI; minimum necessary; patient rights of access and amendment; keep required documentation **6 years** (§164.530(j)(2)) | Role and ownership checks, patient data export (FHIR Bundle, Blue Button), consent ledger, audit log | Policies, privacy notice by the operating entity, workforce training |
| **HIPAA Security Rule** (Subpart C) | Risk analysis, access control, audit controls, integrity, authentication, transmission security | KMS field encryption, TLS, MFA, audit events, session timeout, break-glass access | Formal written risk analysis; contingency plan tested |
| **Proposed HIPAA Security Rule update** (NPRM published 6 Jan 2025) | Would make encryption and MFA mandatory, require asset inventory, network maps, 72-hour restore planning, annual compliance audits | Design already includes encryption, MFA, inventory tooling, restore targets | **Not final.** The federal agenda lists final action no earlier than 2027. Track it. |
| **HIPAA Breach Notification Rule** (Subpart D) | Notify affected individuals without unreasonable delay and within **60 days** of discovery; notify HHS (at the same time if 500 or more people are affected; smaller breaches go in an annual log sent within 60 days after the calendar year ends); notify prominent media if **more than 500 residents** of a state or jurisdiction are affected. **As a business associate**, MediConnect must tell the covered entity without unreasonable delay and within 60 days of discovery (§164.410). | Breach detection alerts, audit log for scoping, incident process in [RELIABILITY.md](RELIABILITY.md) | Named breach response lead; notification templates |
| **HITECH Act** | Extends HIPAA to business associates; tiered penalties; breach notification | BAA readiness record | Signed BAAs with every subprocessor that touches PHI (cloud, email, video, AI) |
| **Reproductive health privacy amendment (2024)** | Was vacated nationally by a federal court in June 2025 (*Purl v. HHS*); appeal dismissed Sept 2025 | Treat reproductive health data as sensitive anyway; state laws still apply | Monitor state laws |
| **FTC Health Breach Notification Rule** (16 CFR Part 318, amended 2024) | Health apps not covered by HIPAA must notify users, the FTC and sometimes media of breaches, including unauthorised sharing; 500+ records → notify the FTC at the same time as users, within 60 days | Same incident process; no advertising or tracking pixels on health pages | Confirm direct-to-consumer features' status |
| **FTC Act Section 5** | No deceptive claims about privacy or security | This document; "compliant" badges marked as historical labels | Marketing review before launch |
| **State consumer health data laws**, for example Washington **My Health My Data Act** | Separate opt-in consent to collect and to share consumer health data; signed authorisation to sell; no geofencing near care facilities; private right of action | Granular consent ledger, no data sale, no location tracking | Per-state consent wording |
| **California CCPA/CPRA** and the 2026 regulations | Sensitive personal information rights; new rules on automated decision-making (from 1 Jan 2027), risk assessments (first due by 31 Dec 2027) and cybersecurity audits (phased from 2028) for businesses above thresholds | Data export and erasure flows, AI governance | Threshold assessment; notice at collection |
| **California CMIA** and other state medical privacy laws | Stricter-than-HIPAA confidentiality for medical information | Same access controls | State-specific review |
| **State medical record retention** | Record retention periods are set by **state law** (often 6–10 years; longer for minors), not by HIPAA | Configurable retention per data category | Per-state schedule |
| **DEA telemedicine prescribing** | Controlled-substance prescribing by telemedicine without a prior in-person visit is allowed under temporary flexibilities **through 31 Dec 2026**; permanent rules pending | DEA registration checks and schedule validation in e-prescribing | Watch for the permanent rule before 2027; EPCS certification needed for controlled substances |
| **State telehealth licensure** | Clinicians must be licensed where the patient is located | Doctor profile and licence verification | Licence-state matching at booking |
| **FDA device rules and the Clinical Decision Support guidance** (revised January 2026) | Software that analyses patient data to drive diagnosis or treatment may be a medical device unless it meets the non-device CDS criteria (including letting the clinician independently review the basis) | AI assistant is informational, shows sources, never gives a diagnosis; clinical decisions stay with licensed clinicians | Regulatory assessment of symptom checker before launch |
| **21st Century Cures Act information blocking** (ONC/ASTP rules) | Health IT developers of certified health IT, HIEs and providers must not block access to electronic health information | FHIR R4 APIs, SMART on FHIR, bulk export | Applies only if certified or acting as an "actor"; confirm |
| **PCI DSS v4.0.1** | Card data security | Stripe Elements/Checkout keep card data off MediConnect servers (reduced PCI scope) | Annual self-assessment questionnaire |
| **ADA** and **Section 504 / Section 1557** | Accessible services; HHS rule requires WCAG 2.1 AA for HHS-funded recipients (15+ employees from May 2026) | See [ACCESSIBILITY.md](ACCESSIBILITY.md) | Audit before launch |
| **TCPA** | Prior express consent for automated or prerecorded calls and texts to mobile numbers; prior express **written** consent for marketing calls and texts | Notification preferences | Consent capture and records for SMS |
| **CAN-SPAM Act** | Commercial email is **opt-out**, not opt-in: accurate headers and subject, a working unsubscribe honoured within 10 business days, and a postal address | Notification preferences | Unsubscribe handling for any marketing email |

## 3. European Union

| Law | What it requires (short) | Platform control | Open items |
|---|---|---|---|
| **GDPR** Art. 5, 6, 9 | Lawful basis; health data is special-category data and needs an Art. 9(2) condition (for example 9(2)(h) healthcare) | Purpose-specific consent ledger, data minimisation, purpose separation per service | Legal basis register |
| GDPR Art. 12–22 (data subject rights) | Access, rectification, erasure, restriction, portability, objection; answer within one month | Export (Art. 15/20), erasure with grace period (Art. 17), profile edit, account restriction | Identity verification for requests; request log |
| GDPR Art. 25, 32 | Privacy by design; appropriate security | Encryption, pseudonymised analytics, least privilege | Records of processing (Art. 30) |
| GDPR Art. 28 | Processor contracts with every subprocessor | Subprocessor list in [PRIVACY-AND-DATA.md](PRIVACY-AND-DATA.md) | Signed DPAs |
| GDPR Art. 33–34 | Controllers report personal-data breaches to the supervisory authority **within 72 hours** and tell individuals when the risk is high. **As a processor**, MediConnect must tell the controller without undue delay (Art. 33(2)) | Breach detection and incident process | Contact list of authorities |
| GDPR Art. 35 | Data protection impact assessment for large-scale health processing | DPIA draft in [compliance/dpia.md](../compliance/dpia.md) | DPO review and sign-off |
| GDPR Art. 37 | Data protection officer when core activity is large-scale special-category processing | — | Appoint DPO; EU representative (Art. 27) if no EU establishment |
| GDPR Chapter V (transfers) | Transfers outside the EU need an adequacy decision or safeguards | EU data plane in `eu-central-1`; no cross-region data calls | Transfer impact assessment for US subprocessors |
| **EU AI Act** (Regulation 2024/1689, amended by the 2026 Digital Omnibus) | Transparency duties (tell people they are talking to AI, mark synthetic content) apply from **2 Aug 2026**; high-risk duties are postponed to **2 Dec 2027** (Annex III) and **2 Aug 2028** (AI in regulated products such as medical devices) | Chatbot discloses it is AI; no AI-generated clinical decisions; AI governance in [AI-GOVERNANCE.md](AI-GOVERNANCE.md) | Classify each AI feature; technical documentation if high-risk |
| **Medical Device Regulation (EU) 2017/745** | Software intended for diagnosis or treatment decisions may be a medical device (Rule 11) | Symptom checker kept informational | Qualification and classification assessment |
| **European Health Data Space** (Regulation 2025/327) | In force since 26 Mar 2025; applies in stages from **26 Mar 2027**, with patient summaries and e-prescriptions exchange by 2029 and more data categories by 2031; EHR systems face interoperability and logging requirements | FHIR-based data model, export and access logs | Assess whether MediConnect counts as an "EHR system" |
| **NIS2 Directive** (applies through each member state's national law) | Health is a high-criticality sector for medium and large entities: risk management, **24-hour early warning, 72-hour notification, one-month report** for significant incidents | Incident process, monitoring | Applies once the entity passes size thresholds |
| **European Accessibility Act** | Accessibility of e-commerce and certain digital services since 28 Jun 2025 | WCAG 2.2 AA target | Audit |
| **ePrivacy Directive** (cookies and marketing) | Consent before non-essential cookies; prior consent for marketing email and SMS to individuals, with a narrow exception for existing customers (national rules vary) | Granular cookie consent (essential, functional, analytics) | — |

## 4. United Kingdom

| Law | Notes |
|---|---|
| **UK GDPR and Data Protection Act 2018** | Same model as the EU GDPR with UK-specific transfer rules and ICO registration. |
| **Data (Use and Access) Act 2025** | In force in stages between August 2025 and June 2026. Relaxes some automated decision rules, but **keeps** strict limits on significant automated decisions using health data. Adds complaint-handling duties. |
| **NHS Data Security and Protection Toolkit (DSPT) and DCB0129/DCB0160** | Needed only when supplying NHS organisations: annual security self-assessment and clinical safety case. |

## 5. Voluntary standards (not law)

| Framework | Use |
|---|---|
| SOC 2 Type II | Independent audit customers usually ask for. Earlier "SOC 2" mentions are an internal control mapping, **not** an audit. |
| ISO/IEC 27001 and 27701 | Security and privacy management systems. |
| HITRUST CSF | Common with US healthcare customers. |
| NIST Cybersecurity Framework 2.0 and SP 800-66r2 | Implementation guidance for the HIPAA Security Rule. |
| IEC 62304, ISO 14971, IEC 82304-1 | Software lifecycle and risk management if any feature becomes a medical device. |
| HL7 FHIR R4, US Core, SMART on FHIR, DICOM | Interoperability. Earlier resource counts are implementation mappings, not formal conformance testing. |

## 6. What the operator must do before real patient data

1. Form or name the legal entity that operates MediConnect and publish its privacy notice and terms.
2. Decide the role per market (business associate/processor versus covered entity/controller).
3. Sign BAAs and DPAs with every subprocessor that can touch health data.
4. Complete and sign the HIPAA risk analysis and the GDPR DPIA; appoint a DPO and, if needed, an EU/UK representative.
5. Run an independent penetration test and an accessibility audit.
6. Assess every AI feature under the FDA CDS guidance, EU MDR and the EU AI Act.
7. Set up breach response contacts, templates and a tested incident process.
8. Obtain legal review of this map by qualified counsel in each jurisdiction.

## Sources

- HHS, [HIPAA Security Rule NPRM](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html); status reporting: [HIPAA Journal](https://www.hipaajournal.com/hipaa-security-rule-update-postponed/), [Clark Hill](https://www.clarkhill.com/news-events/news/hipaa-security-rule-update-delayed-until-2027/)
- 45 CFR [§164.530](https://www.law.cornell.edu/cfr/text/45/164.530) (documentation retention)
- *Purl v. HHS* vacatur: [ABA Health Law](https://www.americanbar.org/groups/health_law/news/2025/signaling-end-purl-case/), [Holland & Knight](https://www.hklaw.com/en/insights/publications/2025/06/hipaas-reproductive-health-rule-is-vacated-nationally)
- FTC, [Health Breach Notification Rule](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0) and [2024 update](https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-finalizes-changes-health-breach-notification-rule)
- DEA, [telemedicine flexibilities extended through 2026](https://www.dea.gov/press-releases/2025/12/31/dea-extends-telemedicine-flexibilities-ensure-continued-access-care); [Federal Register](https://www.federalregister.gov/documents/2025/12/31/2025-24123/fourth-temporary-extension-of-covid-19-telemedicine-flexibilities-for-prescription-of-controlled)
- FDA, [Clinical Decision Support Software guidance](https://www.fda.gov/media/109618/download); summary: [Covington](https://www.cov.com/en/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance)
- California, [CPPA final regulations announcement](https://www.cppa.ca.gov/announcements/2025/20250923.html)
- Washington My Health My Data Act: [IAPP overview](https://iapp.org/resources/article/washington-my-health-my-data-act-overview)
- EU AI Act Digital Omnibus: [Council of the EU](https://www.consilium.europa.eu/en/press/press-releases/2026/06/29/artificial-intelligence-council-gives-final-green-light-to-simplify-and-streamline-rules/), [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)
- European Health Data Space: [Regulation 2025/327 overview](https://digitalpolicyalert.org/change/3347), [Kennedys](https://www.kennedyslaw.com/en/thought-leadership/article/2026/the-european-health-data-space-is-in-force-implications-for-healthcare-medtech-and-life-sciences/)
- NIS2 incident reporting: [NIS 2 Directive text](https://www.nis-2-directive.com/NIS_2_Directive_Preamble_101_to_110.html)
- UK, [ICO: Data (Use and Access) Act 2025](https://ico.org.uk/about-the-ico/what-we-do/legislation-we-cover/data-use-and-access-act-2025/)
- Accessibility deadlines: [Jackson Lewis on DOJ and HHS dates](https://www.jacksonlewis.com/insights/doj-extends-public-entities-compliance-deadline-ada-related-website-accessibility-hhss-may-2026-deadline-still-looms)
