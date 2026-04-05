# ── US WebSocket API ─────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "ws_chat_us" {
  provider              = aws.us
  name                  = "mediconnect-ws-chat"
  protocol_type         = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

resource "aws_apigatewayv2_stage" "ws_chat_us_production" {
  provider = aws.us
  api_id   = aws_apigatewayv2_api.ws_chat_us.id
  name     = "production"
}

resource "aws_apigatewayv2_authorizer" "ws_us_authorizer" {
  provider                     = aws.us
  api_id                       = aws_apigatewayv2_api.ws_chat_us.id
  authorizer_type              = "REQUEST"
  authorizer_uri               = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:950110266426:function:mediconnect-ws-authorizer/invocations"
  name                         = "WSAuthorizer"
  identity_sources             = ["route.request.querystring.token"]
}

resource "aws_apigatewayv2_integration" "ws_us_failover" {
  provider             = aws.us
  api_id               = aws_apigatewayv2_api.ws_chat_us.id
  integration_type     = "AWS_PROXY"
  integration_method   = "POST"
  integration_uri      = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:950110266426:function:mediconnect-failover-proxy/invocations"
  content_handling_strategy = "CONVERT_TO_TEXT"
  passthrough_behavior = "WHEN_NO_MATCH"
}

resource "aws_apigatewayv2_route" "ws_us_connect" {
  provider  = aws.us
  api_id    = aws_apigatewayv2_api.ws_chat_us.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_us_failover.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.ws_us_authorizer.id

  lifecycle {
    ignore_changes = [target, route_response_selection_expression]
  }
}

resource "aws_apigatewayv2_route" "ws_us_disconnect" {
  provider  = aws.us
  api_id    = aws_apigatewayv2_api.ws_chat_us.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_us_failover.id}"

  lifecycle {
    ignore_changes = [target]
  }
}

resource "aws_apigatewayv2_route" "ws_us_send_message" {
  provider  = aws.us
  api_id    = aws_apigatewayv2_api.ws_chat_us.id
  route_key = "sendMessage"
  target    = "integrations/${aws_apigatewayv2_integration.ws_us_failover.id}"

  lifecycle {
    ignore_changes = [target]
  }
}

# ── EU WebSocket API ─────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "ws_chat_eu" {
  provider              = aws.eu
  name                  = "mediconnect-ws-chat"
  protocol_type         = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
}

resource "aws_apigatewayv2_stage" "ws_chat_eu_production" {
  provider = aws.eu
  api_id   = aws_apigatewayv2_api.ws_chat_eu.id
  name     = "production"
}

resource "aws_apigatewayv2_authorizer" "ws_eu_authorizer" {
  provider                     = aws.eu
  api_id                       = aws_apigatewayv2_api.ws_chat_eu.id
  authorizer_type              = "REQUEST"
  authorizer_uri               = "arn:aws:apigateway:eu-central-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-ws-authorizer/invocations"
  name                         = "WSAuthorizer"
  identity_sources             = ["route.request.querystring.token"]
}

resource "aws_apigatewayv2_integration" "ws_eu_failover" {
  provider             = aws.eu
  api_id               = aws_apigatewayv2_api.ws_chat_eu.id
  integration_type     = "AWS_PROXY"
  integration_method   = "POST"
  integration_uri      = "arn:aws:apigateway:eu-central-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-failover-proxy/invocations"
  content_handling_strategy = "CONVERT_TO_TEXT"
  passthrough_behavior = "WHEN_NO_MATCH"

  request_templates = {
    "application/json" = jsonencode({
      requestContext = {
        connectionId = "$context.connectionId"
        routeKey     = "$context.routeKey"
        authorizer = {
          sub   = "$context.authorizer.sub"
          email = "$context.authorizer.email"
          role  = "$context.authorizer.role"
        }
      }
    })
  }

  lifecycle {
    ignore_changes = [
      request_templates, # cosmetic JSON whitespace diff after import
    ]
  }
}

resource "aws_apigatewayv2_route" "ws_eu_connect" {
  provider  = aws.eu
  api_id    = aws_apigatewayv2_api.ws_chat_eu.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_eu_failover.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.ws_eu_authorizer.id

  lifecycle {
    ignore_changes = [target, route_response_selection_expression]
  }
}

resource "aws_apigatewayv2_route" "ws_eu_disconnect" {
  provider  = aws.eu
  api_id    = aws_apigatewayv2_api.ws_chat_eu.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_eu_failover.id}"

  lifecycle {
    ignore_changes = [target]
  }
}

resource "aws_apigatewayv2_route" "ws_eu_send_message" {
  provider  = aws.eu
  api_id    = aws_apigatewayv2_api.ws_chat_eu.id
  route_key = "sendMessage"
  target    = "integrations/${aws_apigatewayv2_integration.ws_eu_failover.id}"

  lifecycle {
    ignore_changes = [target]
  }
}
