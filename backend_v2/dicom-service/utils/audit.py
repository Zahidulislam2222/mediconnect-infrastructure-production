
import os
import time
import uuid
import asyncio
import logging
import boto3
from datetime import datetime, timezone
from botocore.config import Config

from utils.event_bus import publish_event, EventType
from utils.breach_detection import check_for_breach

logger = logging.getLogger("dicom-audit")

aws_config = Config(retries={'max_attempts': 3, 'mode': 'standard'})

async def write_audit_log(actor_id: str, patient_id: str, action: str, details: str, region: str):
    target_region = 'eu-central-1' if region.upper() in ('EU', 'EU-CENTRAL-1') else 'us-east-1'
    dynamodb = boto3.resource('dynamodb', region_name=target_region, config=aws_config)
    table = dynamodb.Table(os.getenv("AUDIT_TABLE", "mediconnect-audit-logs"))

    timestamp = datetime.now(timezone.utc).isoformat()
    log_id = str(uuid.uuid4())
    ttl = int(time.time()) + (7 * 365 * 24 * 60 * 60) # 7 Year Retention

    fhir_audit_event = {
        "resourceType": "AuditEvent",
        "id": log_id,
        "type": {"system": "http://dicom.nema.org/resources/ontology/DCM", "code": "110110", "display": "Patient Record"},
        "action": "C" if "CREATE" in action else ("R" if "READ" in action else "U"),
        "recorded": timestamp,
        "outcome": "0",
        "agent":[{"requestor": True, "reference": {"display": f"Actor/{actor_id}"}, "role":[{"text": "system-worker"}]}],
        "source": {"observer": {"display": "MediConnect-DICOM-Service"}},
        "entity":[{"reference": {"display": f"Patient/{patient_id}"}}]
    }

    table.put_item(Item={
        "logId": log_id,
        "timestamp": timestamp,
        "actorId": actor_id,
        "patientId": patient_id,
        "action": action,
        "details": details,
        "region": region,
        "resource": fhir_audit_event,
        "ttl": ttl
    })

    # Fire-and-forget: publish to SQS event bus
    asyncio.ensure_future(
        publish_event(
            EventType.AUDIT_LOG,
            {
                "logId": log_id,
                "actorId": actor_id,
                "patientId": patient_id,
                "action": action,
                "details": details,
                "timestamp": timestamp,
                "service": "dicom-service",
            },
            region,
            {"source": "dicom-service", "userId": actor_id},
        )
    )

    # Fire-and-forget: check for breach patterns
    asyncio.ensure_future(
        check_for_breach(actor_id, action, details, region)
    )
