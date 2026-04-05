module "lambda_eu" {
  source = "../../modules/aws/lambda"

  providers = {
    aws = aws.eu
  }

  functions = {
    "mediconnect-cognito-triggers" = {
      runtime     = "nodejs22.x"
      timeout     = 30
      role_arn    = "arn:aws:iam::950110266426:role/mediconnect-lambda-shared-role"
      environment_variables = {
        COGNITO_CLIENT_ID_EU_STAFF  = "7dj5pa9m7nbrp7qs2fgua0gjv2"
        COGNITO_CLIENT_ID_EU_ADMIN  = "2eqol49qt7ctig16vsheee496f"
        COGNITO_CLIENT_ID_EU_DOCTOR = "4cmi171ll8dds2cfu26obila9g"
      }
    }

    "mediconnect-ws-authorizer" = {
      role_arn = "arn:aws:iam::950110266426:role/service-role/mediconnect-ws-authorizer-role-62a577ny"
      environment_variables = {
        COGNITO_CLIENT_ID_EU_PATIENT = "1erf0tklmpa0922e3p4eit8iqn"
        COGNITO_CLIENT_ID_EU_DOCTOR  = "4cmi171ll8dds2cfu26obila9g"
        COGNITO_USER_POOL_ID_EU      = "eu-central-1_5Fc7eFLB5"
      }
    }

    "mediconnect-failover-proxy" = {
      role_arn = "arn:aws:iam::950110266426:role/service-role/mediconnect-failover-proxy-role-jehbuy9v"
      environment_variables = {
        PRIMARY_BACKEND_URL = "https://api-eu.healthcodeanalysis.com/chat/ws-event"
        BACKUP_BACKEND_URL  = "https://communication-service-eu-backup-392747507374.europe-west3.run.app/chat/ws-event"
      }
    }

    "mediconnect-cleanup-recordings" = {
      role_arn = "arn:aws:iam::950110266426:role/service-role/mediconnect-cleanup-recordings-role-g9twqdgq"
      environment_variables = {
        TABLE_SESSIONS = "mediconnect-video-sessions"
      }
    }

    "mediconnect-auto-group-eu" = {
      role_arn = "arn:aws:iam::950110266426:role/service-role/mediconnect-auto-group-eu-role-ewcj2kcy"
      environment_variables = {
        DOCTOR_CLIENT_ID = "4cmi171ll8dds2cfu26obila9g"
      }
    }
  }
}
