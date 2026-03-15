
import os
import boto3
from botocore.config import Config

# Retry config to match your Node.js requestHandler logic
aws_config = Config(retries={'max_attempts': 3, 'mode': 'standard'})

def get_s3_client(region: str):
    target_region = 'eu-central-1' if region.upper() == 'EU' else 'us-east-1'
    return boto3.client('s3', region_name=target_region, config=aws_config)

def upload_to_s3(file_bytes: bytes, key: str, content_type: str, region: str) -> str:
    """Uploads bytes to S3 and returns the S3 URI."""
    s3 = get_s3_client(region)
    
    base_bucket = os.getenv("BUCKET_NAME", "mediconnect-medical-images")
    bucket_name = f"{base_bucket}-eu" if region.upper() == 'EU' and not base_bucket.endswith('-eu') else base_bucket

    s3.put_object(
        Bucket=bucket_name,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
        ServerSideEncryption='AES256' # HIPAA At-Rest Encryption
    )
    
    return f"s3://{bucket_name}/{key}"