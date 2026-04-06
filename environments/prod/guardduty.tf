# ── AWS GuardDuty ──────────────────────────────────────────────────────────
# Addresses Prowler HIPAA finding: "GuardDuty detector is enabled" (17x)
# GuardDuty monitors for malicious activity and unauthorized access patterns.
# Required for HIPAA, SOC 2, PCI-DSS, and NIST 800-53 compliance.

# --- US (us-east-1) ---

resource "aws_guardduty_detector" "us" {
  provider = aws.us
  enable   = true

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  finding_publishing_frequency = "FIFTEEN_MINUTES"
}

# --- EU (eu-central-1) ---

resource "aws_guardduty_detector" "eu" {
  provider = aws.eu
  enable   = true

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  finding_publishing_frequency = "FIFTEEN_MINUTES"
}
