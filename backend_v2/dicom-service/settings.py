"""Validated runtime configuration for the DICOM service."""

from __future__ import annotations

import os
import re


_RESOURCE_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


def required_resource_name(name: str) -> str:
    """Return a required resource name without exposing its value in errors."""
    value = os.getenv(name, "").strip()
    if not value or not _RESOURCE_NAME.fullmatch(value):
        raise RuntimeError(f"Missing or invalid required configuration: {name}")
    return value
