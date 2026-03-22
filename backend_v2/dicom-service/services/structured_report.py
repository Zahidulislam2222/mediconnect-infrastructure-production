"""
DICOM Structured Report (SR) Processor
Parses DICOM SR documents and extracts clinical findings as FHIR resources.

DICOM SR (PS3.3 C.17) contains structured clinical data such as:
- Radiology measurements and findings
- CAD results
- Dose reports
- Key object selection

This module extracts content from SR documents and maps them to FHIR resources
(DiagnosticReport, Observation) for clinical interoperability.
"""

import pydicom
from pydicom.sequence import Sequence
from pydicom.dataset import Dataset
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import logging

logger = logging.getLogger(__name__)

# DICOM SR Value Types (PS3.3 Table C.17.3-7)
SR_VALUE_TYPES = {
    "TEXT": "text",
    "NUM": "numeric",
    "CODE": "coded",
    "DATETIME": "datetime",
    "DATE": "date",
    "TIME": "time",
    "UIDREF": "uid_reference",
    "PNAME": "person_name",
    "COMPOSITE": "composite",
    "IMAGE": "image_reference",
    "WAVEFORM": "waveform_reference",
    "SCOORD": "spatial_coordinates",
    "SCOORD3D": "spatial_coordinates_3d",
    "TCOORD": "temporal_coordinates",
    "CONTAINER": "container",
}

# Mapping DICOM SR concept codes to LOINC for FHIR
CONCEPT_CODE_TO_LOINC = {
    "126000": "18782-3",  # Radiology Study
    "126010": "18748-4",  # Diagnostic Imaging Report
    "113701": "73569-6",  # Radiation Dose Report
    "126001": "18782-3",  # Imaging Report
}


def is_structured_report(dataset: pydicom.Dataset) -> bool:
    """Check if a DICOM dataset is a Structured Report."""
    sr_sop_classes = {
        "1.2.840.10008.5.1.4.1.1.88.11",  # Basic Text SR
        "1.2.840.10008.5.1.4.1.1.88.22",  # Enhanced SR
        "1.2.840.10008.5.1.4.1.1.88.33",  # Comprehensive SR
        "1.2.840.10008.5.1.4.1.1.88.34",  # Comprehensive 3D SR
        "1.2.840.10008.5.1.4.1.1.88.35",  # Extensible SR
        "1.2.840.10008.5.1.4.1.1.88.40",  # Procedure Log
        "1.2.840.10008.5.1.4.1.1.88.50",  # Mammography CAD SR
        "1.2.840.10008.5.1.4.1.1.88.65",  # Chest CAD SR
        "1.2.840.10008.5.1.4.1.1.88.67",  # X-Ray Radiation Dose SR
        "1.2.840.10008.5.1.4.1.1.88.68",  # Radiopharmaceutical Radiation Dose SR
        "1.2.840.10008.5.1.4.1.1.88.69",  # Colon CAD SR
        "1.2.840.10008.5.1.4.1.1.88.70",  # Implantation Plan SR
        "1.2.840.10008.5.1.4.1.1.88.71",  # Acquisition Context SR
        "1.2.840.10008.5.1.4.1.1.88.72",  # Simplified Adult Echo SR
        "1.2.840.10008.5.1.4.1.1.88.73",  # Patient Radiation Dose SR
        "1.2.840.10008.5.1.4.1.1.88.74",  # Planned Imaging Agent Admin SR
        "1.2.840.10008.5.1.4.1.1.88.75",  # Performed Imaging Agent Admin SR
        "1.2.840.10008.5.1.4.1.1.88.76",  # Enhanced X-Ray Radiation Dose SR
    }
    sop = getattr(dataset, "SOPClassUID", "")
    return str(sop) in sr_sop_classes


def extract_sr_content(dataset: pydicom.Dataset) -> Dict[str, Any]:
    """
    Extract structured content from a DICOM SR document.
    Returns a dictionary with report structure, findings, and measurements.
    """
    result = {
        "document_title": "",
        "completion_flag": "",
        "verification_flag": "",
        "content_date": "",
        "content_time": "",
        "findings": [],
        "measurements": [],
        "codes": [],
        "references": [],
    }

    # Extract document title from ConceptNameCodeSequence
    if hasattr(dataset, "ConceptNameCodeSequence") and dataset.ConceptNameCodeSequence:
        cn = dataset.ConceptNameCodeSequence[0]
        result["document_title"] = str(getattr(cn, "CodeMeaning", "Structured Report"))
    else:
        result["document_title"] = "Structured Report"

    result["completion_flag"] = str(getattr(dataset, "CompletionFlag", "COMPLETE"))
    result["verification_flag"] = str(getattr(dataset, "VerificationFlag", "UNVERIFIED"))
    result["content_date"] = str(getattr(dataset, "ContentDate", ""))
    result["content_time"] = str(getattr(dataset, "ContentTime", ""))

    # Parse content tree recursively
    if hasattr(dataset, "ContentSequence"):
        _parse_content_sequence(dataset.ContentSequence, result, depth=0)

    return result


def _parse_content_sequence(sequence: Sequence, result: Dict, depth: int = 0) -> None:
    """Recursively parse DICOM SR content tree."""
    if depth > 20:  # Prevent infinite recursion
        return

    for item in sequence:
        value_type = str(getattr(item, "ValueType", ""))
        concept_name = ""
        concept_code = ""

        if hasattr(item, "ConceptNameCodeSequence") and item.ConceptNameCodeSequence:
            cn = item.ConceptNameCodeSequence[0]
            concept_name = str(getattr(cn, "CodeMeaning", ""))
            concept_code = str(getattr(cn, "CodeValue", ""))

        if value_type == "TEXT":
            text_value = str(getattr(item, "TextValue", ""))
            if text_value:
                result["findings"].append({
                    "concept": concept_name,
                    "code": concept_code,
                    "value": text_value,
                    "type": "text",
                })

        elif value_type == "NUM":
            measured_value = None
            unit = ""
            if hasattr(item, "MeasuredValueSequence") and item.MeasuredValueSequence:
                mv = item.MeasuredValueSequence[0]
                measured_value = float(getattr(mv, "NumericValue", 0))
                if hasattr(mv, "MeasurementUnitsCodeSequence") and mv.MeasurementUnitsCodeSequence:
                    unit = str(getattr(mv.MeasurementUnitsCodeSequence[0], "CodeValue", ""))

            if measured_value is not None:
                result["measurements"].append({
                    "concept": concept_name,
                    "code": concept_code,
                    "value": measured_value,
                    "unit": unit,
                    "type": "numeric",
                })

        elif value_type == "CODE":
            if hasattr(item, "ConceptCodeSequence") and item.ConceptCodeSequence:
                cc = item.ConceptCodeSequence[0]
                result["codes"].append({
                    "concept": concept_name,
                    "code": concept_code,
                    "value_code": str(getattr(cc, "CodeValue", "")),
                    "value_meaning": str(getattr(cc, "CodeMeaning", "")),
                    "value_scheme": str(getattr(cc, "CodingSchemeDesignator", "")),
                    "type": "coded",
                })

        elif value_type == "IMAGE":
            if hasattr(item, "ReferencedSOPSequence") and item.ReferencedSOPSequence:
                ref = item.ReferencedSOPSequence[0]
                result["references"].append({
                    "concept": concept_name,
                    "sop_class": str(getattr(ref, "ReferencedSOPClassUID", "")),
                    "sop_instance": str(getattr(ref, "ReferencedSOPInstanceUID", "")),
                    "type": "image_reference",
                })

        # Recurse into nested containers
        if hasattr(item, "ContentSequence") and item.ContentSequence:
            _parse_content_sequence(item.ContentSequence, result, depth + 1)


def sr_to_fhir_diagnostic_report(
    sr_content: Dict[str, Any],
    patient_id: str,
    study_uid: str,
) -> Dict[str, Any]:
    """Convert extracted SR content to a FHIR DiagnosticReport resource."""
    report_id = f"sr-{uuid.uuid4().hex[:12]}"

    # Map SR findings to FHIR Observation references
    observations = []
    for i, finding in enumerate(sr_content.get("findings", [])):
        obs_id = f"obs-{report_id}-{i}"
        observations.append({
            "resourceType": "Observation",
            "id": obs_id,
            "status": "final",
            "code": {
                "coding": [{"code": finding.get("code", ""), "display": finding.get("concept", "")}],
                "text": finding.get("concept", ""),
            },
            "subject": {"reference": f"Patient/{patient_id}"},
            "valueString": finding.get("value", ""),
        })

    for i, measurement in enumerate(sr_content.get("measurements", [])):
        obs_id = f"obs-{report_id}-m{i}"
        observations.append({
            "resourceType": "Observation",
            "id": obs_id,
            "status": "final",
            "code": {
                "coding": [{"code": measurement.get("code", ""), "display": measurement.get("concept", "")}],
                "text": measurement.get("concept", ""),
            },
            "subject": {"reference": f"Patient/{patient_id}"},
            "valueQuantity": {
                "value": measurement.get("value"),
                "unit": measurement.get("unit", ""),
                "system": "http://unitsofmeasure.org",
                "code": measurement.get("unit", ""),
            },
        })

    # Build DiagnosticReport
    report = {
        "resourceType": "DiagnosticReport",
        "id": report_id,
        "status": "final" if sr_content.get("completion_flag") == "COMPLETE" else "partial",
        "code": {
            "coding": [{"system": "http://loinc.org", "code": "18748-4", "display": "Diagnostic Imaging Report"}],
            "text": sr_content.get("document_title", "Structured Report"),
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "issued": datetime.utcnow().isoformat() + "Z",
        "result": [{"reference": f"Observation/{obs['id']}"} for obs in observations],
        "conclusion": "; ".join([f.get("value", "") for f in sr_content.get("findings", [])[:5]]),
        "imagingStudy": [{"reference": f"ImagingStudy/{study_uid}"}],
    }

    return {"report": report, "observations": observations}
