# ── AWS Security Hub ───────────────────────────────────────────────────────
# Addresses Prowler HIPAA finding: "Security Hub is enabled with standards" (17x)
# Security Hub aggregates findings from GuardDuty, Inspector, and Checkov.
# Enables HIPAA, CIS, PCI-DSS, and NIST 800-53 standards.

# --- US (us-east-1) ---

resource "aws_securityhub_account" "us" {
  provider                 = aws.us
  control_finding_generator = "SECURITY_CONTROL"
  auto_enable_controls     = true
}

resource "aws_securityhub_standards_subscription" "hipaa_us" {
  provider      = aws.us
  standards_arn = "arn:aws:securityhub:us-east-1::standards/hipaa-security"
  depends_on    = [aws_securityhub_account.us]
}

resource "aws_securityhub_standards_subscription" "cis_us" {
  provider      = aws.us
  standards_arn = "arn:aws:securityhub:us-east-1::standards/cis-aws-foundations-benchmark/v/3.0.0"
  depends_on    = [aws_securityhub_account.us]
}

resource "aws_securityhub_standards_subscription" "nist_us" {
  provider      = aws.us
  standards_arn = "arn:aws:securityhub:us-east-1::standards/nist-800-53/v/5.0.0"
  depends_on    = [aws_securityhub_account.us]
}

resource "aws_securityhub_standards_subscription" "pci_us" {
  provider      = aws.us
  standards_arn = "arn:aws:securityhub:us-east-1::standards/pci-dss/v/3.2.1"
  depends_on    = [aws_securityhub_account.us]
}

# --- EU (eu-central-1) ---

resource "aws_securityhub_account" "eu" {
  provider                 = aws.eu
  control_finding_generator = "SECURITY_CONTROL"
  auto_enable_controls     = true
}

resource "aws_securityhub_standards_subscription" "hipaa_eu" {
  provider      = aws.eu
  standards_arn = "arn:aws:securityhub:eu-central-1::standards/hipaa-security"
  depends_on    = [aws_securityhub_account.eu]
}

resource "aws_securityhub_standards_subscription" "cis_eu" {
  provider      = aws.eu
  standards_arn = "arn:aws:securityhub:eu-central-1::standards/cis-aws-foundations-benchmark/v/3.0.0"
  depends_on    = [aws_securityhub_account.eu]
}

resource "aws_securityhub_standards_subscription" "nist_eu" {
  provider      = aws.eu
  standards_arn = "arn:aws:securityhub:eu-central-1::standards/nist-800-53/v/5.0.0"
  depends_on    = [aws_securityhub_account.eu]
}

resource "aws_securityhub_standards_subscription" "pci_eu" {
  provider      = aws.eu
  standards_arn = "arn:aws:securityhub:eu-central-1::standards/pci-dss/v/3.2.1"
  depends_on    = [aws_securityhub_account.eu]
}
