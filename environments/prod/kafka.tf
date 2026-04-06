# ── AWS MSK Serverless — Kafka Event Streaming ────────────────────────────
# HIPAA-eligible, GDPR-compliant (separate cluster per region).
# Encryption: AES-256 at rest + TLS 1.2 in transit (cannot disable).
# Auth: IAM only (no passwords, no SASL/PLAIN).
# Cost: Pay-per-use (~$0.10/GB). $0 when idle.
#
# Topics and consumers are managed by application code, not Terraform.
# See: backend_v2/scripts/kafka-setup.ts

# ── US (us-east-1) ────────────────────────────────────────────────────────

resource "aws_security_group" "kafka_us" {
  provider    = aws.us
  name        = "mediconnect-kafka-sg"
  vpc_id      = data.aws_vpc.default.id
  description = "Security group for MSK Serverless Kafka (us-east-1)"

  ingress {
    description = "Kafka IAM auth"
    from_port   = 9098
    to_port     = 9098
    protocol    = "tcp"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_msk_serverless_cluster" "us" {
  provider     = aws.us
  cluster_name = "mediconnect-events"

  client_authentication {
    sasl {
      iam {
        enabled = true
      }
    }
  }

  vpc_config {
    subnet_ids         = data.aws_subnets.default.ids
    security_group_ids = [aws_security_group.kafka_us.id]
  }
}

# ── EU (eu-central-1) — GDPR: EU data stays in EU ─────────────────────────

data "aws_vpc" "default_eu" {
  provider = aws.eu
  default  = true
}

data "aws_subnets" "default_eu" {
  provider = aws.eu
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default_eu.id]
  }
}

resource "aws_security_group" "kafka_eu" {
  provider    = aws.eu
  name        = "mediconnect-kafka-sg"
  vpc_id      = data.aws_vpc.default_eu.id
  description = "Security group for MSK Serverless Kafka (eu-central-1)"

  ingress {
    description = "Kafka IAM auth"
    from_port   = 9098
    to_port     = 9098
    protocol    = "tcp"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_msk_serverless_cluster" "eu" {
  provider     = aws.eu
  cluster_name = "mediconnect-events"

  client_authentication {
    sasl {
      iam {
        enabled = true
      }
    }
  }

  vpc_config {
    subnet_ids         = data.aws_subnets.default_eu.ids
    security_group_ids = [aws_security_group.kafka_eu.id]
  }
}

# ── Outputs ────────────────────────────────────────────────────────────────

output "msk_bootstrap_us" {
  description = "MSK Serverless bootstrap servers (US)"
  value       = aws_msk_serverless_cluster.us.cluster_uuid
}

output "msk_bootstrap_eu" {
  description = "MSK Serverless bootstrap servers (EU)"
  value       = aws_msk_serverless_cluster.eu.cluster_uuid
}
