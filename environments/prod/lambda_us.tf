module "lambda_us" {
  source = "../../modules/aws/lambda"

  providers = {
    aws = aws.us
  }

  functions = {
    "mediconnect-cognito-triggers" = {
      runtime     = "nodejs22.x"
      timeout     = 30
      role_arn    = "arn:aws:iam::950110266426:role/mediconnect-lambda-shared-role"
      environment_variables = {
        COGNITO_CLIENT_ID_US_ADMIN  = "3makppltr8e6eaanjab3e1lkh0"
        COGNITO_CLIENT_ID_US_STAFF  = "1rjvst6bo1o2sum28o4pvkf378"
        COGNITO_CLIENT_ID_US_DOCTOR = "6nsqer529j4c8gc688vflosomk"
      }
    }

    "mediconnect-ws-authorizer" = {
      role_arn = "arn:aws:iam::950110266426:role/service-role/mediconnect-ws-authorizer-role-5u712lso"
      environment_variables = {
        COGNITO_CLIENT_ID_US_PATIENT = "20lbag98p4vlj53eumfo11h7ac"
        COGNITO_USER_POOL_ID_US      = "us-east-1_fUsIfc7kL"
        COGNITO_CLIENT_ID_US_DOCTOR  = "6nsqer529j4c8gc688vflosomk"
      }
    }

    "mediconnect-failover-proxy" = {
      role_arn = "arn:aws:iam::950110266426:role/service-role/mediconnect-failover-proxy-role-enf1d6hy"
      environment_variables = {
        PRIMARY_BACKEND_URL = "https://api-us.healthcodeanalysis.com/chat/ws-event"
        BACKUP_BACKEND_URL  = "https://communication-service-us-backup-392747507374.us-central1.run.app/chat/ws-event"
      }
    }

    "mediconnect-cleanup-recordings" = {
      role_arn = "arn:aws:iam::950110266426:role/service-role/mediconnect-cleanup-recordings-role-i088yo9g"
      environment_variables = {
        TABLE_SESSIONS = "mediconnect-video-sessions"
      }
    }

    "mediconnect-auto-group-us" = {
      role_arn = "arn:aws:iam::950110266426:role/service-role/mediconnect-auto-group-us-role-msj8mvre"
      environment_variables = {
        DOCTOR_CLIENT_ID = "6nsqer529j4c8gc688vflosomk"
      }
    }
  }
}
