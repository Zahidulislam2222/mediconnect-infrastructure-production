# DICOM Conformance Statement
**Application Entity:** `MEDICONNECT_AE`
**Version:** 1.0.0

## 1. Implementation Model
MediConnect DICOM Service operates as a stateless proxy. It accepts HTTP multipart uploads of `.dcm` files, applies HIPAA Safe Harbor de-identification, and acts as an SCU (Service Class User) to push to an SCP (Orthanc PACS).

## 2. AE Specifications
### 2.1 Storage SCU
Provides Standard Conformance to the following DICOM V3.0 SOP Classes:
* `1.2.840.10008.5.1.4.1.1.2` (CT Image Storage)
* `1.2.840.10008.5.1.4.1.1.4` (MR Image Storage)

### 2.2 Presentation Contexts
We explicitly negotiate the following Transfer Syntaxes to ensure backwards compatibility with legacy hospital hardware:
* Implicit VR Little Endian (`1.2.840.10008.1.2`)
* Explicit VR Little Endian (`1.2.840.10008.1.2.1`)
* Explicit VR Big Endian (`1.2.840.10008.1.2.2`)

## 3. Security Profiles
* **Secure Transport:** TLS 1.2 required on all REST API ingress.
* **De-identification:** Fully conforms to PS3.15 Annex E (Basic Profile).