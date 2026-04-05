resource "aws_iot_thing" "wearable" {
  provider = aws.us
  name     = "mediconnect-wearable"
}

resource "aws_iot_thing" "wearable_eu" {
  provider = aws.eu
  name     = "mediconnect-wearable"
}
