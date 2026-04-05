resource "aws_cloudfront_distribution" "frontend" {
  provider = aws.us

  enabled         = true
  comment         = "Frontend for Mediconnect"
  price_class     = "PriceClass_All"
  is_ipv6_enabled = true

  tags = {
    Name = "mediconnect-frontend"
  }

  origin {
    domain_name              = "mediconnect-frontend-v1.s3.us-east-1.amazonaws.com"
    origin_id                = "mediconnect-frontend-v1.s3.us-east-1.amazonaws.com-mk3qc52te8r"
    origin_access_control_id = "E1HSAS741DYKG8"

    s3_origin_config {
      origin_access_identity = ""
    }
  }

  default_cache_behavior {
    target_origin_id       = "mediconnect-frontend-v1.s3.us-east-1.amazonaws.com-mk3qc52te8r"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["HEAD", "GET", "OPTIONS"]
    cached_methods         = ["HEAD", "GET"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    compress               = true
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  lifecycle {
    ignore_changes = [
      origin,
    ]
  }
}
