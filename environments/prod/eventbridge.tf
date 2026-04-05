# ── US: Chime MeetingEnded → cleanup-recordings Lambda ───────────────

resource "aws_cloudwatch_event_rule" "stop_recording_us" {
  provider    = aws.us
  name        = "mediconnect-stop-recording-rule"
  description = ""

  event_pattern = jsonencode({
    source      = ["aws.chime"]
    detail-type = ["Chime Meeting State Change"]
    detail = {
      eventType = ["MeetingEnded"]
    }
  })
}

resource "aws_cloudwatch_event_target" "stop_recording_us" {
  provider  = aws.us
  rule      = aws_cloudwatch_event_rule.stop_recording_us.name
  target_id = "Id9de61f4a-33d3-4c20-957f-e47f6b674b28"
  arn       = "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-cleanup-recordings"
  role_arn  = "arn:aws:iam::950110266426:role/service-role/Amazon_EventBridge_Invoke_Lambda_1111363594"
}

# ── EU: Chime MeetingEnded → cleanup-recordings Lambda ───────────────

resource "aws_cloudwatch_event_rule" "stop_recording_eu" {
  provider    = aws.eu
  name        = "mediconnect-stop-recording-rule"
  description = ""

  event_pattern = jsonencode({
    source      = ["aws.chime"]
    detail-type = ["Chime Meeting State Change"]
    detail = {
      eventType = ["MeetingEnded"]
    }
  })
}

resource "aws_cloudwatch_event_target" "stop_recording_eu" {
  provider  = aws.eu
  rule      = aws_cloudwatch_event_rule.stop_recording_eu.name
  target_id = "Id6620f07c-de49-44ab-bd56-3c8175c55d69"
  arn       = "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-cleanup-recordings"
  role_arn  = "arn:aws:iam::950110266426:role/service-role/Amazon_EventBridge_Invoke_Lambda_1719528660"
}
