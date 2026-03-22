"""
DICOM Transfer Syntax Registry
Enumerates all supported transfer syntaxes for the MediConnect DICOM service.
Used by DICOMweb metadata endpoints and PACS negotiation.
"""

from typing import Dict, List, Any

# Supported Transfer Syntaxes (PS3.5)
TRANSFER_SYNTAXES: Dict[str, Dict[str, Any]] = {
    # Uncompressed
    "1.2.840.10008.1.2": {
        "name": "Implicit VR Little Endian",
        "supported": True,
        "category": "uncompressed",
        "default": True,
    },
    "1.2.840.10008.1.2.1": {
        "name": "Explicit VR Little Endian",
        "supported": True,
        "category": "uncompressed",
    },
    "1.2.840.10008.1.2.2": {
        "name": "Explicit VR Big Endian",
        "supported": True,
        "category": "uncompressed",
        "retired": True,
    },
    # JPEG Lossless
    "1.2.840.10008.1.2.4.57": {
        "name": "JPEG Lossless, Non-Hierarchical (Process 14)",
        "supported": True,
        "category": "jpeg",
    },
    "1.2.840.10008.1.2.4.70": {
        "name": "JPEG Lossless, Non-Hierarchical, First-Order Prediction (Process 14, Selection Value 1)",
        "supported": True,
        "category": "jpeg",
    },
    # JPEG Lossy
    "1.2.840.10008.1.2.4.50": {
        "name": "JPEG Baseline (Process 1)",
        "supported": True,
        "category": "jpeg",
    },
    "1.2.840.10008.1.2.4.51": {
        "name": "JPEG Extended (Process 2 & 4)",
        "supported": True,
        "category": "jpeg",
    },
    # JPEG 2000
    "1.2.840.10008.1.2.4.90": {
        "name": "JPEG 2000 Image Compression (Lossless Only)",
        "supported": True,
        "category": "jpeg2000",
    },
    "1.2.840.10008.1.2.4.91": {
        "name": "JPEG 2000 Image Compression",
        "supported": True,
        "category": "jpeg2000",
    },
    # JPEG-LS
    "1.2.840.10008.1.2.4.80": {
        "name": "JPEG-LS Lossless Image Compression",
        "supported": True,
        "category": "jpegls",
    },
    "1.2.840.10008.1.2.4.81": {
        "name": "JPEG-LS Lossy (Near-Lossless) Image Compression",
        "supported": True,
        "category": "jpegls",
    },
    # RLE
    "1.2.840.10008.1.2.5": {
        "name": "RLE Lossless",
        "supported": True,
        "category": "rle",
    },
    # Deflated
    "1.2.840.10008.1.2.1.99": {
        "name": "Deflated Explicit VR Little Endian",
        "supported": True,
        "category": "deflated",
    },
    # High-Throughput JPEG 2000
    "1.2.840.10008.1.2.4.201": {
        "name": "High-Throughput JPEG 2000 Image Compression (Lossless Only)",
        "supported": False,
        "category": "htjpeg2000",
    },
    "1.2.840.10008.1.2.4.202": {
        "name": "High-Throughput JPEG 2000 with RPCL Options (Lossless Only)",
        "supported": False,
        "category": "htjpeg2000",
    },
    "1.2.840.10008.1.2.4.203": {
        "name": "High-Throughput JPEG 2000 Image Compression",
        "supported": False,
        "category": "htjpeg2000",
    },
}

# SOP Classes we support (PS3.4)
SUPPORTED_SOP_CLASSES = {
    "1.2.840.10008.5.1.4.1.1.2": "CT Image Storage",
    "1.2.840.10008.5.1.4.1.1.4": "MR Image Storage",
    "1.2.840.10008.5.1.4.1.1.1": "Computed Radiography Image Storage",
    "1.2.840.10008.5.1.4.1.1.1.1": "Digital X-Ray Image Storage - For Presentation",
    "1.2.840.10008.5.1.4.1.1.7": "Secondary Capture Image Storage",
    "1.2.840.10008.5.1.4.1.1.12.1": "X-Ray Angiographic Image Storage",
    "1.2.840.10008.5.1.4.1.1.6.1": "Ultrasound Image Storage",
    "1.2.840.10008.5.1.4.1.1.77.1.4": "Video Endoscopic Image Storage",
    "1.2.840.10008.5.1.4.1.1.13.1.3": "Breast Tomosynthesis Image Storage",
    "1.2.840.10008.5.1.4.1.1.128": "Positron Emission Tomography Image Storage",
    "1.2.840.10008.5.1.4.1.1.20": "Nuclear Medicine Image Storage",
    "1.2.840.10008.5.1.4.1.1.481.1": "RT Image Storage",
    "1.2.840.10008.5.1.4.1.1.66.4": "Segmentation Storage",
    # Structured Reports
    "1.2.840.10008.5.1.4.1.1.88.11": "Basic Text SR Storage",
    "1.2.840.10008.5.1.4.1.1.88.22": "Enhanced SR Storage",
    "1.2.840.10008.5.1.4.1.1.88.33": "Comprehensive SR Storage",
    "1.2.840.10008.5.1.4.1.1.88.34": "Comprehensive 3D SR Storage",
    "1.2.840.10008.5.1.4.1.1.88.35": "Extensible SR Storage",
}


def get_supported_transfer_syntaxes() -> List[Dict[str, Any]]:
    """Return list of all supported transfer syntaxes."""
    return [
        {"uid": uid, **info}
        for uid, info in TRANSFER_SYNTAXES.items()
        if info.get("supported", False)
    ]


def get_supported_sop_classes() -> List[Dict[str, str]]:
    """Return list of all supported SOP classes."""
    return [
        {"uid": uid, "name": name}
        for uid, name in SUPPORTED_SOP_CLASSES.items()
    ]


def get_transfer_syntax_info(uid: str) -> Dict[str, Any]:
    """Get info for a specific transfer syntax UID."""
    return TRANSFER_SYNTAXES.get(uid, {"name": "Unknown", "supported": False})


def is_transfer_syntax_supported(uid: str) -> bool:
    """Check if a transfer syntax is supported."""
    return TRANSFER_SYNTAXES.get(uid, {}).get("supported", False)
