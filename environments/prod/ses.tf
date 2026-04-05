# ── SES Domain Identity (production email sending) ──────────────────────────

resource "aws_ses_domain_identity" "main" {
  provider = aws.us
  domain   = "mediconnect.health"
}

resource "aws_ses_domain_dkim" "main" {
  provider = aws.us
  domain   = aws_ses_domain_identity.main.domain
}

resource "aws_ses_domain_mail_from" "main" {
  provider         = aws.us
  domain           = aws_ses_domain_identity.main.domain
  mail_from_domain = "mail.${aws_ses_domain_identity.main.domain}"
}

# DNS records required for domain verification (add to Route53 or external DNS):
#
# 1. TXT  _amazonses.mediconnect.health  →  ses_domain_identity.main.verification_token
# 2. CNAME  (3 DKIM records)             →  ses_domain_dkim.main.dkim_tokens
# 3. MX   mail.mediconnect.health        →  feedback-smtp.us-east-1.amazonses.com  (priority 10)
# 4. TXT  mail.mediconnect.health        →  "v=spf1 include:amazonses.com -all"

# ── Legacy email identities (imported, retained for backward compatibility) ─

resource "aws_ses_email_identity" "mehzsolution" {
  provider = aws.us
  email    = "mehzsolution@gmail.com"
}

resource "aws_ses_email_identity" "zahidul" {
  provider = aws.us
  email    = "muhammadzahidulislam2222@gmail.com"
}

# ── EU region (GDPR: EU users' emails sent from EU) ────────────────────────

resource "aws_ses_domain_identity" "eu" {
  provider = aws.eu
  domain   = "mediconnect.health"
}

resource "aws_ses_domain_dkim" "eu" {
  provider = aws.eu
  domain   = aws_ses_domain_identity.eu.domain
}

resource "aws_ses_domain_mail_from" "eu" {
  provider         = aws.eu
  domain           = aws_ses_domain_identity.eu.domain
  mail_from_domain = "mail.${aws_ses_domain_identity.eu.domain}"
}
