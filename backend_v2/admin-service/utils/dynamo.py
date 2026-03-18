"""
DynamoDB Client Factory for Admin Service
==========================================
Matches the Node.js shared/aws-config.ts getRegionalClient() pattern.
Provides regional DynamoDB access for GDPR compliance.
"""

import os
import boto3
from functools import lru_cache

_clients = {}

def get_regional_client(region: str = "us-east-1"):
    """Returns a DynamoDB resource for the given region."""
    normalized = "eu-central-1" if region.upper() in ("EU", "EU-CENTRAL-1") else "us-east-1"

    if normalized not in _clients:
        _clients[normalized] = boto3.resource("dynamodb", region_name=normalized)

    return _clients[normalized]


def get_table(table_name: str, region: str = "us-east-1"):
    """Returns a DynamoDB Table object for the given table and region."""
    db = get_regional_client(region)
    return db.Table(table_name)


# ─── Table Name Configuration (matches Node.js process.env pattern) ──────
TABLE_PATIENTS = os.getenv("TABLE_PATIENTS", "mediconnect-patients")
TABLE_DOCTORS = os.getenv("TABLE_DOCTORS", "mediconnect-doctors")
TABLE_APPOINTMENTS = os.getenv("TABLE_APPOINTMENTS", "mediconnect-appointments")
TABLE_TRANSACTIONS = os.getenv("TABLE_TRANSACTIONS", "mediconnect-transactions")
TABLE_AUDIT = os.getenv("TABLE_AUDIT", "mediconnect-audit-logs")
