"""
PII-safe Logging -- Python port of shared/logger.ts
=====================================================
Masks PII patterns (email, SSN, phone, passwords/secrets) in log output.
Prevents accidental PHI/PII leakage in application logs.

Usage:
    from utils.safe_logger import setup_safe_logging
    setup_safe_logging()  # Call once at startup in main.py
"""

import re
import logging

# PII patterns to mask (same as Node.js shared/logger.ts)
PII_PATTERNS = [
    (re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"), "[EMAIL_REDACTED]"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN_REDACTED]"),
    (re.compile(r"\b\d{3}[.\-]?\d{3}[.\-]?\d{4}\b"), "[PHONE_REDACTED]"),
    (re.compile(r"(?i)(password|secret|token|key)\s*[:=]\s*\S+"), r"\1=[REDACTED]"),
]


def mask_pii(message: str) -> str:
    """Replace PII patterns in a string with redaction markers."""
    for pattern, replacement in PII_PATTERNS:
        message = pattern.sub(replacement, message)
    return message


class SafeFormatter(logging.Formatter):
    """Logging formatter that masks PII in all log messages."""

    def format(self, record):
        record.msg = mask_pii(str(record.msg))
        return super().format(record)


def setup_safe_logging():
    """
    Replace the root logger's handlers with a PII-masking formatter.
    Call once at application startup before any logging occurs.
    """
    handler = logging.StreamHandler()
    handler.setFormatter(
        SafeFormatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s")
    )
    logging.root.handlers = [handler]
    logging.root.setLevel(logging.INFO)
