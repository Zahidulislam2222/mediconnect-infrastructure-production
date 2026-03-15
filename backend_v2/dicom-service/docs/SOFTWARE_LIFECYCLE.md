# Software Lifecycle & Regulatory Compliance (IEC 62304)

## 1. Safety Classification
Per **IEC 62304**, the MediConnect DICOM processing pipeline is classified as **Software Safety Class A** (No injury or damage to health is possible). The software acts as a viewing and routing mechanism, not a primary diagnostic tool.

## 2. Risk Management (ISO 14971)
* **Risk:** Memory Exhaustion (OOM) via malformed 100MB+ DICOM files.
* **Mitigation:** Python API utilizes `UploadFile` streams; K8s Pods enforce strict 1Gi memory limits and utilize `boto3` multipart chunking to S3.
* **Risk:** Patient Data Leakage (HIPAA/GDPR violation).
* **Mitigation:** DICOM metadata is stripped in memory via `deidentify.py` *before* the pixel matrix is written to disk or transmitted to the long-term PACS system.

## 3. FHIR Interoperability
All metadata mapped from DICOM objects is strictly validated against the **HL7 FHIR R4 standard** (ImagingStudy Resource), ensuring future interoperability with Epic, Cerner, and national health exchanges.