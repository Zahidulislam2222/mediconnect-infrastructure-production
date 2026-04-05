# ECR repos — all 7 services in both US + EU regions

# --- doctor-service ---

resource "aws_ecr_repository" "doctor_service_us" {
  provider             = aws.us
  name                 = "doctor-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "doctor_service" {
  provider             = aws.eu
  name                 = "doctor-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- communication-service ---

resource "aws_ecr_repository" "communication_service_us" {
  provider             = aws.us
  name                 = "communication-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "communication_service" {
  provider             = aws.eu
  name                 = "communication-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- patient-service ---

resource "aws_ecr_repository" "patient_service_us" {
  provider             = aws.us
  name                 = "patient-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "patient_service" {
  provider             = aws.eu
  name                 = "patient-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- booking-service ---

resource "aws_ecr_repository" "booking_service_us" {
  provider             = aws.us
  name                 = "booking-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "booking_service" {
  provider             = aws.eu
  name                 = "booking-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- admin-service ---

resource "aws_ecr_repository" "admin_service_us" {
  provider             = aws.us
  name                 = "admin-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "admin_service" {
  provider             = aws.eu
  name                 = "admin-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- staff-service ---

resource "aws_ecr_repository" "staff_service_us" {
  provider             = aws.us
  name                 = "staff-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "staff_service" {
  provider             = aws.eu
  name                 = "staff-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# --- dicom-service ---

resource "aws_ecr_repository" "dicom_service_us" {
  provider             = aws.us
  name                 = "dicom-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "dicom_service" {
  provider             = aws.eu
  name                 = "dicom-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}
