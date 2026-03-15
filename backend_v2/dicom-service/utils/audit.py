
import os
import time
import uuid
import boto3
from datetime import datetime, timezone
from botocore.config import Config

aws_config = Config(retries={'max_attempts': 3, 'mode': 'standard'})

def write_audit_log(actor_id: str, patient_id: str, action: str, details: str, region: str):
    target_region = 'eu-central-1' if region.upper() == 'EU' else 'us-east-1'
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