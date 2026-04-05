# US security groups — imported as-is, rules managed via ignore_changes

resource "aws_security_group" "migration_sg" {
  provider    = aws.us
  name        = "mediconnect-migration-sg"
  vpc_id      = data.aws_vpc.default.id
  description = "Security group for migration job"

  lifecycle {
    ignore_changes = [
      ingress,
      egress,
      description,
    ]
  }
}

resource "aws_security_group" "rds_sg_v2" {
  provider    = aws.us
  name        = "mediconnect-rds-sg-v2"
  vpc_id      = data.aws_vpc.default.id
  description = "RDS security group v2"

  lifecycle {
    ignore_changes = [
      ingress,
      egress,
      description,
    ]
  }
}

# EU EKS security groups — managed by eksctl, import for visibility only
# Skipping EKS-managed SGs (eksctl/eks-cluster-sg) as they are owned by EKS
# and will drift if Terraform tries to manage them.
