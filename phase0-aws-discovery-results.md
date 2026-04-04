# Phase 0: AWS Cloud Discovery Results
Generated: 2026-04-04 19:04:53 UTC

## 0. Account Identity
### STS Caller Identity [global]
```
{
    "UserId": "AIDA52NX4EQ5OSXSK5T4E",
    "Account": "950110266426",
    "Arn": "arn:aws:iam::950110266426:user/terraform.admin"
}
```

## 1. DynamoDB Tables
### Table List [us-east-1]
```
{
    "TableNames": [
        "mediconnect-appointments",
        "mediconnect-audit-logs",
        "mediconnect-billing-audit",
        "mediconnect-booking-locks",
        "mediconnect-chat-connections",
        "mediconnect-chat-history",
        "mediconnect-clinical-notes",
        "mediconnect-content-cache",
        "mediconnect-doctor-schedules",
        "mediconnect-doctors",
        "mediconnect-drug-interactions",
        "mediconnect-graph-data",
        "mediconnect-health-records",
        "mediconnect-iot-vitals",
        "mediconnect-knowledge-base",
        "mediconnect-medical-records",
        "mediconnect-patients",
        "mediconnect-pharmacy-inventory",
        "mediconnect-predictions",
        "mediconnect-prescriptions",
        "mediconnect-symptom-logs",
        "mediconnect-transactions",
        "mediconnect-video-sessions"
    ]
}
```

#### mediconnect-appointments [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-appointments",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 20938,
        "ItemCount": 20,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments",
            "BillingMode": "PAY_PER_REQUEST",
        "GlobalSecondaryIndexes": [
                "KeySchema": [
                "ItemCount": 20,
                "KeySchema": [
                "ItemCount": 20,
                "KeySchema": [
                "ItemCount": 20,
        "StreamSpecification": {
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "appointmentId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "createdAt",
                "AttributeType": "S"
            },
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "status",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-appointments",
        "KeySchema": [
            {
                "AttributeName": "appointmentId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-06T13:12:09.539000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 20938,
        "ItemCount": 20,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments",
        "TableId": "da84a769-5d12-403d-a6e8-440642d50c98",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-06T13:12:09.539000+06:00"
        },
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "StatusIndex",
                "KeySchema": [
                    {
                        "AttributeName": "status",
                        "KeyType": "HASH"
                    },
                    {
                        "AttributeName": "createdAt",
                        "KeyType": "RANGE"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 20238,
                "ItemCount": 20,
                "IndexArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments/index/StatusIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            },
            {
                "IndexName": "DoctorIndex",
                "KeySchema": [
                    {
                        "AttributeName": "doctorId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 20238,
                "ItemCount": 20,
                "IndexArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments/index/DoctorIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            },
            {
                "IndexName": "PatientIndex",
                "KeySchema": [
                    {
                        "AttributeName": "patientId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 20238,
                "ItemCount": 20,
                "IndexArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments/index/PatientIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            }
        ],
        "StreamSpecification": {
            "StreamEnabled": true,
            "StreamViewType": "NEW_AND_OLD_IMAGES"
        },
        "LatestStreamLabel": "2026-02-20T08:12:32.625",
        "LatestStreamArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments/stream/2026-02-20T08:12:32.625",
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-appointments]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "ENABLED",
            "RecoveryPeriodInDays": 35,
            "EarliestRestorableDateTime": "2026-03-01T01:05:09.593000+06:00",
            "LatestRestorableDateTime": "2026-04-05T01:00:09.593000+06:00"
        }
    }
}
```
##### TTL [mediconnect-appointments]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-audit-logs [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-audit-logs",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 450287,
        "ItemCount": 601,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-audit-logs",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "logId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-audit-logs",
        "KeySchema": [
            {
                "AttributeName": "logId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-08T15:50:32.781000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 450287,
        "ItemCount": 601,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-audit-logs",
        "TableId": "2b6d060a-8bc6-426f-9c6b-82cd780b0787",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-08T15:50:32.781000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-audit-logs]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "ENABLED",
            "RecoveryPeriodInDays": 35,
            "EarliestRestorableDateTime": "2026-03-01T01:05:17.848000+06:00",
            "LatestRestorableDateTime": "2026-04-05T01:00:17.848000+06:00"
        }
    }
}
```
##### TTL [mediconnect-audit-logs]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "ENABLED",
        "AttributeName": "ttl"
    }
}
```

#### mediconnect-billing-audit [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-billing-audit",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 101,
        "ItemCount": 1,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-billing-audit",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "auditId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-billing-audit",
        "KeySchema": [
            {
                "AttributeName": "auditId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-12T13:40:57.134000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 101,
        "ItemCount": 1,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-billing-audit",
        "TableId": "8dd2c999-e2ed-423e-88ea-8479c6fa0a04",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-12T13:40:57.134000+06:00"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-billing-audit]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-billing-audit]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-booking-locks [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-booking-locks",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 3286,
        "ItemCount": 13,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-booking-locks",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "lockId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-booking-locks",
        "KeySchema": [
            {
                "AttributeName": "lockId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-11T13:17:07.315000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 3286,
        "ItemCount": 13,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-booking-locks",
        "TableId": "35c54307-4925-4e93-b367-950c3948561e",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-11T13:17:07.315000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-booking-locks]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-booking-locks]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-chat-connections [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-chat-connections",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 2509,
        "ItemCount": 32,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-chat-connections",
            "BillingMode": "PAY_PER_REQUEST",
        "GlobalSecondaryIndexes": [
                "KeySchema": [
                "ItemCount": 32,
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "connectionId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "userId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-chat-connections",
        "KeySchema": [
            {
                "AttributeName": "connectionId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-23T00:22:09.785000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 2509,
        "ItemCount": 32,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-chat-connections",
        "TableId": "cea8d861-dc23-4bd8-86f4-84662de8ff14",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-23T00:22:09.785000+06:00"
        },
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "UserIdIndex",
                "KeySchema": [
                    {
                        "AttributeName": "userId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 2509,
                "ItemCount": 32,
                "IndexArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-chat-connections/index/UserIdIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            }
        ],
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-chat-connections]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-chat-connections]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-chat-history [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-chat-history",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 8993,
        "ItemCount": 19,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-chat-history",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "conversationId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-chat-history",
        "KeySchema": [
            {
                "AttributeName": "conversationId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-23T00:43:38.932000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 8993,
        "ItemCount": 19,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-chat-history",
        "TableId": "87d35819-d9ce-41e6-8e59-d04fa6c3b551",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-23T00:43:38.932000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-chat-history]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-chat-history]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-clinical-notes [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-clinical-notes",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-clinical-notes",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-clinical-notes",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-26T11:18:54.496000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-clinical-notes",
        "TableId": "f8ac328a-d726-4ac3-919c-203734f1b87d",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-26T11:18:54.496000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-clinical-notes]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-clinical-notes]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-content-cache [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-content-cache",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-content-cache",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "cacheKey",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-content-cache",
        "KeySchema": [
            {
                "AttributeName": "cacheKey",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-11T21:14:08.262000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-content-cache",
        "TableId": "3d9667e0-55a9-43a2-9bce-d2d71b72a3bd",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-11T21:14:08.262000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-content-cache]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-content-cache]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "ENABLED",
        "AttributeName": "ttl"
    }
}
```

#### mediconnect-doctor-schedules [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-doctor-schedules",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-doctor-schedules",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-doctor-schedules",
        "KeySchema": [
            {
                "AttributeName": "doctorId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-11T03:58:31.087000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-doctor-schedules",
        "TableId": "f7dd2dac-09e7-4e86-b0c0-581274dc5e02",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-11T03:58:31.087000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-doctor-schedules]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-doctor-schedules]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-doctors [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-doctors",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 2534,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-doctors",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-doctors",
        "KeySchema": [
            {
                "AttributeName": "doctorId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T17:02:22.272000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 2534,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-doctors",
        "TableId": "e28435db-ef64-4688-9915-89ca91445fab",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T17:02:22.272000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-doctors]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-doctors]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-drug-interactions [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-drug-interactions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 81,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-drug-interactions",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "drugName",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-drug-interactions",
        "KeySchema": [
            {
                "AttributeName": "drugName",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-12T01:24:56.906000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 81,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-drug-interactions",
        "TableId": "8804e8b1-d31f-4f68-9e30-fe501f556d83",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-12T01:24:56.906000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-drug-interactions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-drug-interactions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-graph-data [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-graph-data",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 2198,
        "ItemCount": 12,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-graph-data",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "PK",
                "AttributeType": "S"
            },
            {
                "AttributeName": "SK",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-graph-data",
        "KeySchema": [
            {
                "AttributeName": "PK",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "SK",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-11T19:24:09.933000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 2198,
        "ItemCount": 12,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-graph-data",
        "TableId": "b0ddc52b-b70e-40ae-a965-f595be8d8d4e",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-11T19:24:09.933000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-graph-data]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-graph-data]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-health-records [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-health-records",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 5391,
        "ItemCount": 16,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-health-records",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "recordId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-health-records",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "recordId",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-07T15:32:32.131000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 5391,
        "ItemCount": 16,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-health-records",
        "TableId": "2a230019-8d3a-453f-8e63-a63bb0b3cb01",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-07T15:32:32.131000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-health-records]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-health-records]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-iot-vitals [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-iot-vitals",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 121,
        "ItemCount": 1,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-iot-vitals",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-iot-vitals",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-12T02:17:58.456000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 121,
        "ItemCount": 1,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-iot-vitals",
        "TableId": "67a6e6bc-f135-4086-9d68-c4f630c9126c",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-12T02:17:58.456000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-iot-vitals]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "ENABLED",
            "RecoveryPeriodInDays": 35,
            "EarliestRestorableDateTime": "2026-03-01T01:06:53.562000+06:00",
            "LatestRestorableDateTime": "2026-04-05T01:01:53.562000+06:00"
        }
    }
}
```
##### TTL [mediconnect-iot-vitals]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-knowledge-base [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-knowledge-base",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 7763,
        "ItemCount": 7,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-knowledge-base",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "topic",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-knowledge-base",
        "KeySchema": [
            {
                "AttributeName": "topic",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-12T17:09:57.406000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 7763,
        "ItemCount": 7,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-knowledge-base",
        "TableId": "ed13aa1a-19ad-46ce-9f5a-11547f1030f4",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-12T17:09:57.406000+06:00"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-knowledge-base]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-knowledge-base]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-medical-records [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-medical-records",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 2157,
        "ItemCount": 6,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-medical-records",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "recordId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-medical-records",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "recordId",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-07T12:25:10.933000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 2157,
        "ItemCount": 6,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-medical-records",
        "TableId": "44fafe40-2d1c-4da0-bf7d-e9f33959fc6c",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-07T12:25:10.933000+06:00"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-medical-records]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-medical-records]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-patients [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-patients",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 2478,
        "ItemCount": 4,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-patients",
            "BillingMode": "PAY_PER_REQUEST",
        "StreamSpecification": {
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-patients",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-06T11:33:49.151000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 2478,
        "ItemCount": 4,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-patients",
        "TableId": "bf931899-6b69-4a80-a4e2-8d03d8763faa",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-06T11:33:49.151000+06:00"
        },
        "StreamSpecification": {
            "StreamEnabled": true,
            "StreamViewType": "NEW_AND_OLD_IMAGES"
        },
        "LatestStreamLabel": "2026-01-12T13:16:04.199",
        "LatestStreamArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-patients/stream/2026-01-12T13:16:04.199",
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-patients]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "ENABLED",
            "RecoveryPeriodInDays": 35,
            "EarliestRestorableDateTime": "2026-03-01T01:07:17.401000+06:00",
            "LatestRestorableDateTime": "2026-04-05T01:02:17.401000+06:00"
        }
    }
}
```
##### TTL [mediconnect-patients]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-pharmacy-inventory [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-pharmacy-inventory",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 539,
        "ItemCount": 6,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-pharmacy-inventory",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "drugId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "pharmacyId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-pharmacy-inventory",
        "KeySchema": [
            {
                "AttributeName": "pharmacyId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "drugId",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-12T18:17:59.980000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 539,
        "ItemCount": 6,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-pharmacy-inventory",
        "TableId": "34354ae9-37c5-401b-98f1-2a6208523276",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-12T18:17:59.980000+06:00"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-pharmacy-inventory]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-pharmacy-inventory]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-predictions [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-predictions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 842,
        "ItemCount": 4,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-predictions",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "predictionId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-predictions",
        "KeySchema": [
            {
                "AttributeName": "predictionId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-12T15:51:50.640000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 842,
        "ItemCount": 4,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-predictions",
        "TableId": "8a771562-0b5d-4878-990a-8733ca2342c7",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-12T15:51:50.640000+06:00"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-predictions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-predictions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-prescriptions [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-prescriptions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 2083,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-prescriptions",
            "BillingMode": "PAY_PER_REQUEST",
        "GlobalSecondaryIndexes": [
                "KeySchema": [
                "ItemCount": 2,
                "KeySchema": [
                "ItemCount": 2,
        "StreamSpecification": {
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "prescriptionId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-prescriptions",
        "KeySchema": [
            {
                "AttributeName": "prescriptionId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-07T19:12:26.106000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 2083,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-prescriptions",
        "TableId": "dcd53155-90c3-4b1f-8603-0702dd377480",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-07T19:12:26.106000+06:00"
        },
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "DoctorIndex",
                "KeySchema": [
                    {
                        "AttributeName": "doctorId",
                        "KeyType": "HASH"
                    },
                    {
                        "AttributeName": "timestamp",
                        "KeyType": "RANGE"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 2083,
                "ItemCount": 2,
                "IndexArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-prescriptions/index/DoctorIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            },
            {
                "IndexName": "PatientIndex",
                "KeySchema": [
                    {
                        "AttributeName": "patientId",
                        "KeyType": "HASH"
                    },
                    {
                        "AttributeName": "timestamp",
                        "KeyType": "RANGE"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 2083,
                "ItemCount": 2,
                "IndexArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-prescriptions/index/PatientIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            }
        ],
        "StreamSpecification": {
            "StreamEnabled": true,
            "StreamViewType": "NEW_IMAGE"
        },
        "LatestStreamLabel": "2026-01-10T22:14:05.344",
        "LatestStreamArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-prescriptions/stream/2026-01-10T22:14:05.344",
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-prescriptions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-prescriptions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-symptom-logs [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-symptom-logs",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 3106,
        "ItemCount": 6,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-symptom-logs",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "sessionId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-symptom-logs",
        "KeySchema": [
            {
                "AttributeName": "sessionId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-07T15:51:19.951000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 3106,
        "ItemCount": 6,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-symptom-logs",
        "TableId": "574399ab-5ab7-45d5-a310-58ee6b8ce767",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-07T15:51:19.951000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-symptom-logs]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-symptom-logs]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-transactions [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-transactions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 10474,
        "ItemCount": 30,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-transactions",
            "BillingMode": "PAY_PER_REQUEST",
        "GlobalSecondaryIndexes": [
                "KeySchema": [
                "ItemCount": 30,
                "KeySchema": [
                "ItemCount": 30,
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "billId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "createdAt",
                "AttributeType": "S"
            },
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-transactions",
        "KeySchema": [
            {
                "AttributeName": "billId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-12T13:40:46.692000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 10474,
        "ItemCount": 30,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-transactions",
        "TableId": "22f2c6f4-cbca-454c-a9f0-75bb65a68fb5",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-12T13:40:46.692000+06:00"
        },
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "DoctorIndex",
                "KeySchema": [
                    {
                        "AttributeName": "doctorId",
                        "KeyType": "HASH"
                    },
                    {
                        "AttributeName": "createdAt",
                        "KeyType": "RANGE"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 9774,
                "ItemCount": 30,
                "IndexArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-transactions/index/DoctorIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            },
            {
                "IndexName": "PatientIndex",
                "KeySchema": [
                    {
                        "AttributeName": "patientId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 9774,
                "ItemCount": 30,
                "IndexArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-transactions/index/PatientIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            }
        ],
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-transactions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-transactions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-video-sessions [us-east-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-video-sessions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 14029,
        "ItemCount": 13,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-video-sessions",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "appointmentId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-video-sessions",
        "KeySchema": [
            {
                "AttributeName": "appointmentId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-01-07T11:59:47.613000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 14029,
        "ItemCount": 13,
        "TableArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-video-sessions",
        "TableId": "376db0e7-afd7-4a45-8cfa-ad9743850ea5",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-01-07T11:59:47.613000+06:00"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-video-sessions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-video-sessions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "ENABLED",
        "AttributeName": "ttl"
    }
}
```

### Table List [eu-central-1]
```
{
    "TableNames": [
        "mediconnect-appointments",
        "mediconnect-audit-logs",
        "mediconnect-billing-audit",
        "mediconnect-booking-locks",
        "mediconnect-chat-connections",
        "mediconnect-chat-history",
        "mediconnect-clinical-notes",
        "mediconnect-content-cache",
        "mediconnect-doctor-schedules",
        "mediconnect-doctors",
        "mediconnect-drug-interactions",
        "mediconnect-graph-data",
        "mediconnect-health-records",
        "mediconnect-iot-vitals",
        "mediconnect-knowledge-base",
        "mediconnect-medical-records",
        "mediconnect-patients",
        "mediconnect-pharmacy-inventory",
        "mediconnect-predictions",
        "mediconnect-prescriptions",
        "mediconnect-symptom-logs",
        "mediconnect-transactions",
        "mediconnect-video-sessions"
    ]
}
```

#### mediconnect-appointments [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-appointments",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 22747,
        "ItemCount": 10,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-appointments",
            "BillingMode": "PAY_PER_REQUEST",
        "GlobalSecondaryIndexes": [
                "KeySchema": [
                "ItemCount": 10,
                "KeySchema": [
                "ItemCount": 10,
                "KeySchema": [
                "ItemCount": 10,
        "StreamSpecification": {
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "appointmentId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "createdAt",
                "AttributeType": "S"
            },
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "status",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-appointments",
        "KeySchema": [
            {
                "AttributeName": "appointmentId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T02:52:08.108000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 22747,
        "ItemCount": 10,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-appointments",
        "TableId": "48b618c7-1dd7-4f6f-b96d-6cfa24b3a718",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T02:52:08.108000+06:00"
        },
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "StatusIndex",
                "KeySchema": [
                    {
                        "AttributeName": "status",
                        "KeyType": "HASH"
                    },
                    {
                        "AttributeName": "createdAt",
                        "KeyType": "RANGE"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 22397,
                "ItemCount": 10,
                "IndexArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-appointments/index/StatusIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            },
            {
                "IndexName": "DoctorIndex",
                "KeySchema": [
                    {
                        "AttributeName": "doctorId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 22397,
                "ItemCount": 10,
                "IndexArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-appointments/index/DoctorIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            },
            {
                "IndexName": "PatientIndex",
                "KeySchema": [
                    {
                        "AttributeName": "patientId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 22397,
                "ItemCount": 10,
                "IndexArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-appointments/index/PatientIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            }
        ],
        "StreamSpecification": {
            "StreamEnabled": true,
            "StreamViewType": "NEW_AND_OLD_IMAGES"
        },
        "LatestStreamLabel": "2026-02-20T08:12:59.559",
        "LatestStreamArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-appointments/stream/2026-02-20T08:12:59.559",
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-appointments]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "ENABLED",
            "RecoveryPeriodInDays": 35,
            "EarliestRestorableDateTime": "2026-03-01T01:08:14.607000+06:00",
            "LatestRestorableDateTime": "2026-04-05T01:03:14.607000+06:00"
        }
    }
}
```
##### TTL [mediconnect-appointments]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-audit-logs [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-audit-logs",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 910204,
        "ItemCount": 1241,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-audit-logs",
            "BillingMode": "PAY_PER_REQUEST",
        "SSEDescription": {
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "logId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-audit-logs",
        "KeySchema": [
            {
                "AttributeName": "logId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T02:51:19.060000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 910204,
        "ItemCount": 1241,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-audit-logs",
        "TableId": "7a48a1e6-4633-40fc-a720-01785e12bc15",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T02:51:19.060000+06:00"
        },
        "SSEDescription": {
            "Status": "ENABLED",
            "SSEType": "KMS",
            "KMSMasterKeyArn": "arn:aws:kms:eu-central-1:950110266426:key/ad59022a-8fe7-4159-a1c3-181877f9d4d0"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-audit-logs]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "ENABLED",
            "RecoveryPeriodInDays": 35,
            "EarliestRestorableDateTime": "2026-03-01T01:08:20.912000+06:00",
            "LatestRestorableDateTime": "2026-04-05T01:03:20.912000+06:00"
        }
    }
}
```
##### TTL [mediconnect-audit-logs]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "ENABLED",
        "AttributeName": "ttl"
    }
}
```

#### mediconnect-billing-audit [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-billing-audit",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-billing-audit",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "auditId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-billing-audit",
        "KeySchema": [
            {
                "AttributeName": "auditId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-03-06T12:21:08.145000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-billing-audit",
        "TableId": "c2d0e6dc-c63a-478d-82a7-c25af4f7b03e",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-03-06T12:21:08.145000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-billing-audit]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-billing-audit]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-booking-locks [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-booking-locks",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 1518,
        "ItemCount": 6,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-booking-locks",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "lockId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-booking-locks",
        "KeySchema": [
            {
                "AttributeName": "lockId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-25T16:21:20.145000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 1518,
        "ItemCount": 6,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-booking-locks",
        "TableId": "14fcec9e-d0aa-425d-a2cf-fe1c5164af65",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-25T16:21:20.145000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-booking-locks]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-booking-locks]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-chat-connections [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-chat-connections",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-chat-connections",
            "BillingMode": "PAY_PER_REQUEST",
        "GlobalSecondaryIndexes": [
                "KeySchema": [
                "ItemCount": 0,
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "connectionId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "userId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-chat-connections",
        "KeySchema": [
            {
                "AttributeName": "connectionId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-03-06T12:22:06.951000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-chat-connections",
        "TableId": "4e744fd3-8928-4144-b1f1-c41302cf45a6",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-03-06T12:22:06.951000+06:00"
        },
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "UserIdIndex",
                "KeySchema": [
                    {
                        "AttributeName": "userId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 0,
                "ItemCount": 0,
                "IndexArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-chat-connections/index/UserIdIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            }
        ],
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-chat-connections]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-chat-connections]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-chat-history [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-chat-history",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-chat-history",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "conversationId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-chat-history",
        "KeySchema": [
            {
                "AttributeName": "conversationId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-22T17:21:22.601000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-chat-history",
        "TableId": "f7a1164c-b2fb-4a48-b698-ef3f0237f558",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-22T17:21:22.601000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-chat-history]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-chat-history]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-clinical-notes [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-clinical-notes",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-clinical-notes",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-clinical-notes",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-03-06T12:24:34.392000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-clinical-notes",
        "TableId": "4b15b053-8491-4ad4-b55c-c7131fdcff7d",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-03-06T12:24:34.392000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-clinical-notes]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-clinical-notes]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-content-cache [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-content-cache",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-content-cache",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "cacheKey",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-content-cache",
        "KeySchema": [
            {
                "AttributeName": "cacheKey",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-03-06T12:25:20.879000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-content-cache",
        "TableId": "a7112dc3-3cc3-4c65-aba6-08e0e65dc9f2",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-03-06T12:25:20.879000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-content-cache]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-content-cache]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-doctor-schedules [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-doctor-schedules",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-doctor-schedules",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-doctor-schedules",
        "KeySchema": [
            {
                "AttributeName": "doctorId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-25T16:22:00.323000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-doctor-schedules",
        "TableId": "56b7abd2-4293-4f3f-86fb-00172d76e83d",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-25T16:22:00.323000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-doctor-schedules]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-doctor-schedules]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-doctors [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-doctors",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 3460,
        "ItemCount": 3,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-doctors",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-doctors",
        "KeySchema": [
            {
                "AttributeName": "doctorId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T17:06:03.728000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 3460,
        "ItemCount": 3,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-doctors",
        "TableId": "78c9982c-5f25-421a-b7be-2d2f0e7f162f",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T17:06:03.728000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-doctors]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-doctors]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-drug-interactions [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-drug-interactions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-drug-interactions",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "drugName",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-drug-interactions",
        "KeySchema": [
            {
                "AttributeName": "drugName",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T17:10:22.232000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-drug-interactions",
        "TableId": "9703630a-e8f7-4ba7-9ef9-43e46d5c79ab",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T17:10:22.232000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-drug-interactions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-drug-interactions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-graph-data [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-graph-data",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 437,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-graph-data",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "PK",
                "AttributeType": "S"
            },
            {
                "AttributeName": "SK",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-graph-data",
        "KeySchema": [
            {
                "AttributeName": "PK",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "SK",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T17:09:34.618000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 437,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-graph-data",
        "TableId": "ba460d03-fb56-43f1-a10f-665a720388d5",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T17:09:34.618000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-graph-data]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-graph-data]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-health-records [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-health-records",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-health-records",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "recordId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-health-records",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "recordId",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T17:08:36.228000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-health-records",
        "TableId": "1497bd5c-e7cf-445d-9c29-62105c38c93a",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T17:08:36.228000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-health-records]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-health-records]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-iot-vitals [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-iot-vitals",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-iot-vitals",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-iot-vitals",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T02:51:48.661000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-iot-vitals",
        "TableId": "56d77421-de56-439c-b4a1-6f97bf00063a",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T02:51:48.661000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-iot-vitals]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "ENABLED",
            "RecoveryPeriodInDays": 35,
            "EarliestRestorableDateTime": "2026-03-01T01:09:36.292000+06:00",
            "LatestRestorableDateTime": "2026-04-05T01:04:36.292000+06:00"
        }
    }
}
```
##### TTL [mediconnect-iot-vitals]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-knowledge-base [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-knowledge-base",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-knowledge-base",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "topic",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-knowledge-base",
        "KeySchema": [
            {
                "AttributeName": "topic",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T14:15:48.056000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-knowledge-base",
        "TableId": "22aadcb4-362e-4613-b368-264a28c0fffb",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T14:15:48.056000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-knowledge-base]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-knowledge-base]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-medical-records [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-medical-records",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-medical-records",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "recordId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-medical-records",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "recordId",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-03-06T12:27:58.843000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-medical-records",
        "TableId": "713b12b8-09df-410c-99bc-8b56e63589a6",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-03-06T12:27:58.843000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-medical-records]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-medical-records]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-patients [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-patients",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 1243,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-patients",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-patients",
        "KeySchema": [
            {
                "AttributeName": "patientId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T02:50:47.444000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 1243,
        "ItemCount": 2,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-patients",
        "TableId": "78676050-1dbd-4c94-8d7a-06a485913ecc",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T02:50:47.444000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-patients]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "ENABLED",
            "RecoveryPeriodInDays": 35,
            "EarliestRestorableDateTime": "2026-03-01T01:09:55.040000+06:00",
            "LatestRestorableDateTime": "2026-04-05T01:04:55.040000+06:00"
        }
    }
}
```
##### TTL [mediconnect-patients]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-pharmacy-inventory [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-pharmacy-inventory",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-pharmacy-inventory",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "drugId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "pharmacyId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-pharmacy-inventory",
        "KeySchema": [
            {
                "AttributeName": "pharmacyId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "drugId",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T17:11:05.745000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-pharmacy-inventory",
        "TableId": "0b0a11ae-ba45-44bc-a88e-2fd3f5026931",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T17:11:05.745000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-pharmacy-inventory]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-pharmacy-inventory]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-predictions [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-predictions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-predictions",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "predictionId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-predictions",
        "KeySchema": [
            {
                "AttributeName": "predictionId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-03-06T12:28:40.490000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-predictions",
        "TableId": "577c71c6-bae1-43fc-81e3-9a6b9e7ce40f",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-03-06T12:28:40.490000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-predictions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-predictions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-prescriptions [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-prescriptions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-prescriptions",
            "BillingMode": "PAY_PER_REQUEST",
        "GlobalSecondaryIndexes": [
                "KeySchema": [
                "ItemCount": 0,
                "KeySchema": [
                "ItemCount": 0,
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "prescriptionId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-prescriptions",
        "KeySchema": [
            {
                "AttributeName": "prescriptionId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T17:07:00.475000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-prescriptions",
        "TableId": "6ecdfde3-9318-4c7d-b799-ad4b6c452176",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T17:07:00.475000+06:00"
        },
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "DoctorIndex",
                "KeySchema": [
                    {
                        "AttributeName": "doctorId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 0,
                "ItemCount": 0,
                "IndexArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-prescriptions/index/DoctorIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            },
            {
                "IndexName": "PatientIndex",
                "KeySchema": [
                    {
                        "AttributeName": "patientId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 0,
                "ItemCount": 0,
                "IndexArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-prescriptions/index/PatientIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            }
        ],
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-prescriptions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-prescriptions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-symptom-logs [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-symptom-logs",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-symptom-logs",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "sessionId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "timestamp",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-symptom-logs",
        "KeySchema": [
            {
                "AttributeName": "sessionId",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "timestamp",
                "KeyType": "RANGE"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-03-06T12:29:37.782000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-symptom-logs",
        "TableId": "bcd64f14-39d6-4e07-b052-37d7f3cd7921",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-03-06T12:29:37.782000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-symptom-logs]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-symptom-logs]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-transactions [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-transactions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 4886,
        "ItemCount": 14,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-transactions",
            "BillingMode": "PAY_PER_REQUEST",
        "GlobalSecondaryIndexes": [
                "KeySchema": [
                "ItemCount": 14,
                "KeySchema": [
                "ItemCount": 14,
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "billId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "createdAt",
                "AttributeType": "S"
            },
            {
                "AttributeName": "doctorId",
                "AttributeType": "S"
            },
            {
                "AttributeName": "patientId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-transactions",
        "KeySchema": [
            {
                "AttributeName": "billId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-02-20T17:09:11.507000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 4886,
        "ItemCount": 14,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-transactions",
        "TableId": "4f7a5380-7118-49c2-9f47-a30aae2c3b26",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-02-20T17:09:11.507000+06:00"
        },
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "DoctorIndex",
                "KeySchema": [
                    {
                        "AttributeName": "doctorId",
                        "KeyType": "HASH"
                    },
                    {
                        "AttributeName": "createdAt",
                        "KeyType": "RANGE"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 4536,
                "ItemCount": 14,
                "IndexArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-transactions/index/DoctorIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            },
            {
                "IndexName": "PatientIndex",
                "KeySchema": [
                    {
                        "AttributeName": "patientId",
                        "KeyType": "HASH"
                    }
                ],
                "Projection": {
                    "ProjectionType": "ALL"
                },
                "IndexStatus": "ACTIVE",
                "ProvisionedThroughput": {
                    "NumberOfDecreasesToday": 0,
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0
                },
                "IndexSizeBytes": 4536,
                "ItemCount": 14,
                "IndexArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-transactions/index/PatientIndex",
                "WarmThroughput": {
                    "ReadUnitsPerSecond": 12000,
                    "WriteUnitsPerSecond": 4000,
                    "Status": "ACTIVE"
                }
            }
        ],
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-transactions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-transactions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

#### mediconnect-video-sessions [eu-central-1]
```json
        "AttributeDefinitions": [
        "TableName": "mediconnect-video-sessions",
        "KeySchema": [
        "TableStatus": "ACTIVE",
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-video-sessions",
            "BillingMode": "PAY_PER_REQUEST",
        "DeletionProtectionEnabled": false,

{
    "Table": {
        "AttributeDefinitions": [
            {
                "AttributeName": "appointmentId",
                "AttributeType": "S"
            }
        ],
        "TableName": "mediconnect-video-sessions",
        "KeySchema": [
            {
                "AttributeName": "appointmentId",
                "KeyType": "HASH"
            }
        ],
        "TableStatus": "ACTIVE",
        "CreationDateTime": "2026-03-06T12:30:17.347000+06:00",
        "ProvisionedThroughput": {
            "NumberOfDecreasesToday": 0,
            "ReadCapacityUnits": 0,
            "WriteCapacityUnits": 0
        },
        "TableSizeBytes": 0,
        "ItemCount": 0,
        "TableArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-video-sessions",
        "TableId": "c95fbac0-530c-4fcc-a7ed-ea5ae4a5c3ae",
        "BillingModeSummary": {
            "BillingMode": "PAY_PER_REQUEST",
            "LastUpdateToPayPerRequestDateTime": "2026-03-06T12:30:17.347000+06:00"
        },
        "TableClassSummary": {
            "TableClass": "STANDARD"
        },
        "DeletionProtectionEnabled": false,
        "WarmThroughput": {
            "ReadUnitsPerSecond": 12000,
            "WriteUnitsPerSecond": 4000,
            "Status": "ACTIVE"
        }
    }
}
```

##### PITR [mediconnect-video-sessions]
```
{
    "ContinuousBackupsDescription": {
        "ContinuousBackupsStatus": "ENABLED",
        "PointInTimeRecoveryDescription": {
            "PointInTimeRecoveryStatus": "DISABLED"
        }
    }
}
```
##### TTL [mediconnect-video-sessions]
```
{
    "TimeToLiveDescription": {
        "TimeToLiveStatus": "DISABLED"
    }
}
```

## 2. S3 Buckets
### Bucket List [global]
```
{
    "Buckets": [
        {
            "Name": "mediconnect-audit-logs-950110266426",
            "CreationDate": "2026-01-12T13:03:53+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-audit-logs-950110266426"
        },
        {
            "Name": "mediconnect-audit-logs-950110266426-dr",
            "CreationDate": "2026-01-12T13:15:47+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-audit-logs-950110266426-dr"
        },
        {
            "Name": "mediconnect-cicd-950110266426",
            "CreationDate": "2026-01-12T13:43:48+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-cicd-950110266426"
        },
        {
            "Name": "mediconnect-consultation-files",
            "CreationDate": "2026-01-11T12:41:12+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-consultation-files"
        },
        {
            "Name": "mediconnect-consultation-recordings",
            "CreationDate": "2026-01-11T08:33:48+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-consultation-recordings"
        },
        {
            "Name": "mediconnect-consultation-recordings-eu",
            "CreationDate": "2026-02-22T11:27:21+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-consultation-recordings-eu"
        },
        {
            "Name": "mediconnect-datalake-950110266426",
            "CreationDate": "2026-01-12T09:13:00+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-datalake-950110266426"
        },
        {
            "Name": "mediconnect-doctor-data",
            "CreationDate": "2026-03-11T21:42:28+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-doctor-data"
        },
        {
            "Name": "mediconnect-doctor-data-eu",
            "CreationDate": "2026-03-10T01:28:36+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-doctor-data-eu"
        },
        {
            "Name": "mediconnect-ehr-records",
            "CreationDate": "2026-01-07T09:23:51+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-ehr-records"
        },
        {
            "Name": "mediconnect-ehr-records-eu",
            "CreationDate": "2026-02-20T11:13:45+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-ehr-records-eu"
        },
        {
            "Name": "mediconnect-media-assets",
            "CreationDate": "2026-01-05T04:05:17+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-media-assets"
        },
        {
            "Name": "mediconnect-medical-images",
            "CreationDate": "2026-01-11T17:34:57+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-medical-images"
        },
        {
            "Name": "mediconnect-medical-images-eu",
            "CreationDate": "2026-03-15T07:09:32+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-medical-images-eu"
        },
        {
            "Name": "mediconnect-patient-data",
            "CreationDate": "2026-03-11T21:42:46+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-patient-data"
        },
        {
            "Name": "mediconnect-patient-data-eu",
            "CreationDate": "2026-03-10T01:29:03+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-patient-data-eu"
        },
        {
            "Name": "mediconnect-prescriptions",
            "CreationDate": "2026-01-11T19:30:23+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-prescriptions"
        },
        {
            "Name": "mediconnect-prescriptions-eu",
            "CreationDate": "2026-02-20T11:13:22+00:00",
            "BucketArn": "arn:aws:s3:::mediconnect-prescriptions-eu"
        }
    ],
    "Owner": {
        "ID": "a76f3e9e139510f8a4b60b9c8601b50da2245085dc2efd8e45210ef73e13bf07"
    },
    "Prefix": null
}
```

### mediconnect-audit-logs-950110266426
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
{
    "Status": "Enabled"
}
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": false
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
### mediconnect-audit-logs-950110266426-dr
#### Location
```
{
    "LocationConstraint": "us-west-2"
}
```
#### Versioning
```
{
    "Status": "Enabled"
}
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": false
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-cicd-950110266426
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
{
    "Status": "Enabled"
}
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": false
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-consultation-files
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-consultation-recordings
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-consultation-recordings-eu
#### Location
```
{
    "LocationConstraint": "eu-central-1"
}
```
#### Versioning
```
{
    "Status": "Enabled"
}
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-datalake-950110266426
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": false
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-doctor-data
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "PUT",
                "POST",
                "DELETE",
                "HEAD"
            ],
            "AllowedOrigins": [
                "*"
            ],
            "ExposeHeaders": [
                "ETag",
                "x-amz-server-side-encryption",
                "x-amz-request-id",
                "x-amz-id-2"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
```
#### Lifecycle
```
{
    "TransitionDefaultMinimumObjectSize": "all_storage_classes_128K",
    "Rules": [
        {
            "Expiration": {
                "Days": 1
            },
            "ID": "Delete-Doctor-Biometrics-Immediately",
            "Filter": {
                "And": {
                    "Prefix": "doctor/",
                    "Tags": [
                        {
                            "Key": "DataType",
                            "Value": "Biometric"
                        }
                    ]
                }
            },
            "Status": "Enabled"
        },
        {
            "Expiration": {
                "Days": 2555
            },
            "ID": "7-Year-Doctor-Retention-Purge",
            "Filter": {
                "And": {
                    "Prefix": "doctor/",
                    "Tags": [
                        {
                            "Key": "Status",
                            "Value": "Deleted"
                        },
                        {
                            "Key": "RetentionPeriod",
                            "Value": "7Years"
                        }
                    ]
                }
            },
            "Status": "Enabled"
        }
    ]
}
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-doctor-data-eu
#### Location
```
{
    "LocationConstraint": "eu-central-1"
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "PUT",
                "POST",
                "DELETE",
                "HEAD"
            ],
            "AllowedOrigins": [
                "*"
            ],
            "ExposeHeaders": [
                "ETag",
                "x-amz-server-side-encryption",
                "x-amz-request-id",
                "x-amz-id-2"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
```
#### Lifecycle
```
{
    "TransitionDefaultMinimumObjectSize": "all_storage_classes_128K",
    "Rules": [
        {
            "Expiration": {
                "Days": 1
            },
            "ID": "Delete-Doctor-Biometrics-Immediately",
            "Filter": {
                "And": {
                    "Prefix": "doctor/",
                    "Tags": [
                        {
                            "Key": "DataType",
                            "Value": "Biometric"
                        }
                    ]
                }
            },
            "Status": "Enabled"
        },
        {
            "Expiration": {
                "Days": 2555
            },
            "ID": "7-Year-Doctor-Retention-Purge",
            "Filter": {
                "And": {
                    "Prefix": "doctor/",
                    "Tags": [
                        {
                            "Key": "Status",
                            "Value": "Deleted"
                        },
                        {
                            "Key": "RetentionPeriod",
                            "Value": "7Years"
                        }
                    ]
                }
            },
            "Status": "Enabled"
        }
    ]
}
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-ehr-records
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "PUT",
                "GET",
                "HEAD"
            ],
            "AllowedOrigins": [
                "*"
            ],
            "ExposeHeaders": [
                "ETag"
            ]
        }
    ]
}
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-ehr-records-eu
#### Location
```
{
    "LocationConstraint": "eu-central-1"
}
```
#### Versioning
```
{
    "Status": "Enabled"
}
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "HEAD"
            ],
            "AllowedOrigins": [
                "*"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-media-assets
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": false,
        "IgnorePublicAcls": false,
        "BlockPublicPolicy": false,
        "RestrictPublicBuckets": false
    }
}
```
#### CORS
```
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "PUT",
                "POST",
                "DELETE"
            ],
            "AllowedOrigins": [
                "*"
            ],
            "ExposeHeaders": [
                "ETag"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```
{
    "Policy": "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"PublicRead\",\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::mediconnect-media-assets/*\"}]}"
}
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-medical-images
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-medical-images-eu
#### Location
```
{
    "LocationConstraint": "eu-central-1"
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```

An error occurred (NoSuchCORSConfiguration) when calling the GetBucketCors operation: The CORS configuration does not exist
```
#### Lifecycle
```

An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-patient-data
#### Location
```
{
    "LocationConstraint": null
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "PUT",
                "POST",
                "DELETE",
                "HEAD"
            ],
            "AllowedOrigins": [
                "*"
            ],
            "ExposeHeaders": [
                "ETag",
                "x-amz-server-side-encryption",
                "x-amz-request-id",
                "x-amz-id-2"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
```
#### Lifecycle
```
{
    "TransitionDefaultMinimumObjectSize": "all_storage_classes_128K",
    "Rules": [
        {
            "Expiration": {
                "Days": 1
            },
            "ID": "delete-patient-id-after-24h",
            "Filter": {
                "And": {
                    "Prefix": "patient/",
                    "Tags": [
                        {
                            "Key": "auto-delete",
                            "Value": "true"
                        }
                    ]
                }
            },
            "Status": "Enabled"
        }
    ]
}
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-patient-data-eu
#### Location
```
{
    "LocationConstraint": "eu-central-1"
}
```
#### Versioning
```
```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "AES256"
                },
                "BucketKeyEnabled": true
            }
        ]
    }
}
```
#### Public Access Block
```
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "PUT",
                "POST",
                "DELETE",
                "HEAD"
            ],
            "AllowedOrigins": [
                "*"
            ],
            "ExposeHeaders": [
                "ETag",
                "x-amz-server-side-encryption",
                "x-amz-request-id",
                "x-amz-id-2"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
```
#### Lifecycle
```
{
    "TransitionDefaultMinimumObjectSize": "all_storage_classes_128K",
    "Rules": [
        {
            "Expiration": {
                "Days": 1
            },
            "ID": "delete-patient-id-after-24h",
            "Filter": {
                "And": {
                    "Prefix": "patient/",
                    "Tags": [
                        {
                            "Key": "auto-delete",
                            "Value": "true"
                        }
                    ]
                }
            },
            "Status": "Enabled"
        }
    ]
}
```
#### Policy
```

An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication operation: The replication configuration was not found
```
#### Tags
```

An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
```

### mediconnect-prescriptions-eu
#### Location
```
{
    "LocationConstraint": "eu-central-1"
}
`
[
    "Amazon_EventBrid{
    "Status": "Enabled"
}
    "Amazon_EventBridge_Invoke_Lambda_1719528660",
    "Amazon_EventBridge_Scheduler_LAMBDA_cf1b8a171e",
    "AWSIoTLoggingRole",
    "AWSServiceRoleForAmazonEKS",
    "AWSServiceRoleForAmazonEKSNodegroup",
    "AWSServiceRoleForAPIGateway",
    "AWSServiceRoleForAutoScaling",
    "AWSServiceRoleForECS",
    "AWSServiceRoleForElasticLoadBalancing",
    "AWSServiceRoleForRDS",
    "AWSServiceRoleForResourceExplorer",
    "AWSServiceRoleForSupport",
    "AWSServiceRoleForTrustedAdvisor",
    "Azure-to-AWS-Bridge-Role",
    "Cognito_MediconnectIdentityPoolEU_Auth_Role",
    "Cognito_MediconnectIdentityPoolUS_Auth_Role",
    "eksctl-mediconnect-eks-eu-cluster-ServiceRole-VSbZ5eHaoWl0",
    "eksctl-mediconnect-eks-eu-nodegrou-NodeInstanceRole-F7QXo0jgDluv",
    "GitHubActionsRole",
    "IoTDynamoRole",
    "IoTSNSRole",
    "mediconnect-admin-role",
    "mediconnect-auto-group-eu-role-ewcj2kcy",
    "mediconnect-auto-group-us-role-msj8mvre",
    "mediconnect-azure-role-us",
    "mediconnect-billing-service-role-rfaptbgu",
    "mediconnect-book-appointment-role-q8q3s008",
    "mediconnect-booking-role",
    "mediconnect-cancel-appointment-role-43pkwks2",
    "mediconnect-cleanup-recordings-role-g9twqdgq",
    "mediconnect-cleanup-recordings-role-i088yo9g",
    "mediconnect-cleanup-service-role-6p3uo83y",
    "mediconnect-comm-role",
    "mediconnect-create-doctor-role-7vu5yt62",
    "mediconnect-create-patient-role-a2tin7y6",
    "mediconnect-dicom-role",
    "mediconnect-doctor-role",
    "mediconnect-ehr-service-role-qu55gdhw",
    "mediconnect-eks-pod-role",
    "mediconnect-failover-proxy-role-enf1d6hy",
    "mediconnect-failover-proxy-role-jehbuy9v",
    "mediconnect-file-sharing-service-role-yv0v6kc2",
    "mediconnect-get-appointments-role-8f7rs7ve",
    "mediconnect-get-doctors-role-bgepsu8i",
    "mediconnect-get-patients-role-4p2aska2",
    "mediconnect-get-vitals-role-vttgimn7",
    "mediconnect-graph-service-role-50gdzyo0",
    "mediconnect-imaging-service-role-genwi8el",
    "mediconnect-iot-gcp-sync-role-benw9tph",
    "mediconnect-lambda-shared-role",
    "mediconnect-migration-role",
    "mediconnect-patient-role",
    "mediconnect-prescription-service-role-5pr8s84o",
    "mediconnect-staff-role",
    "mediconnect-stream-to-bigquery-role-rht3ozce",
    "mediconnect-symptom-checker-role-hmvxvqh5",
    "mediconnect-update-schedule-role-ul1us2xa",
    "mediconnect-websocket-handler-role-ibksgcey",
    "mediconnect-ws-authorizer-role-5u712lso",
    "mediconnect-ws-authorizer-role-62a577ny",
    "MediconnectAnalyticsRole",
    "MediconnectBillingRole",
    "MediconnectBuildRole",
    "MediConnectDoctorVerificationRole",
    "MediConnectEmergencyRole",
    "MediconnectLambdaRole",
    "MediconnectPipelineRole",
    "MediconnectReplicationRole",
    "verify-identity-role-nc0fd8xw"
]
```

```
#### Encryption
```
{
    "ServerSideEncryptionConfiguration": {
        "Rules": [
            {{
    "AttachedPolicies": [
        {
            "PolicyName": "Cognito-authenticated-1771840629369",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/Cognito-authenticated-1771840629369"
        }
    ]
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```
#### CORS
```
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "HEAD"
            ],
            "AllowedOrigins": [
                "*"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
wAuthenticatedUploadsToOwnFolders",
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:PutObjectTagging",
                    "s3:PutObjectVersionTagging",
                    "s3:GetObject"
                ],
                "Resource": [
                    "arn:aws:s3:::mediconnect-patient-data/patient/*",
                    "arn:aws:s3:::mediconnect-patient-data-eu/patient/*",
                    "arn:aws:s3:::mediconnect-doctor-data/doctor/*",
                    "arn:aws:s3:::mediconnect-doctor-data-eu/doctor/*"
                ]
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012
An error occurred (NoSuchLifecycleConfiguration) when calling the GetBucketLifecycleConfiguration operation: The lifecycle configuration does not exist
ws.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "cognito-identity.amazonaws.com:aud": "eu-central-1:5a8cd657-bd0b-41d3-b53c-eda640bf8e0f"
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "authenticated"
                }
            }
        }
    ]
}
```

### Role: Cognito_MediconnectIdentityPoolUS_Auth_Role
#### Attached Policies
```
{
    "AttachedPoli
An error occurred (NoSuchBucketPolicy) when calling the GetBucketPolicy operation: The bucket policy does not exist
s:iam::950110266426:policy/service-role/Cognito-authenticated-1771840544377"
        }
    ]
}
```
#### Inline Policies
```
```
#### Replication
```

An error occurred (ReplicationConfigurationNotFoundError) when calling the GetBucketReplication {
    "RoleName": "Cognito_MediconnectIdentityPoolUS_Auth_Role",
    "Po
An error occurred (NoSuchTagSet) when calling the GetBucketTagging operation: The TagSet does not exist
: [
            {
                "Sid": "AllowAuthenticatedUploadsToOwnFolders",
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:PutObjectTagging",
                    "s3:PutObjectVersionTagging",
                    "s3:GetObject"
                ],
                "Resource": [
                    "arn:aws:s3:::mediconnect-patient-data/patient/*",
                    "arn:aws:s3:::mediconnect-patient-data-eu/patient/*",
                    "arn:aws:s3:::mediconnect-doctor-data/doctor/*",
                    "arn:aws:s3:::mediconnect-doctor-data-eu/doctor/*"
                ]
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "cognito-identity.amazonaws.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "cognito-identity.amazonaws.com:aud": "us-east-1:23609247-ceb3-4fc8-88b7-af68aaa40a30"
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "authenticated"
                }
            }
        }
    ]
}
```

### Role: eksctl-mediconnect-eks-eu-cluster-ServiceRole-VSbZ5eHaoWl0
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonEKSClusterPolicy",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
        },
        {
            "PolicyName": "AmazonEKSVPCResourceController",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "eks.amazonaws.com"
            },
            "Action": [
                "sts:AssumeRole",
                "sts:TagSession"
            ]
        }
    ]
}
```

### Role: eksctl-mediconnect-eks-eu-nodegrou-NodeInstanceRole-F7QXo0jgDluv
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonSSMManagedInstanceCore",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
        },
        {
            "PolicyName": "AmazonEKS_CNI_Policy",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
        },
        {
            "PolicyName": "AmazonEKSWorkerNodePolicy",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        },
        {
            "PolicyName": "AmazonEC2ContainerRegistryPullOnly",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-admin-role
#### Attached Policies
```
{
    "AttachedPolicies": []
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "MediConnect-AdminService-Strict"
    ]
}
```
#### Inline: MediConnect-AdminService-Strict
```json
{
    "RoleName": "mediconnect-admin-role",
    "PolicyName": "MediConnect-AdminService-Strict",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "DynamoDBAdminReadWrite",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                    "dynamodb:Scan"
                ],
                "Resource": [
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-patients",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-patients/index/*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-doctors",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-doctors/index/*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-appointments",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-appointments/index/*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-transactions",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-transactions/index/*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-audit-logs",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-audit-logs/index/*"
                ]
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "TrustEKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:sub": [
                        "system:serviceaccount:mediconnect-prod:booking-sa",
                        "system:serviceaccount:mediconnect-staging:booking-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustAzureAKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:sub": [
                        "system:serviceaccount:mediconnect-prod:booking-sa",
                        "system:serviceaccount:mediconnect-staging:booking-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustGoogleCloudRun",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/accounts.google.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "accounts.google.com:sub": "114309397288653485794"
                }
            }
        }
    ]
}
```

### Role: mediconnect-auto-group-eu-role-ewcj2kcy
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonCognitoPowerUser",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonCognitoPowerUser"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-5b31be71-70e1-47fc-801c-e5b6228f4443",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-5b31be71-70e1-47fc-801c-e5b6228f4443"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-auto-group-us-role-msj8mvre
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonCognitoPowerUser",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonCognitoPowerUser"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-f88e44ee-dbc1-401c-b9a7-fee1c5c24f60",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-f88e44ee-dbc1-401c-b9a7-fee1c5c24f60"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-azure-role-us
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonSSMFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonSSMFullAccess"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:aud": "api://AzureADTokenExchange"
                },
                "StringLike": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:sub": "system:serviceaccount:mediconnect-*:mediconnect-sa"
                }
            }
        }
    ]
}
```

### Role: mediconnect-billing-service-role-rfaptbgu
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-566f09a9-53b2-4c66-a4e8-1b16eee6fef5",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-566f09a9-53b2-4c66-a4e8-1b16eee6fef5"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-book-appointment-role-q8q3s008
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonTranscribeFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonTranscribeFullAccess"
        },
        {
            "PolicyName": "ComprehendFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/ComprehendFullAccess"
        },
        {
            "PolicyName": "SecretsManagerReadWrite",
            "PolicyArn": "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
        },
        {
            "PolicyName": "AmazonSNSFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonSNSFullAccess"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        },
        {
            "PolicyName": "AmazonBedrockFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonBedrockFullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-a0d74f84-740a-4e66-9be3-cdafe886ff98",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-a0d74f84-740a-4e66-9be3-cdafe886ff98"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "AccessAllSecrets",
        "AIAccess",
        "ChimeAccess",
        "WebSocket-SendMessage-Policy"
    ]
}
```
#### Inline: AccessAllSecrets
```json
{
    "RoleName": "mediconnect-book-appointment-role-q8q3s008",
    "PolicyName": "AccessAllSecrets",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "secretsmanager:GetSecretValue",
                "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:mediconnect/*"
            }
        ]
    }
}
```
#### Inline: AIAccess
```json
{
    "RoleName": "mediconnect-book-appointment-role-q8q3s008",
    "PolicyName": "AIAccess",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "comprehendmedical:DetectEntitiesV2",
                    "transcribe:StartMedicalTranscriptionJob",
                    "dynamodb:PutItem",
                    "dynamodb:GetItem"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Inline: ChimeAccess
```json
{
    "RoleName": "mediconnect-book-appointment-role-q8q3s008",
    "PolicyName": "ChimeAccess",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "chime:CreateMeeting",
                    "chime:CreateAttendee",
                    "chime:DeleteMeeting",
                    "dynamodb:GetItem",
                    "dynamodb:PutItem"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Inline: WebSocket-SendMessage-Policy
```json
{
    "RoleName": "mediconnect-book-appointment-role-q8q3s008",
    "PolicyName": "WebSocket-SendMessage-Policy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "execute-api:ManageConnections",
                "Resource": "arn:aws:execute-api:us-east-1:*:*/*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-booking-role
#### Attached Policies
```
{
    "AttachedPolicies": []
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "MediConnect-BookingService-Strict"
    ]
}
```
#### Inline: MediConnect-BookingService-Strict
```json
{
    "RoleName": "mediconnect-booking-role",
    "PolicyName": "MediConnect-BookingService-Strict",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "DynamoDBBookingAccess",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:DeleteItem",
                    "dynamodb:ConditionCheckItem"
                ],
                "Resource": [
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-patients*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-doctors*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-appointments*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-booking-locks*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-transactions*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-graph-data*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-prescriptions*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-pharmacy-inventory*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-audit-logs*"
                ]
            },
            {
                "Sid": "S3ReceiptAccess",
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:GetObject"
                ],
                "Resource": [
                    "arn:aws:s3:::mediconnect-patient-data/receipts/*",
                    "arn:aws:s3:::mediconnect-patient-data-eu/receipts/*"
                ]
            },
            {
                "Sid": "KMSEncryption",
                "Effect": "Allow",
                "Action": [
                    "kms:Encrypt",
                    "kms:GenerateDataKey"
                ],
                "Resource": "arn:aws:kms:*:950110266426:key/*"
            },
            {
                "Sid": "SSMAndSecretsAccess",
                "Effect": "Allow",
                "Action": [
                    "ssm:GetParameter",
                    "ssm:GetParameters",
                    "secretsmanager:GetSecretValue"
                ],
                "Resource": [
                    "arn:aws:ssm:*:950110266426:parameter/mediconnect/prod/*",
                    "arn:aws:ssm:*:950110266426:parameter/mediconnect/stripe/*"
                ]
            },
            {
                "Sid": "MasterKeyDecrypt",
                "Effect": "Allow",
                "Action": [
                    "kms:Decrypt"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "TrustEKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:sub": [
                        "system:serviceaccount:mediconnect-prod:booking-sa",
                        "system:serviceaccount:mediconnect-staging:booking-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustAzureAKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:sub": [
                        "system:serviceaccount:mediconnect-prod:booking-sa",
                        "system:serviceaccount:mediconnect-staging:booking-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustGoogleCloudRun",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/accounts.google.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "accounts.google.com:sub": "114309397288653485794"
                }
            }
        }
    ]
}
```

### Role: mediconnect-cancel-appointment-role-43pkwks2
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "SecretsManagerReadWrite",
            "PolicyArn": "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-3c7b50b9-6b19-4e0e-baa2-df6c8869d885",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-3c7b50b9-6b19-4e0e-baa2-df6c8869d885"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-cleanup-recordings-role-g9twqdgq
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-f3c39e03-1dc2-4151-a2b9-dd579ba10f63",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-f3c39e03-1dc2-4151-a2b9-dd579ba10f63"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "ChimeMediaPipelineCleanup"
    ]
}
```
#### Inline: ChimeMediaPipelineCleanup
```json
{
    "RoleName": "mediconnect-cleanup-recordings-role-g9twqdgq",
    "PolicyName": "ChimeMediaPipelineCleanup",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "chime:DeleteMediaCapturePipeline",
                    "dynamodb:Scan"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-cleanup-recordings-role-i088yo9g
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-702add09-41be-4e0a-8ce7-31acfce80e47",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-702add09-41be-4e0a-8ce7-31acfce80e47"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "ChimeMediaPipelineCleanup"
    ]
}
```
#### Inline: ChimeMediaPipelineCleanup
```json
{
    "RoleName": "mediconnect-cleanup-recordings-role-i088yo9g",
    "PolicyName": "ChimeMediaPipelineCleanup",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "chime:DeleteMediaCapturePipeline",
                    "dynamodb:Scan"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-cleanup-service-role-6p3uo83y
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-af625128-d2cb-4ff3-8cb6-f2d115c0ad88",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-af625128-d2cb-4ff3-8cb6-f2d115c0ad88"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-comm-role
#### Attached Policies
```
{
    "AttachedPolicies": []
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "MediConnect-CommService-Strict"
    ]
}
```
#### Inline: MediConnect-CommService-Strict
```json
{
    "RoleName": "mediconnect-comm-role",
    "PolicyName": "MediConnect-CommService-Strict",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "DynamoDBCommAccess",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:DeleteItem"
                ],
                "Resource": [
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-chat-history",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-chat-connections",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-graph-data",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-video-sessions",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-appointments",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-audit-logs*"
                ]
            },
            {
                "Sid": "ClinicalAIAccess",
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel",
                    "comprehendmedical:DetectEntitiesV2"
                ],
                "Resource": "*"
            },
            {
                "Sid": "ChimeVideoAccess",
                "Effect": "Allow",
                "Action": [
                    "chime:CreateMeeting",
                    "chime:DeleteMeeting",
                    "chime:GetMeeting",
                    "chime:CreateAttendee",
                    "chime:DeleteAttendee",
                    "chime:GetAttendee",
                    "chime:CreateMediaCapturePipeline",
                    "chime:DeleteMediaCapturePipeline"
                ],
                "Resource": "*"
            },
            {
                "Sid": "WebSocketGatewayAccess",
                "Effect": "Allow",
                "Action": [
                    "execute-api:ManageConnections",
                    "execute-api:Invoke"
                ],
                "Resource": "arn:aws:execute-api:*:950110266426:*"
            },
            {
                "Sid": "S3RecordingAccess",
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:GetObject"
                ],
                "Resource": [
                    "arn:aws:s3:::mediconnect-consultation-recordings/*",
                    "arn:aws:s3:::mediconnect-consultation-recordings-eu/*"
                ]
            },
            {
                "Sid": "SSMAccess",
                "Effect": "Allow",
                "Action": [
                    "ssm:GetParameter",
                    "ssm:GetParameters"
                ],
                "Resource": "arn:aws:ssm:*:950110266426:parameter/mediconnect/prod/*"
            },
            {
                "Sid": "MasterKeyDecrypt",
                "Effect": "Allow",
                "Action": [
                    "kms:Decrypt"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "TrustEKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:sub": [
                        "system:serviceaccount:mediconnect-prod:communication-sa",
                        "system:serviceaccount:mediconnect-staging:communication-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustAzureAKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:sub": [
                        "system:serviceaccount:mediconnect-prod:communication-sa",
                        "system:serviceaccount:mediconnect-staging:communication-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustGoogleCloudRun",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/accounts.google.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "accounts.google.com:sub": "114309397288653485794"
                }
            }
        }
    ]
}
```

### Role: mediconnect-create-doctor-role-7vu5yt62
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-3a24a35e-2bea-4058-b58f-86523f89d500",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-3a24a35e-2bea-4058-b58f-86523f89d500"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-create-patient-role-a2tin7y6
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-e66fe07b-4e62-4e9a-93bd-eee12a3eb276",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-e66fe07b-4e62-4e9a-93bd-eee12a3eb276"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-dicom-role
#### Attached Policies
```
{
    "AttachedPolicies": []
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "MediConnect-DicomService-Strict"
    ]
}
```
#### Inline: MediConnect-DicomService-Strict
```json
{
    "RoleName": "mediconnect-dicom-role",
    "PolicyName": "MediConnect-DicomService-Strict",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "S3MedicalImagesAccess",
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:PutObjectTagging"
                ],
                "Resource": [
                    "arn:aws:s3:::mediconnect-medical-images/*",
                    "arn:aws:s3:::mediconnect-medical-images-eu/*"
                ]
            },
            {
                "Sid": "DynamoDBAuditAccess",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:PutItem"
                ],
                "Resource": [
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-audit-logs*"
                ]
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "TrustEKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:sub": [
                        "system:serviceaccount:mediconnect-prod:doctor-sa",
                        "system:serviceaccount:mediconnect-staging:doctor-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustAzureAKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:sub": [
                        "system:serviceaccount:mediconnect-prod:doctor-sa",
                        "system:serviceaccount:mediconnect-staging:doctor-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustGoogleCloudRun",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/accounts.google.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "accounts.google.com:sub": "114309397288653485794"
                }
            }
        }
    ]
}
```

### Role: mediconnect-doctor-role
#### Attached Policies
```
{
    "AttachedPolicies": []
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "MediConnect-DoctorService-Strict"
    ]
}
```
#### Inline: MediConnect-DoctorService-Strict
```json
{
    "RoleName": "mediconnect-doctor-role",
    "PolicyName": "MediConnect-DoctorService-Strict",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowCognitoDelete",
                "Effect": "Allow",
                "Action": "cognito-idp:AdminDeleteUser",
                "Resource": [
                    "arn:aws:cognito-idp:us-east-1:950110266426:userpool/us-east-1_fUsIfc7kL",
                    "arn:aws:cognito-idp:eu-central-1:950110266426:userpool/eu-central-1_5Fc7eFLB5"
                ]
            },
            {
                "Sid": "S3RestrictedAccess",
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:GetObject",
                    "s3:PutObjectTagging",
                    "s3:PutObjectVersionTagging",
                    "s3:DeleteObject"
                ],
                "Resource": [
                    "arn:aws:s3:::mediconnect-doctor-data/doctor/*",
                    "arn:aws:s3:::mediconnect-doctor-data-eu/doctor/*",
                    "arn:aws:s3:::mediconnect-ehr-records/*",
                    "arn:aws:s3:::mediconnect-ehr-records-eu/*",
                    "arn:aws:s3:::mediconnect-prescriptions/*",
                    "arn:aws:s3:::mediconnect-prescriptions-eu/*"
                ]
            },
            {
                "Sid": "RekognitionAIAccess",
                "Effect": "Allow",
                "Action": [
                    "rekognition:CompareFaces",
                    "rekognition:DetectFaces",
                    "rekognition:DetectText"
                ],
                "Resource": "*"
            },
            {
                "Sid": "DynamoDBRestrictedAccess",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:DeleteItem",
                    "dynamodb:ConditionCheckItem"
                ],
                "Resource": [
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-doctors",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-patients",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-appointments*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-prescriptions",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-health-records",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-transactions",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-graph-data",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-booking-locks",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-drug-interactions",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-pharmacy-inventory",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-audit-logs*"
                ]
            },
            {
                "Sid": "AIServicesAccess",
                "Effect": "Allow",
                "Action": [
                    "rekognition:CompareFaces",
                    "textract:AnalyzeDocument"
                ],
                "Resource": "*"
            },
            {
                "Sid": "DigitalSignatureAccess",
                "Effect": "Allow",
                "Action": [
                    "kms:Sign",
                    "kms:Verify"
                ],
                "Resource": "arn:aws:kms:*:950110266426:key/*"
            },
            {
                "Sid": "NotificationAccess",
                "Effect": "Allow",
                "Action": [
                    "sns:Publish"
                ],
                "Resource": [
                    "arn:aws:sns:*:950110266426:mediconnect-emergency-us",
                    "arn:aws:sns:*:950110266426:mediconnect-emergency-eu",
                    "arn:aws:sns:*:950110266426:mediconnect-high-risk-alerts",
                    "arn:aws:sns:*:950110266426:mediconnect-high-risk-alerts-eu"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ses:SendEmail",
                    "ses:SendRawEmail"
                ],
                "Resource": "*"
            },
            {
                "Sid": "SSMVaultAccess",
                "Effect": "Allow",
                "Action": [
                    "ssm:GetParameter",
                    "ssm:GetParameters"
                ],
                "Resource": "arn:aws:ssm:*:950110266426:parameter/mediconnect/prod/*"
            },
            {
                "Sid": "MasterKeyDecrypt",
                "Effect": "Allow",
                "Action": [
                    "kms:Decrypt"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "TrustEKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:sub": [
                        "system:serviceaccount:mediconnect-prod:doctor-sa",
                        "system:serviceaccount:mediconnect-staging:doctor-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustAzureAKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:sub": [
                        "system:serviceaccount:mediconnect-prod:doctor-sa",
                        "system:serviceaccount:mediconnect-staging:doctor-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustGoogleCloudRun",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/accounts.google.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "accounts.google.com:sub": "114309397288653485794"
                }
            }
        }
    ]
}
```

### Role: mediconnect-ehr-service-role-qu55gdhw
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-24919b12-c4ef-43b3-a0f8-60ce446d5fad",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-24919b12-c4ef-43b3-a0f8-60ce446d5fad"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-eks-pod-role
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSIoTDataAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AWSIoTDataAccess"
        },
        {
            "PolicyName": "AmazonSSMReadOnlyAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess"
        },
        {
            "PolicyName": "AmazonSNSFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonSNSFullAccess"
        },
        {
            "PolicyName": "AWSKeyManagementServicePowerUser",
            "PolicyArn": "arn:aws:iam::aws:policy/AWSKeyManagementServicePowerUser"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "Strict-Outside-Policy"
    ]
}
```
#### Inline: Strict-Outside-Policy
```json
{
    "RoleName": "mediconnect-eks-pod-role",
    "PolicyName": "Strict-Outside-Policy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowCognitoDelete",
                "Effect": "Allow",
                "Action": "cognito-idp:AdminDeleteUser",
                "Resource": "arn:aws:cognito-idp:us-east-1:950110266426:userpool/eu-central-1_5Fc7eFLB5"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:sub": "system:serviceaccount:mediconnect-*:mediconnect-sa"
                }
            }
        }
    ]
}
```

### Role: mediconnect-failover-proxy-role-enf1d6hy
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-6897db2f-5735-425f-87a6-e9952106e39c",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-6897db2f-5735-425f-87a6-e9952106e39c"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-failover-proxy-role-jehbuy9v
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-2aae0d02-d32a-448f-8696-b3adb491fe8c",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-2aae0d02-d32a-448f-8696-b3adb491fe8c"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-file-sharing-service-role-yv0v6kc2
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-1c07ad03-b75a-4f2c-86c4-febcaecc6b12",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-1c07ad03-b75a-4f2c-86c4-febcaecc6b12"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "S3-FileUpload-Policy"
    ]
}
```
#### Inline: S3-FileUpload-Policy
```json
{
    "RoleName": "mediconnect-file-sharing-service-role-yv0v6kc2",
    "PolicyName": "S3-FileUpload-Policy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "s3:PutObject",
                "Resource": "arn:aws:s3:::mediconnect-consultation-files/uploads/*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-get-appointments-role-8f7rs7ve
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBReadOnlyAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-a78ab2f5-9124-48a5-99b0-6813c659de18",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-a78ab2f5-9124-48a5-99b0-6813c659de18"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "DynamoDB-GetAppointments-Policy"
    ]
}
```
#### Inline: DynamoDB-GetAppointments-Policy
```json
{
    "RoleName": "mediconnect-get-appointments-role-8f7rs7ve",
    "PolicyName": "DynamoDB-GetAppointments-Policy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "dynamodb:Query",
                "Resource": [
                    "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments",
                    "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments/index/*"
                ]
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-get-doctors-role-bgepsu8i
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-409324f6-40e1-4458-8a0a-4ba2b8dd9740",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-409324f6-40e1-4458-8a0a-4ba2b8dd9740"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-get-patients-role-4p2aska2
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBReadOnlyAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-4fb40f7a-2f7e-4eec-af15-800d53eecc49",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-4fb40f7a-2f7e-4eec-af15-800d53eecc49"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-get-vitals-role-vttgimn7
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBReadOnlyAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-f12d214b-8bcb-4f87-96ff-2c67b23f073f",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-f12d214b-8bcb-4f87-96ff-2c67b23f073f"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-graph-service-role-50gdzyo0
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-ceae4852-54cc-42f5-a533-a518e1e1faeb",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-ceae4852-54cc-42f5-a533-a518e1e1faeb"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "DynamoDB-Graph-Write-Policy"
    ]
}
```
#### Inline: DynamoDB-Graph-Write-Policy
```json
{
    "RoleName": "mediconnect-graph-service-role-50gdzyo0",
    "PolicyName": "DynamoDB-Graph-Write-Policy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "dynamodb:BatchWriteItem",
                "Resource": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-graph-data"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-imaging-service-role-genwi8el
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-fc98eb38-8ca2-470e-8942-102cb3673172",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-fc98eb38-8ca2-470e-8942-102cb3673172"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "BedrockAccessPolicy"
    ]
}
```
#### Inline: BedrockAccessPolicy
```json
{
    "RoleName": "mediconnect-imaging-service-role-genwi8el",
    "PolicyName": "BedrockAccessPolicy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowAllBedrock",
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-iot-gcp-sync-role-benw9tph
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-6a05061b-a24e-427a-9340-da0402a578ce",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-6a05061b-a24e-427a-9340-da0402a578ce"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-lambda-shared-role
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonCognitoPowerUser",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonCognitoPowerUser"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole",
            "PolicyArn": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-migration-role
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonECSTaskExecutionRolePolicy",
            "PolicyArn": "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "mediconnect-app-logic"
    ]
}
```
#### Inline: mediconnect-app-logic
```json
{
    "RoleName": "mediconnect-migration-role",
    "PolicyName": "mediconnect-app-logic",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": [
                    "dynamodb:Scan",
                    "dynamodb:GetItem",
                    "ssm:GetParameter",
                    "kms:Decrypt",
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Effect": "Allow",
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ecs-tasks.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-patient-role
#### Attached Policies
```
{
    "AttachedPolicies": []
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "MediConnect-PatientService-Strict"
    ]
}
```
#### Inline: MediConnect-PatientService-Strict
```json
{
    "RoleName": "mediconnect-patient-role",
    "PolicyName": "MediConnect-PatientService-Strict",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowCognitoDelete",
                "Effect": "Allow",
                "Action": "cognito-idp:AdminDeleteUser",
                "Resource": [
                    "arn:aws:cognito-idp:us-east-1:950110266426:userpool/us-east-1_fUsIfc7kL",
                    "arn:aws:cognito-idp:eu-central-1:950110266426:userpool/eu-central-1_5Fc7eFLB5"
                ]
            },
            {
                "Sid": "S3RestrictedAccess",
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:GetObject",
                    "s3:PutObjectTagging",
                    "s3:PutObjectVersionTagging",
                    "s3:DeleteObject"
                ],
                "Resource": [
                    "arn:aws:s3:::mediconnect-patient-data/patient/*",
                    "arn:aws:s3:::mediconnect-patient-data-eu/patient/*",
                    "arn:aws:s3:::mediconnect-ehr-records/*",
                    "arn:aws:s3:::mediconnect-ehr-records-eu/*"
                ]
            },
            {
                "Sid": "DynamoDBRestrictedAccess",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:DeleteItem"
                ],
                "Resource": [
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-patients*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-appointments*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-vitals*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-audit-logs*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-transactions*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-booking-locks*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-doctors*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-knowledge-base*"
                ]
            },
            {
                "Sid": "NotificationAccess",
                "Effect": "Allow",
                "Action": [
                    "sns:Publish"
                ],
                "Resource": [
                    "arn:aws:sns:*:950110266426:mediconnect-emergency-us",
                    "arn:aws:sns:*:950110266426:mediconnect-emergency-eu",
                    "arn:aws:sns:*:950110266426:mediconnect-high-risk-alerts",
                    "arn:aws:sns:*:950110266426:mediconnect-high-risk-alerts-eu"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "ses:SendEmail",
                    "ses:SendRawEmail"
                ],
                "Resource": "*"
            },
            {
                "Sid": "SSMVaultAccess",
                "Effect": "Allow",
                "Action": [
                    "ssm:GetParameter",
                    "ssm:GetParameters"
                ],
                "Resource": [
                    "arn:aws:ssm:*:950110266426:parameter/mediconnect/prod/*",
                    "arn:aws:ssm:*:950110266426:parameter/mediconnect/stripe/*"
                ]
            },
            {
                "Sid": "KMSDecryptSecrets",
                "Effect": "Allow",
                "Action": [
                    "kms:Decrypt"
                ],
                "Resource": "*"
            },
            {
                "Sid": "RekognitionAIAccess",
                "Effect": "Allow",
                "Action": [
                    "rekognition:CompareFaces",
                    "rekognition:DetectFaces",
                    "rekognition:DetectText"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "TrustEKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:sub": [
                        "system:serviceaccount:mediconnect-prod:patient-sa",
                        "system:serviceaccount:mediconnect-staging:patient-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustAzureAKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:sub": [
                        "system:serviceaccount:mediconnect-prod:patient-sa",
                        "system:serviceaccount:mediconnect-staging:patient-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustGoogleCloudRun",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/accounts.google.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "accounts.google.com:sub": "114309397288653485794"
                }
            }
        }
    ]
}
```

### Role: mediconnect-prescription-service-role-5pr8s84o
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSKeyManagementServicePowerUser",
            "PolicyArn": "arn:aws:iam::aws:policy/AWSKeyManagementServicePowerUser"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-f13bf7a3-d2c7-41b6-9834-e891988614c4",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-f13bf7a3-d2c7-41b6-9834-e891988614c4"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "Allow-Prescription-Signing",
        "KMS-Signing-Policy",
        "PrescriptionFullAccess"
    ]
}
```
#### Inline: Allow-Prescription-Signing
```json
{
    "RoleName": "mediconnect-prescription-service-role-5pr8s84o",
    "PolicyName": "Allow-Prescription-Signing",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowSigning",
                "Effect": "Allow",
                "Action": [
                    "kms:Sign",
                    "kms:Verify",
                    "kms:GetPublicKey"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Inline: KMS-Signing-Policy
```json
{
    "RoleName": "mediconnect-prescription-service-role-5pr8s84o",
    "PolicyName": "KMS-Signing-Policy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "kms:Sign",
                    "kms:Verify"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Inline: PrescriptionFullAccess
```json
{
    "RoleName": "mediconnect-prescription-service-role-5pr8s84o",
    "PolicyName": "PrescriptionFullAccess",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowPrescriptionServices",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "s3:PutObject",
                    "sns:Publish"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-staff-role
#### Attached Policies
```
{
    "AttachedPolicies": []
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "MediConnect-StaffService-Strict"
    ]
}
```
#### Inline: MediConnect-StaffService-Strict
```json
{
    "RoleName": "mediconnect-staff-role",
    "PolicyName": "MediConnect-StaffService-Strict",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "SSMReadCognito",
                "Effect": "Allow",
                "Action": [
                    "ssm:GetParameters",
                    "ssm:GetParameter"
                ],
                "Resource": "arn:aws:ssm:*:950110266426:parameter/mediconnect/prod/cognito/*"
            },
            {
                "Sid": "DynamoDBStaffTables",
                "Effect": "Allow",
                "Action": [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:Query",
                    "dynamodb:Scan"
                ],
                "Resource": [
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-staff-shifts",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-staff-shifts/index/*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-staff-tasks",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-staff-tasks/index/*",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-staff-announcements",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-doctors",
                    "arn:aws:dynamodb:*:950110266426:table/mediconnect-audit-logs"
                ]
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "TrustEKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703:sub": [
                        "system:serviceaccount:mediconnect-prod:booking-sa",
                        "system:serviceaccount:mediconnect-staging:booking-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustAzureAKS",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/:sub": [
                        "system:serviceaccount:mediconnect-prod:booking-sa",
                        "system:serviceaccount:mediconnect-staging:booking-sa"
                    ]
                }
            }
        },
        {
            "Sid": "TrustGoogleCloudRun",
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::950110266426:oidc-provider/accounts.google.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "accounts.google.com:sub": "114309397288653485794"
                }
            }
        }
    ]
}
```

### Role: mediconnect-stream-to-bigquery-role-rht3ozce
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaDynamoDBExecutionRole",
            "PolicyArn": "arn:aws:iam::aws:policy/service-role/AWSLambdaDynamoDBExecutionRole"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-a75b347c-1536-45cf-a38d-93e19f11ef5e",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-a75b347c-1536-45cf-a38d-93e19f11ef5e"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "AllowS3Write"
    ]
}
```
#### Inline: AllowS3Write
```json
{
    "RoleName": "mediconnect-stream-to-bigquery-role-rht3ozce",
    "PolicyName": "AllowS3Write",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "s3:PutObject",
                "Resource": "arn:aws:s3:::mediconnect-datalake-950110266426/*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-symptom-checker-role-hmvxvqh5
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "ComprehendMedicalFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/ComprehendMedicalFullAccess"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-ab8091c4-57fa-4ccd-8adf-997eef44b634",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-ab8091c4-57fa-4ccd-8adf-997eef44b634"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "Bedrock-SymptomChecker-Policy",
        "MediConnectAI-Policy",
        "snspermmision"
    ]
}
```
#### Inline: Bedrock-SymptomChecker-Policy
```json
{
    "RoleName": "mediconnect-symptom-checker-role-hmvxvqh5",
    "PolicyName": "Bedrock-SymptomChecker-Policy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "BedrockAccess",
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel"
                ],
                "Resource": [
                    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0"
                ]
            }
        ]
    }
}
```
#### Inline: MediConnectAI-Policy
```json
{
    "RoleName": "mediconnect-symptom-checker-role-hmvxvqh5",
    "PolicyName": "MediConnectAI-Policy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowBedrockAccess",
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel",
                    "bedrock:ListFoundationModels"
                ],
                "Resource": "*"
            },
       {
    "UserPool": {
        "Id": "us-east-1_fUsIfc7kL",
        "Name": "mediconnect-users-us",
        "Policies": {
            "PasswordPolicy": {
                "MinimumLength": 8,
                "RequireUppercase": true,
                "RequireLowercase": true,
                "RequireNumbers": true,
                "RequireSymbols": true,
                "TemporaryPasswordValidityDays": 7
            },
            "SignInPolicy": {
                "AllowedFirstAuthFactors": [
                    "PASSWORD"
                ]
            }
        },
        "DeletionProtection": "ACTIVE",
        "LambdaConfig": {
            "PostConfirmation": "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-auto-group-us"
        },
        "LastModifiedDate": "2026-02-23T17:13:09.042000+06:00",
        "Cr{
    "RoleName": "mediconnect-symptom-checker-role-hmvxvqh5",
    "PolicyName": "snspermmision",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "sns:Publish",
                "Resource": "arn:aws:sns:us-east-1:950110266426:mediconnect-high-risk-alerts"
            }
        ]
    }
}
"MaxLength": "2048"
                }
            },
            {
                "Name": "address",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "birthdate",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "10",
                    "MaxLength": "10"
                }
            },
            {
                "Name": "gender",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "preferred_username",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "updated_at",
                "AttributeDataType": "Number",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "NumberAttributeConstraints": {
                    "MinValue": "0"
                }
            },
            {
                "Name": "website",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "picture",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "identities",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {}
            },
            {
                "Name": "sub",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": false,
                "Required": true,
                "StringAttributeConstraints": {
                    "MinLength": "1",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "phone_number",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "phone_number_verified",
                "AttributeDataType": "Boolean",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false
            },
            {
                "Name": "zoneinfo",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "custom:user_role",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": false,
                "Required": false,
                "StringAttributeConstraints": {}
            },
            {
                "Name": "custom:fhir_id",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": false,
                "Required": false,
                "StringAttributeConstraints": {}
            },
            {
                "Name": "locale",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "email",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": true,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "email_verified",
                "AttributeDataType": "Boolean",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false
            },
            {
                "Name": "given_name",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "family_name",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "middle_name",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "name",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "nickname",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            }
        ],
        "AutoVerifiedAttributes": [
            "email"
        ],
        "UsernameAttributes": [
            "email"
        ],
        "VerificationMessageTemplate": {
            "DefaultEmailOption": "CONFIRM_WITH_CODE"
        },
        "UserAttributeUpdateSettings": {
            "AttributesRequireVerificationBeforeUpdate": []
        },
        "MfaConfiguration": "ON",
        "DeviceConfiguration": {
            "ChallengeRequiredOnNewDevice": true,
            "DeviceOnlyRememberedOnUserPrompt": false
        },
        "EstimatedNumberOfUsers": 4,
        "EmailConfiguration": {
            "EmailSendingAccount": "COGNITO_DEFAULT"
        },
        "UserPoolTags": {},
        "Domain": "us-east-1fusifc7kl",
        "AdminCreateUserConfig": {
            "AllowAdminCreateUserOnly": false,
            "UnusedAccountValidityDays": 7
        },
        "UsernameConfiguration": {
            "CaseSensitive": false
        },
        "Arn": "arn:aws:cognito-idp:us-east-1:950110266426:userpool/us-east-1_fUsIfc7kL",
        "AccountRecoverySetting": {
            "RecoveryMechanisms": [
                {
                    "Priority": 1,
                    "Name": "verified_email"
                },
                {
                    "Priority": 2,
                    "Name": "verified_phone_number"
                }
            ]
        },
        "UserPoolTier": "ESSENTIALS"
    }
}
```
##### App Clients
```
{
    "UserPoolClients": [
 {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
UserPoolId": "us-east-1_fUsIfc7kL",
            "ClientName": "client-patient-web"
        },
        {
            "ClientId": "3makppltr8e6eaanjab3e1lkh0",
            "UserPoolId": "us-east-1_fUsIfc7kL",
            "ClientName": "client-admin-web"
        },
        {
            "ClientId": "6nsqer529j4c8gc688vflosomk",
            "UserPoolId": "us-east-1_fUsIfc7kL",
            "ClientName": "client-doctor-web"
        }
    ]
}
```
##### Groups
```
{
    "Groups": [
        {
            "GroupName": "staff",
            "UserP{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-3a87352e-25e5-4353-9f24-b3841abe5666",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-3a87352e-25e5-4353-9f24-b3841abe5666"
        }
    ]
}
546000+06:00"
        },
        {
            "GroupName": "doctor",
            "UserPoolId": "us-east-1_fUsIfc7kL",
            "Description": "Verified Medical Practitioners",
            "Precedence": 1,
            "LastModifiedDate": "2026-02-19T22:18:29.780000+06:00",
            "CreationDate": "2026-02-09T15:17:17.026000+06:00"
        },
        {
            "GroupName": "patient",
            "UserPoolId": "us-east-1_fUsIfc7kL",
            "Description": "Standard global patients (Self-Registration allowed)",
            "Precedence": 10,
            "LastModifiedDate": "2026-02-19T22:19:27.464000+06:00",
            "CreationDate": "2026-02-19T22:19:27.464000+06:00"
        }
    ]
}
```
##### Lambda Triggers
```
{
    "PostConfirmation": "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-auto-group-us"
}
```

### User Pools [eu-central-1]
```
{
    "UserPools": [
        {
            "Id": "eu-central-1_5Fc7eFLB5",
            "Name": "mediconnect-users-eu",
            "LambdaConfig": {
                "PostConfirmation": "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-auto-group-eu"
            },
            "LastModifiedDate": "2026-02-24T19:14:34.134000+06:00",
            "CreationDate": "2026-02-24T19:01:46.719000+06:00"
        }
    ]
}
```

{
    "PolicyNames": []
}
```
#### Pool: eu-central-1_5Fc7eFLB5 [eu-central-1]
```json
{
    "UserPool": {
    {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
ue,
                "RequireNumbers": true,
                "RequireSymbols": true,
                "TemporaryPasswordValidityDays": 7
            },
            "SignInPolicy": {
                "AllowedFirstAuthFactors": [
                    "PASSWORD"
                ]
            }
        },
        "DeletionProtection": "ACTIVE",
        "LambdaConfig": {
            "PostConfirmation": "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-auto-group-eu"
        },
        "LastModifiedDate": "2026-02-24T19:14:34.134000+06:00",
        "CreationDate": "2026-02-24T19:01:46.719000+06:00",
        "SchemaAttributes": [
            {
                "Name": "profile",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "address",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "birthdate",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "10",
                    "MaxLength": "10"
                }
            },
            {
                "Name": "gender",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "preferred_username",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "updated_at",
                "AttributeDataType": "Number",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "NumberAttributeConstraints": {
                    "MinValue": "0"
                }
            },
            {
                "Name": "website",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "picture",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "identities",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {}
            },
            {
                "Name": "sub",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": false,
                "Required": true,
                "StringAttributeConstraints": {
                    "MinLength": "1",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "phone_number",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "phone_number_verified",
                "AttributeDataType": "Boolean",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false
            },
            {
                "Name": "zoneinfo",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "custom:fhir_id",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": false,
                "Required": false,
                "StringAttributeConstraints": {
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "custom:user_role",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": false,
                "Required": false,
                "StringAttributeConstraints": {
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "locale",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "email",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": true,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "email_verified",
                "AttributeDataType": "Boolean",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false
            },
            {
                "Name": "given_name",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "family_name",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "middle_name",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "name",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            },
            {
                "Name": "nickname",
                "AttributeDataType": "String",
                "DeveloperOnlyAttribute": false,
                "Mutable": true,
                "Required": false,
                "StringAttributeConstraints": {
                    "MinLength": "0",
                    "MaxLength": "2048"
                }
            }
        ],
        "AutoVerifiedAttributes": [
            "email"
        ],
        "UsernameAttributes": [
            "email"
        ],
        "VerificationMessageTemplate": {
            "DefaultEmailOption": "CONFIRM_WITH_CODE"
        },
        "UserAttributeUpdateSettings": {
            "AttributesRequireVerificationBeforeUpdate": []
        },
        "MfaConfiguration": "ON",
        "DeviceConfiguration": {
            "ChallengeRequiredOnNewDevice": true,
            "DeviceOnlyRememberedOnUserPrompt": false
        },
        "EstimatedNumberOfUsers": 2,
        "EmailConfiguration": {
            "EmailSendingAccount": "COGNITO_DEFAULT"
        },
        "UserPoolTags": {},
        "Domain": "eu-central-15fc7eflb5",
        "AdminCreateUserConfig": {
            "AllowAdminCreateUserOnly": false,
            "UnusedAccountValidityDays": 7
        },
        "UsernameConfiguration": {
            "CaseSensitive": false
        },
        "Arn": "arn:aws:cognito-idp:eu-central-1:950110266426:userpool/eu-central-1_5Fc7eFLB5",
        "AccountRecoverySetting": {
            "RecoveryMechanisms": [
                {
                    "Priority": 1,
                    "Name": "verified_email"
                },
                {
                    "Priority": 2,
                    "Name": "verified_phone_number"
                }
            ]
        },
        "UserPoolTier": "ESSENTIALS"
    }
}
```
##### App Clients
```
{
    "UserPoolClients": [
        {
            "ClientId": "1erf0tklmpa0922e3p4ei{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonAPIGatewayInvokeFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonAPIGatewayInvokeFullAccess"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-44be0fd6-b6ac-4733-8587-eb0be7201e21",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-44be0fd6-b6ac-4733-8587-eb0be7201e21"
        }
    ]
}
"client-staff-web"
        }
    ]
}
```
##### Groups
```
{
    "Groups": [
        {
            "GroupName": "patient",
            "UserPoolId": "eu-central-1_5Fc7eFLB5",
            "Description": "Standard global patients (Self-Registration allowed)",
            "Precedence": 10,
            "LastModifiedDate": "2026-02-24T19:07:09.549000+06:00",
            "CreationDate": "2026-02-24T19:07:09.549000+06:00"
        },
        {
            "GroupName": "doctor",
            "UserPoolId": "eu-central-1_5Fc7eFLB5",
            "Description": "Verified Medical Practitioners",
            "Precedence": 1,
            "LastModifiedDate": "2026-02-24T19:06:46.127000+06:00",
            "CreationDate": "2026-02-24T19:06:46.127000+06:00"
        },
        {
            "GroupName": "staff",
            "UserPoolId": "eu-central-1_5Fc7eFLB5",
            "LastModifiedDate": "2026-03-19T17:08:29.185000+06:00",
            "CreationDate": "2026-03-19T17:08:29.185000+06:00"
        },
        {
            "GroupName": "admin",
            "UserPoolId": "eu-central-1_5Fc7eFLB5",
            "Description": "Clinic Staff / System Admins",
            "LastModifiedDate": "2026-02-24T19:06:14.274000+06:00",
            "CreationDate": "2026-02-24T19:06:14.274000+06:00"
        }
    ]
}
```
##### Lambda Triggers
```
{
    "PostConfirmation": "arn:aws:lambda:eu-central-1:95{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-ws-authorizer-role-5u712lso
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-36d01051-a9cb-4b1c-bb8b-79a79df13a5e",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-36d01051-a9cb-4b1c-bb8b-79a79df13a5e"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: mediconnect-ws-authorizer-role-62a577ny
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-d1ed3088-4f48-4cfe-af31-42ab5408b144",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-d1ed3088-4f48-4cfe-af31-42ab5408b144"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: MediconnectAnalyticsRole
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole",
            "PolicyArn": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        },
        {
            "PolicyName": "AmazonS3FullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole-5a794462-eddb-47e2-967d-8e89f7fd24a7",
            "PolicyArn": "arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-5a794462-eddb-47e2-967d-8e89f7fd24a7"
        }
    ]
}
       "SigningAlgorithms": [
            "RSASSA_PKCS1_V1_5_SHA_256",
            "RSASSA_PKCS1_V1_5_SHA_384",
            "RSASSA_PKCS1_V1_5_SHA_512",
            "RSASSA_PSS_SHA_256",
            "RSASSA_PSS_SHA_384",
            "RSASSA_PSS_SHA_512"
        ],
        "MultiRegion": false
    }
}
```
##### Aliases
```
{
    "Aliases": [
        {
            "AliasName": "alias/mediconnect-prescription-signer",
            "AliasArn": "arn:aws:kms:us-east-1:950110266426:alias/mediconnect-prescription-signer",
            "TargetKeyId": "496d121c-7da8-4d32-bb03-7095b00bd237",
            "CreationDate": "2026-01-07T19:11:00.414000+06:00",
            "LastUpdatedDate": "2026-01-07T19:11:00.414000+06:00"
        }
    ]
}
```
##### Key Policy
```json
{
    "Policy": "{\n  \"Version\" : \"2012-10-17\",\n  \"Id\" : \"key-consolepolicy-3\",\n  \"Statement\" : [ {\n    \"Sid\" : \"Enable IAM User Permissions\",\n    \"Effect\" : \"Allow\",\n    \"Principal\" : {\n      \"AWS\" : \"arn:aws:iam::950110266426:root\"\n    },\n    \"Action\" : \"kms:*\",\n    \"Resource\" : \"*\"\n  }, {\n    \"Sid\" : \"Allow use of the key\",\n    \"Effect\" : \"Allow\",\n    \"Principal\" : {\n      \"AWS\" : \"arn:aws:iam::950110266426:user/terraform.admin\"\n    },\n    \"Action\" : [ \"kms:DescribeKey\", \"kms:GetPublicKey\", \"kms:Sign\", \"kms:Verify\" ],\n    \"Resource\" : \"*\"\n  }, {\n    \"Sid\" : \"Allow attachment of persistent resources\",\n    \"Effect\" : \"Allow\",\n    \"Principal\" : {\n      \"AWS\" : \"arn:aws:iam::950110266426:user/terraform.admin\"\n    },\n    \"Action\" : [ \"kms:CreateGrant\", \"kms:ListGrants\", \"kms:RevokeGrant\" ],\n    \"Resource\" : \"*\",\n    \"Condition\" : {\n      \"Bool\" : {\n        \"kms:GrantIsForAWSResource\" : \"true\"\n      }\n    }\n  } ]\n}",
    "PolicyName": "default"
}
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: MediconnectBillingRole
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "SecretsManagerReadWrite",
            "PolicyArn": "arn:aws:iam::aws:policy/SecretsManagerReadWrite"
        },
        {
            "PolicyName": "AWSLambdaBasicExecutionRole",
            "PolicyArn": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": [
        "ChatbotPower"
    ]
}
```
#### Inline: ChatbotPower
```json
{
    "RoleName": "MediconnectBillingRole",
    "PolicyName": "ChatbotPower",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel",
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:Scan"
                ],
                "Resource": "*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: MediconnectBuildRole
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AdministratorAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AdministratorAccess"
        }
    ]
}
```
#### Inline Policies
```
#### Key: 07cb3935-8b4a-4595-8e8d-5df6a0885d19 [eu-central-1]
```json
{
    "KeyMetadata": {
        "AWSAccountId": "950110266426",
        "KeyId": "07cb3935-8b4a-4595-8e8d-5df6a0885d19",
        "Arn": "arn:aws:kms:eu-central-1:950110266426:key/07cb3935-8b4a-4595-8e8d-5df6a0885d19",
        "CreationDate": "2026-02-21T14:26:48.807000+06:00",
        "Enabled": true,
        "Description": "",
        "KeyUsage": "SIGN_VERIFY",
        "KeyState": "Enabled",
        "Origin": "AWS_KMS",
        "KeyManager": "CUSTOMER",
        "CustomerMasterKeySpec": "RSA_2048",
        "KeySpec": "RSA_2048",
        "SigningAlgorithms": [
            "RSASSA_PKCS1_V1_5_SHA_256",
            "RSASSA_PKCS1_V1_5_SHA_384",
            "RSASSA_PKCS1_V1_5_SHA_512",
            "RSASSA_PSS_SHA_256",
            "RSASSA_PSS_SHA_384",
            "RSASSA_PSS_SHA_512"
        ],
        "MultiRegion": false
    }
}
```
##### Aliases
```
{
    "Aliases": [
        {
            "AliasName": "{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "codebuild.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
-21T14:26:49.077000+06:00",
            "LastUpdatedDate": "2026-02-21T14:26:49.077000+06:00"
        }
    ]
}
```
##### Key Policy
```json
{
    "Policy": "{\n  \"Version\" : \"2012-10-17\",\n  \"Id\" : \"key-conso{
    "AttachedPolicies": [
        {
            "PolicyName": "AmazonTextractFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonTextractFullAccess"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        }
    ]
}
 \"Principal\" : {\n      \"AWS\" : [ \"arn:aws:iam::950110266426:user/terraform.admin\", \"arn:aws:iam::950110266426:user/zahidul.admin\" ]\n    },\n    \"Action\" : [ \"kms:Create*\", \"kms:Describe*\", \"kms:Enable*\", \"kms:List*\", \"kms:Put*\", \"kms:Update*\", \"kms:Revoke*\", \"kms:Disable*\", \"kms:Get*\", \"kms:Delete*\", \"kms:TagResource\", \"kms:UntagResource\", \"kms:ScheduleKeyDeletion\", \"kms:CancelKeyDeletion\" ],\n    \"Resource\" : \"*\"\n  }, {\n    \"Sid\" : \"Allow use of the key\",\n    \"Effect\" : \"Allow\",\n    \"Principal\" : {\n      \"AWS\" : [ \"arn:aws:iam::950110266426:user/terraform.admin\", \"arn:aws:iam::950110266426:user/zahidul.admin\" ]\n    },\n    \"Action\" : [ \"kms:DescribeKey\", \"kms:GetPublicKey\", \"kms:Sign\", \"kms:Verify\" ],\n    \"Resource\" : \"*\"\n  }, {\n    \"Sid\" : \"Allow attachment of persistent resources\",\n    \"Effect\" : \"Allow\",\n    \"Principal\" : {\n      \"AWS\" : [ \"arn:aws:iam::950110266426:user/terraform.admin\", \"arn:aws:iam::950110266426:user/zahidul.admin\" ]\n    },\n    \"Action\" : [ \"kms:CreateGrant\", \"kms:ListGrants\", \"kms:RevokeGrant\" ],\n    \"Resource\" : \"*\",\n    \"Condition\" : {\n      \"Bool\" : {\n        \"kms:GrantIsForAWSResource\" : \"true\"\n      }\n    }\n  } ]\n}",
    "PolicyName": "default"
}
```

```
#### Inline Policies
```
{
    "PolicyNames": [
        "AllowSNSPublish",
        "DoctorVerificationPolicy"
    ]
}
```
#### Inline: AllowSNSPublish
```json
{
    "RoleName": "MediConnectDoctorVerificationRole",
    "PolicyName": "AllowSNSPublish",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "sns:Publish",
                "Resource": "arn:aws:sns:us-east-1:950110266426:mediconnect-ops-alerts"
            }
        ]
    }
}
```
#### Inline: DoctorVerificationPolicy
```json
{
    "RoleName": "MediConnectDoctorVerificationRole",
    "PolicyName": "DoctorVerificationPolicy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowTextractAnalysis",
                "Effect": "Allow",
                "Action": [
                    "textract:DetectDocumentText",
                    "textract:AnalyzeDocument"
                ],
                "Resource": "*"
            },
            {
                "Sid": "AllowS3Access",
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:ListBucket"
                ],
                "Resource": [
                    "arn:aws:s3:::mediconnect-doctor-credentials-dev",
                    "arn:aws:s3:::mediconnect-doctor-credentials-dev/*"
                ]
            },
            {
                "Sid": "AllowSecretsManager",
                "Effect": "Allow",
                "Action": "secretsmanager:GetSecretValue",
                "Resource": "arn:aws:secretsmanager:*:*:secret:mediconnect/*"
            },
            {
                "Sid": "AllowLogging",
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": "arn:aws:logs:*:*:*"
            }
        ]
    }
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: MediConnectEmergencyRole
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole",
            "PolicyArn": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        },
        {
            "PolicyName": "AWSXRayDaemonWriteAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
        },
        {
            "PolicyName": "AmazonDynamoDBFullAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
        }
    ]
}
```
#### Inline Policies
```
{
    "PolicyNames": []
}
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

### Role: MediconnectLambdaRole
#### Attached Policies
```
{
    "AttachedPolicies": [
        {
            "PolicyName": "AWSLambdaBasicExecutionRole",
            "PolicyArn": "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        }
    ]
}
```
#### Inline Policies
```
{
    "QueueUrls": [
        "https://sqs.us-east-1.amazonaws.com/950110266426/mediconnect-dlq"
    ]
}
```

#### mediconnect-dlq [us-east-1]
```json
{
    "Attributes": {
        "QueueArn": "arn:aws:sqs:us-east-1:950110266426:mediconnect-dlq",
        "ApproximateNumbe{
    "RoleName": "MediconnectLambdaRole",
    "PolicyName": "PharmacyNetworkPermissions",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query"
                ],
                "Resource": "*"
            },
            {
                "Effect": "Allow",
                "Action": [
                    "sns:Publish"
                ],
                "Resource": "*"
            }
        ]
    }
}
sage\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\"arn:aws:sqs:us-east-1:950110266426:mediconnect-dlq\",\"Condition\":{\"ArnLike\":{\"aws:SourceArn\":\"arn:aws:sns:us-east-1:950110266426:*\"}}}]}",
        "ReceiveMessageWaitTimeSeconds": "0",
        "SqsManagedSseEnabled": "true"
    }
}
```

### Queue List [eu-central-1]
```
```
#### Trust Policy
```json
{
    "Version": "2012-10-17",
    "Statement": [
 {
    "Topics": [
        {
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:AWS-Billing-USD3"
        },
        {
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:billing-alert"
        },
        {
            "TopicArn": "arn:aws{
    "AttachedPolicies": [
        {
            "PolicyName": "AdministratorAccess",
            "PolicyArn": "arn:aws:iam::aws:policy/AdministratorAccess"
        }
    ]
}
     {
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-ops-alerts"
        },
        {
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-pharmacy-alerts"
        },
        {
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-prescription-alerts"
        }
    ]
}
```
```
#### Inline Policies
```
#### AWS-Billing-USD3 [us-east-1]
```json
{
    "Attributes": {
        "Policy": "{\"Version\":\"{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "codepipeline.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
,\"SNS:DeleteTopic\",\"SNS:Subscribe\",\"SNS:ListSubscriptionsByTopic\",\"SNS:Publish\"],\"Resource\":\"arn:aws:sns:us-east-1:950110266426:AWS-Billing-USD3\",\"Condition\":{\"StringEquals\":{\"AWS:SourceOwner\":\"950110266426\"}}}]}",
        "Owner": "950110266426",
        "SubscriptionsPending": "0",
        "TopicArn": "arn:aws:sns:us-east-1:950110266426:AWS-Billing-USD3",
        "EffectiveDeliveryPolicy": "{\"http\":{\"defaultHealthyRetryPolicy\":{\"minDelayTarget\":20,\"maxDelayTarget\":20,\"numRetries\":3,\"numMaxDelayRetries\":0,\"numNoDelayRetries\":0,\"numMinDelayRetries\":0,\"backoffFunction\":\"linear\"},\"disableSubscriptionOverrides\":false,\"defaultRequestPolicy\":{\"headerContentType\":\"text/plain; charset=UTF-8\"}}}",
        "SubscriptionsConfirmed": "1",
        "DisplayName": "",
        "SubscriptionsDeleted": "0"
    }
}
```
##### Subscriptions
```
{
    "Subscriptions": [
        {
            "SubscriptionArn": {
    "AttachedPolicies": []
}
6:AWS-Billing-USD3:512e3298-b9a4-4ddb-8f32-95c21a3cba5d",
            "Owner": "950110266426",
            "Protocol": "email",
            "Endpoint": "muhammadzahidulislam2222@gmail.com",
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:AWS-Billing-USD3"
        }
    ]
}
```

#### billing-alert [us-east-1]
```json
{
    "Attributes": {
        "Policy": "{\"Version\":\"2008-10-17\",\"Id\":\"__default_policy_ID\",\"Statement\":[{\"Sid\":\"__default_statement_ID\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"*\"},\"Action\":[\"SNS:GetTopicAttributes\",\"SNS:SetTopicAttributes\",\"SNS:AddPermission\",\"SNS:RemovePermission\",\"SNS:DeleteTopic\",\"SNS:Subscribe\",\"SNS:ListSubscriptionsByTopic\",\"SNS:Publish\"],\"Resource\":\"arn:aws:sns:us-east-1:950110266426:billing-alert\",\"Condition\":{\"StringEquals\":{\"AWS:SourceOwner\":\"950110266426\"}}}]}",
        "Owner": "950110266426",
        "SubscriptionsPending": "0",
        "TopicArn": "arn:aws:sns:us-east-1:950110266426:billing-alert",
        "EffectiveDeliveryPolicy": "{\"http\":{\"defaultHealthyRetryPolicy\":{\"minDelayTarget\":20,\"maxDelayTarget\":20,\"numRetries\":3,\"numMaxDelayRetries\":0,\"numNoDelayRetries\":0,\"numMinDelayRetries\":0,\"backoffFunction\":\"linear\"},\"disableSubscriptionOverrides\":false,\"defaultRequestPolicy\":{\"headerContentType\":\"text/plain; charset=UTF-8\"}}}",
        "SubscriptionsConfirmed": "1",
        "DisplayName": "",
        "SubscriptionsDeleted": "0"
    }
}
```
##### Subscriptions
```
{
    "Subscriptions": [
        {
            "SubscriptionArn": "arn:aws:sns:us-east-1:950110266426:billi{
    "RoleName": "MediconnectReplicationRole",
    "PolicyName": "S3ReplicationPolicy",
    "PolicyDocument": {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": [
                    "s3:GetReplicationConfiguration",
                    "s3:ListBucket"
                ],
     {
    "Attributes": {
        "Policy": "{\"Version\":\"2008-10-17\",\"Id\":\"__default_policy_ID\",\"Statement\":[{\"Sid\":\"__default_statement_ID\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"*\"},\"Action\":[\"SNS:GetTopicAttributes\",\"SNS:SetTopicAttributes\",\"SNS:AddPermission\",\"SNS:RemovePermission\",\"SNS:DeleteTopic\",\"SNS:Subscribe\",\"SNS:ListSubscriptionsByTopic\",\"SNS:Publish\"],\"Resource\":\"arn:aws:sns:us-east-1:950110266426:mediconnect-appointments\",\"Condition\":{\"StringEquals\":{\"AWS:SourceOwner\":\"950110266426\"}}}]}",
        "Owner": "950110266426",
        "SubscriptionsPending": "0",
        "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-appointments",
        "EffectiveDeliveryPolicy": "{\"http\":{\"defaultHealthyRetryPolicy\":{\"minDelayTarget\":20,\"maxDelayTarget\":20,\"numRetries\":3,\"numMaxDelayRetries\":0,\"numNoDelayRetries\":0,\"numMinDelayRetries\":0,\"backoffFunction\":\"linear\"},\"disableSubscriptionO{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "s3.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]{
    "Subscriptions": [
        {
            "SubscriptionArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-appointments:8a44f02c-08e7-417d-817e-9799707aab7b",
            "Owner": "950110266426",
            "Protocol": "email",
            "Endpoint": "muhammadzahidulislam2222@gmail.com",
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-appointments"
        }
    ]
}
```

#### mediconnect-high-risk-alerts [us-east-1]
```json
{
    "Attributes": {
        "Policy": "{\"Version\":\"2008-10-17\",\"Id\":\"__default_policy_ID\",\"Statement\":[{\"Sid\":\"__default_statement_ID\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"*\"},\"Action\":[\"SNS:Publish\",\"SNS:RemovePermission\",\"SNS:SetTopicAttributes\",\"SNS:DeleteTopic\",\"SNS:ListSubscriptionsByTopic\",\"SNS:GetTopicAttributes\",\"SNS:AddPermission\",\"SNS:Subscribe\"],\"Resource\":\"arn:aws:sns:us-east-1:950110266426:mediconnect-high-risk-alerts\",\"Condition\":{\"StringEquals\":{\"AWS:SourceAccount\":\"950110266426\"}}}]}",
        "Owner": "950110266426",
        "SubscriptionsPending": "0",
        "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-high-risk-alerts",
        "TracingConfig": "PassThrough",
        "EffectiveDeliveryPolicy": "{\"http\":{\"defaultHealthyRetryPolicy\":{\"minDelayTarget\":20,\"maxDelayTarget\":20,\"numRetries\":3,\"numMaxDelayRetries\":0,\"numNoDelayRetries\":0,\"numMinDelayRetries\":0,\"backoffFunction\":\"linear\"},\"disableSubscriptionOverrides\":false,\"defaultRequestPolicy\":{\"headerContentType\":\"text/plain; charset=UTF-8\"}}}",
        "SubscriptionsConfirmed": "1",
        "DisplayName": "",
        "SubscriptionsDeleted": "0"
    }
}
```
##### Subscriptions
```
{
    "Subscriptions": [
        {
            "SubscriptionArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-high-risk-alerts:eb8304fe-4857-4b52-8193-57811dbce086",
            "Owner": "950110266426",
            "Protocol": "email",
            "Endpoint": "muhammadzahidulislam2222@gmail.com",
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-high-risk-alerts"
        }
    ]
}
```

#### mediconnect-ops-alerts [us-east-1]
```json
{
    "Attributes": {
        "Policy": "{\"Version\":\"2008-10-17\",\"Id\":\"__default_policy_ID\",\"Statement\":[{\"Sid\":\"__default_statement_ID\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"*\"},\"Action\":[\"SNS:GetTopicAttributes\",\"SNS:SetTopicAttributes\",\"SNS:AddPermission\",\"SNS:RemovePermission\",\"SNS:DeleteTopic\",\"SNS:Subscribe\",\"SNS:ListSubscriptionsByTopic\",\"SNS:Publish\"],\"Resource\":\"arn:aws:sns:us-east-1:950110266426:mediconnect-ops-alerts\",\"Condition\":{\"StringEquals\":{\"AWS:SourceOwner\":\"950110266426\"}}}]}",
        "LambdaSuccessFeedbackSampleRate": "0",
        "Owner": "950110266426",
        "SubscriptionsPending": "0",
        "KmsMasterKeyId": "alias/aws/sns",
        "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-ops-alerts",
        "EffectiveDeliveryPolicy": "{\"http\":{\"defaultHealthyRetryPolicy\":{\"minDelayTarget\":20,\"maxDelayTarget\":20,\"numRetries\":3,\"numMaxDelayRetries\":0,\"numNoDelayRetries\":0,\"numMinDelayRetries\":0,\"backoffFunction\":\"linear\"},\"disableSubscriptionOverrides\":false,\"defaultRequestPolicy\":{\"headerContentType\":\"text/plain; charset=UTF-8\"}}}",
        "FirehoseSuccessFeedbackSampleRate": "0",
        "SubscriptionsConfirmed": "1",
        "SQSSuccessFeedbackSampleRate": "0",
        "HTTPSuccessFeedbackSampleRate": "0",
        "ApplicationSuccessFeedbackSampleRate": "0",
        "DisplayName": "MediAlert",
        "SubscriptionsDeleted": "0"
    }
}
```
##### Subscriptions
```
{
    "Subscriptions": [
        {
            "SubscriptionArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-ops-alerts:d3d5e3e9-4565-4c10-95c9-cbe9cc4a7316",
            "Owner": "950110266426",
            "Protocol": "email",
            "Endpoint": "muhammadzahidulislam2222@gmail.com",
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-ops-alerts"
        }
    ]
}
```

#### mediconnect-pharmacy-alerts [us-east-1]
```json
{
    "Attributes": {
        "Policy": "{\"Version\":\"2008-10-17\",\"Id\":\"__default_policy_ID\",\"Statement\":[{\"Sid\":\"__default_statement_ID\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"*\"},\"Action\":[\"SNS:GetTopicAttributes\",\"SNS:SetTopicAttributes\",\"SNS:AddPermission\",\"SNS:RemovePermission\",\"SNS:DeleteTopic\",\"SNS:Subscribe\",\"SNS:ListSubscriptionsByTopic\",\"SNS:Publish\"],\"Resource\":\"arn:aws:sns:us-east-1:950110266426:mediconnect-pharmacy-alerts\",\"Condition\":{\"StringEquals\":{\"AWS:SourceOwner\":\"950110266426\"}}}]}",
        "Owner": "950110266426",
        "SubscriptionsPending": "0",
        "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-pharmacy-alerts",
        "EffectiveDeliveryPolicy": "{\"http\":{\"defaultHealthyRetryPolicy\":{\"minDelayTarget\":20,\"maxDelayTarget\":20,\"numRetries\":3,\"numMaxDelayRetries\":0,\"numNoDelayRetries\":0,\"numMinDelayRetries\":0,\"backoffFunction\":\"linear\"},\"disableSubscriptionOverrides\":false,\"defaultRequestPolicy\":{\"headerContentType\":\"text/plain; charset=UTF-8\"}}}",
        "SubscriptionsConfirmed": "1",
        "DisplayName": "",
        "SubscriptionsDeleted": "0"
    }
}
```
##### Subscriptions
```
{
    "Subscriptions": [
        {
            "SubscriptionArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-pharmacy-alerts:6ccc1ecb-7d65-4158-a388-e63974e78ccb",
            "Owner": "950110266426",
            "Protocol": "email",
            "Endpoint": "muhammadzahidulislam2222@gmail.com",
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-pharmacy-alerts"
        }
    ]
}
```

#### mediconnect-prescription-alerts [us-east-1]
```json
{
    "Attributes": {
        "Policy": "{\"Version\":\"2008-10-17\",\"Id\":\"__default_policy_ID\",\"Statement\":[{\"Sid\":\"__default_statement_ID\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"*\"},\"Action\":[\"SNS:Publish\",\"SNS:RemovePermission\",\"SNS:SetTopicAttributes\",\"SNS:DeleteTopic\",\"SNS:ListSubscriptionsByTopic\",\"SNS:GetTopicAttributes\",\"SNS:AddPermission\",\"SNS:Subscribe\"],\"Resource\":\"arn:aws:sns:us-east-1:950110266426:mediconnect-prescription-alerts\",\"Condition\":{\"StringEquals\":{\"AWS:SourceAccount\":\"950110266426\"}}}]}",
        "Owner": "950110266426",
        "SubscriptionsPending": "0",
        "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-prescription-alerts",
        "TracingConfig": "PassThrough",
        "EffectiveDeliveryPolicy": "{\"http\":{\"defaultHealthyRetryPolicy\":{\"minDelayTarget\":20,\"maxDelayTarget\":20,\"numRetries\":3,\"numMaxDelayRetries\":0,\"numNoDelayRetries\":0,\"numMinDelayRetries\":0,\"backoffFunction\":\"linear\"},\"disableSubscriptionOverrides\":false,\"defaultRequestPolicy\":{\"headerContentType\":\"text/plain; charset=UTF-8\"}}}",
        "SubscriptionsConfirmed": "1",
        "DisplayName": "",
        "SubscriptionsDeleted": "0"
    }
}
```
##### Subscriptions
```
{
    "Subscriptions": [
        {
            "SubscriptionArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-prescription-alerts:b9ec1e30-644e-4022-8ee8-33b97b7fa759",
            "Owner": "950110266426",
            "Protocol": "email",
            "Endpoint": "muhammadzahidulislam2222@gmail.com",
            "TopicArn": "arn:aws:sns:us-east-1:950110266426:mediconnect-prescription-alerts"
        }
    ]
}
```

### Topic List [eu-central-1]
```
{
    "Topics": [
        {
            "TopicArn": "arn:aws:sns:eu-central-1:950110266426:mediconnect-high-risk-alerts-eu"
        }
    ]
}
```
#### mediconnect-high-risk-alerts-eu [eu-central-1]
```json
{
    "Attributes": {
        "Policy": "{\"Version\":\"2008-10-17\",\"Id\":\"__default_policy_ID\",\"Statement\":[{\"Sid\":\"__default_statement_ID\",\"Effect\":\"Allow\",\"Principal\":{\"AWS\":\"*\"},\"Action\":[\"SNS:Publish\",\"SNS:RemovePermission\",\"SNS:SetTopicAttributes\",\"SNS:DeleteTopic\",\"SNS:ListSubscriptionsByTopic\",\"SNS:GetTopicAttributes\",\"SNS:AddPermission\",\"SNS:Subscribe\"],\"Resource\":\"arn:aws:sns:eu-central-1:950110266426:mediconnect-high-risk-alerts-eu\",\"Condition\":{\"StringEquals\":{\"AWS:SourceAccount\":\"950110266426\"}}}]}",
        "Owner": "950110266426",
        "SubscriptionsPending": "0",
        "TopicArn": "arn:aws:sns:eu-central-1:950110266426:mediconnect-high-risk-alerts-eu",
        "TracingConfig": "PassThrough",
        "EffectiveDeliveryPolicy": "{\"http\":{\"defaultHealthyRetryPolicy\":{\"minDelayTarget\":20,\"maxDelayTarget\":20,\"numRetries\":3,\"numMaxDelayRetries\":0,\"numNoDelayRetries\":0,\"numMinDelayRetries\":0,\"backoffFunction\":\"linear\"},\"disableSubscriptionOverrides\":false,\"defaultRequestPolicy\":{\"headerContentType\":\"text/plain; charset=UTF-8\"}}}",
        "SubscriptionsConfirmed": "1",
        "DisplayName": "",
        "SubscriptionsDeleted": "0"
    }
}
```
##### Subscriptions
```
{
    "Subscriptions": [
        {
            "SubscriptionArn": "arn:aws:sns:eu-central-1:950110266426:mediconnect-high-risk-alerts-eu:a7940f2f-a1fd-412a-8740-bbef2129e0ed",
            "Owner": "950110266426",
            "Protocol": "email",
            "Endpoint": "muhammadzahidulislam2222@gmail.com",
            "TopicArn": "arn:aws:sns:eu-central-1:950110266426:mediconnect-high-risk-alerts-eu"
        }
    ]
}
```

## 8. Lambda Functions
### Function List [us-east-1]
```json
{
    "Functions": [
        {
            "FunctionName": "mediconnect-ws-authorizer",
            "FunctionArn": "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-ws-authorizer",
            "Runtime": "nodejs24.x",
            "Role": "arn:aws:iam::950110266426:role/service-role/mediconnect-ws-authorizer-role-5u712lso",
            "Handler": "index.handler",
            "CodeSize": 92946,
            "Description": "",
            "Timeout": 3,
            "MemorySize": 128,
            "LastModified": "2026-03-26T08:00:33.000+0000",
            "CodeSha256": "Dff06ZURWKYK9fYhHDnkpjzvLnO9U6n+a5oQcvyRhO8=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "COGNITO_CLIENT_ID_US_PATIENT": "20lbag98p4vlj53eumfo11h7ac",
                    "COGNITO_USER_POOL_ID_US": "us-east-1_fUsIfc7kL",
                    "COGNITO_CLIENT_ID_US_DOCTOR": "6nsqer529j4c8gc688vflosomk"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "a24ddc78-475e-43ba-afb8-fa8af37deaf6",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-ws-authorizer"
            }
        },
        {
            "FunctionName": "mediconnect-cognito-triggers",
            "FunctionArn": "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-cognito-triggers",
            "Runtime": "nodejs22.x",
            "Role": "arn:aws:iam::950110266426:role/mediconnect-lambda-shared-role",
            "Handler": "index.handler",
            "CodeSize": 3580718,
            "Description": "",
            "Timeout": 30,
            "MemorySize": 128,
            "LastModified": "2026-03-26T08:00:32.000+0000",
            "CodeSha256": "7aoCd+U76XIs4fJuqpvqktEn8zbXxarZrDZEMhVKu80=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "COGNITO_CLIENT_ID_US_ADMIN": "3makppltr8e6eaanjab3e1lkh0",
                    "COGNITO_CLIENT_ID_US_STAFF": "1rjvst6bo1o2sum28o4pvkf378",
                    "COGNITO_CLIENT_ID_US_DOCTOR": "6nsqer529j4c8gc688vflosomk"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "291e6931-f991-4a97-a33c-7f3b135cba71",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-cognito-triggers"
            }
        },
        {
            "FunctionName": "mediconnect-auto-group-us",
            "FunctionArn": "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-auto-group-us",
            "Runtime": "nodejs24.x",
            "Role": "arn:aws:iam::950110266426:role/service-role/mediconnect-auto-group-us-role-msj8mvre",
            "Handler": "index.handler",
            "CodeSize": 1106,
            "Description": "",
            "Timeout": 3,
            "MemorySize": 128,
            "LastModified": "2026-02-23T11:26:08.000+0000",
            "CodeSha256": "YGVvKZov+ReO+iKMd1MLyLXqxc4UzVvOu+A0U4kKPZw=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "DOCTOR_CLIENT_ID": "6nsqer529j4c8gc688vflosomk"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "42f8c083-b256-4cbe-85aa-c046d13ceae2",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-auto-group-us"
            }
        },
        {
            "FunctionName": "mediconnect-failover-proxy",
            "FunctionArn": "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-failover-proxy",
            "Runtime": "nodejs24.x",
            "Role": "arn:aws:iam::950110266426:role/service-role/mediconnect-failover-proxy-role-enf1d6hy",
            "Handler": "index.handler",
            "CodeSize": 1215,
            "Description": "",
            "Timeout": 3,
            "MemorySize": 128,
            "LastModified": "2026-03-26T08:00:35.000+0000",
            "CodeSha256": "XMeMoFr8DbZ7vwEJC5jlU64xsFxzXE36c41vXe2Sv2s=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "BACKUP_BACKEND_URL": "https://communication-service-us-backup-392747507374.us-central1.run.app/chat/ws-event",
                    "PRIMARY_BACKEND_URL": "https://api-us.healthcodeanalysis.com/chat/ws-event"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "48badc67-ebc0-49ef-8914-4a27120044cc",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-failover-proxy"
            }
        },
        {
            "FunctionName": "mediconnect-cleanup-recordings",
            "FunctionArn": "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-cleanup-recordings",
            "Runtime": "nodejs24.x",
            "Role": "arn:aws:iam::950110266426:role/service-role/mediconnect-cleanup-recordings-role-i088yo9g",
            "Handler": "index.handler",
            "CodeSize": 3092550,
            "Description": "",
            "Timeout": 3,
            "MemorySize": 128,
            "LastModified": "2026-03-26T08:00:34.000+0000",
            "CodeSha256": "iF5sB/r2dkqijjsxxGXrVkZoIcqltDw0rYRMjs6HL9A=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "TABLE_SESSIONS": "mediconnect-video-sessions"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "4e8875ff-43e7-4cc3-a773-50d8dbad1d1d",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-cleanup-recordings"
            }
        }
    ]
}
```

#### mediconnect-ws-authorizer [us-east-1] — Env Var Keys
```
[
    "COGNITO_CLIENT_ID_US_PATIENT",
    "COGNITO_USER_POOL_ID_US",
    "COGNITO_CLIENT_ID_US_DOCTOR"
]
```
##### Triggers/Policy
```
{
    "Policy": "{\"Version\":\"2012-10-17\",\"Id\":\"default\",\"Statement\":[{\"Sid\":\"d88479d0-f1f4-50d3-8b41-8be3fec97936\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"apigateway.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:us-east-1:950110266426:function:mediconnect-ws-authorizer\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:execute-api:us-east-1:950110266426:03n2vxsh7i/authorizers/20l80b\"}}}]}",
    "RevisionId": "6c525a05-06f6-407b-ad2b-dba9431b4de3"
}
```

#### mediconnect-cognito-triggers [us-east-1] — Env Var Keys
```
[
    "COGNITO_CLIENT_ID_US_ADMIN",
    "COGNITO_CLIENT_ID_US_STAFF",
    "COGNITO_CLIENT_ID_US_DOCTOR"
]
```
##### Triggers/Policy
```

An error occurred (ResourceNotFoundException) when calling the GetPolicy operation: The resource you requested does not exist.
(no resource policy)
```

#### mediconnect-auto-group-us [us-east-1] — Env Var Keys
```
[
    "DOCTOR_CLIENT_ID"
]
```
##### Triggers/Policy
```
{
    "Policy": "{\"Version\":\"2012-10-17\",\"Id\":\"default\",\"Statement\":[{\"Sid\":\"CSI_PostConfirmation_us-east-1fUsIfc7kL_CSI_PostConfirmation\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cognito-idp.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:us-east-1:950110266426:function:mediconnect-auto-group-us\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:cognito-idp:us-east-1:950110266426:userpool/us-east-1_fUsIfc7kL\"}}}]}",
    "RevisionId": "e527a90a-982b-498d-be27-24d5a6bc2e4d"
}
```

#### mediconnect-failover-proxy [us-east-1] — Env Var Keys
```
[
    "BACKUP_BACKEND_URL",
    "PRIMARY_BACKEND_URL"
]
```
##### Triggers/Policy
```
{
    "Policy": "{\"Version\":\"2012-10-17\",\"Id\":\"default\",\"Statement\":[{\"Sid\":\"2447ce17-ea64-5930-b4b7-670256937982\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"apigateway.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:us-east-1:950110266426:function:mediconnect-failover-proxy\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:execute-api:us-east-1:950110266426:03n2vxsh7i/*/sendMessage\"}}},{\"Sid\":\"78b16138-6ec3-5b3f-9678-54dd70b1b5b9\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"apigateway.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:us-east-1:950110266426:function:mediconnect-failover-proxy\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:execute-api:us-east-1:950110266426:03n2vxsh7i/*/$disconnect\"}}},{\"Sid\":\"490162da-5b17-5968-bbd9-1c5ef60006e9\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"apigateway.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:us-east-1:950110266426:function:mediconnect-failover-proxy\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:execute-api:us-east-1:950110266426:03n2vxsh7i/*/$connect\"}}}]}",
    "RevisionId": "5ff24b8a-4b44-4ab5-9752-2d8f8bf3e341"
}
```

#### mediconnect-cleanup-recordings [us-east-1] — Env Var Keys
```
[
    "TABLE_SESSIONS"
]
```
##### Triggers/Policy
```

An error occurred (ResourceNotFoundException) when calling the GetPolicy operation: The resource you requested does not exist.
(no resource policy)
```

### Function List [eu-central-1]
```json
{
    "Functions": [
        {
            "FunctionName": "mediconnect-cognito-triggers",
            "FunctionArn": "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-cognito-triggers",
            "Runtime": "nodejs22.x",
            "Role": "arn:aws:iam::950110266426:role/mediconnect-lambda-shared-role",
            "Handler": "index.handler",
            "CodeSize": 3580718,
            "Description": "",
            "Timeout": 30,
            "MemorySize": 128,
            "LastModified": "2026-03-26T08:00:36.000+0000",
            "CodeSha256": "7aoCd+U76XIs4fJuqpvqktEn8zbXxarZrDZEMhVKu80=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "COGNITO_CLIENT_ID_EU_STAFF": "7dj5pa9m7nbrp7qs2fgua0gjv2",
                    "COGNITO_CLIENT_ID_EU_ADMIN": "2eqol49qt7ctig16vsheee496f",
                    "COGNITO_CLIENT_ID_EU_DOCTOR": "4cmi171ll8dds2cfu26obila9g"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "ce33498a-5351-444a-a546-ed07bf495c07",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-cognito-triggers"
            }
        },
        {
            "FunctionName": "mediconnect-auto-group-eu",
            "FunctionArn": "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-auto-group-eu",
            "Runtime": "nodejs24.x",
            "Role": "arn:aws:iam::950110266426:role/service-role/mediconnect-auto-group-eu-role-ewcj2kcy",
            "Handler": "index.handler",
            "CodeSize": 1106,
            "Description": "",
            "Timeout": 3,
            "MemorySize": 128,
            "LastModified": "2026-02-24T13:15:15.000+0000",
            "CodeSha256": "YGVvKZov+ReO+iKMd1MLyLXqxc4UzVvOu+A0U4kKPZw=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "DOCTOR_CLIENT_ID": "4cmi171ll8dds2cfu26obila9g"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "b1b0aa69-5506-435f-9229-3d524a4d8124",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-auto-group-eu"
            }
        },
        {
            "FunctionName": "mediconnect-failover-proxy",
            "FunctionArn": "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-failover-proxy",
            "Runtime": "nodejs24.x",
            "Role": "arn:aws:iam::950110266426:role/service-role/mediconnect-failover-proxy-role-jehbuy9v",
            "Handler": "index.handler",
            "CodeSize": 1215,
            "Description": "",
            "Timeout": 3,
            "MemorySize": 128,
            "LastModified": "2026-03-26T08:00:40.000+0000",
            "CodeSha256": "XMeMoFr8DbZ7vwEJC5jlU64xsFxzXE36c41vXe2Sv2s=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "BACKUP_BACKEND_URL": "https://communication-service-eu-backup-392747507374.europe-west3.run.app/chat/ws-event",
                    "PRIMARY_BACKEND_URL": "https://api-eu.healthcodeanalysis.com/chat/ws-event"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "f18d97d6-bf34-40a7-ad9a-6fd8fc6139dd",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-failover-proxy"
            }
        },
        {
            "FunctionName": "mediconnect-cleanup-recordings",
            "FunctionArn": "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-cleanup-recordings",
            "Runtime": "nodejs24.x",
            "Role": "arn:aws:iam::950110266426:role/service-role/mediconnect-cleanup-recordings-role-g9twqdgq",
            "Handler": "index.handler",
            "CodeSize": 3092550,
            "Description": "",
            "Timeout": 3,
            "MemorySize": 128,
            "LastModified": "2026-03-26T08:00:39.000+0000",
            "CodeSha256": "iF5sB/r2dkqijjsxxGXrVkZoIcqltDw0rYRMjs6HL9A=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "TABLE_SESSIONS": "mediconnect-video-sessions"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "ae06b5c8-f306-482a-b304-9d50a0ec8a86",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-cleanup-recordings"
            }
        },
        {
            "FunctionName": "mediconnect-ws-authorizer",
            "FunctionArn": "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-ws-authorizer",
            "Runtime": "nodejs24.x",
            "Role": "arn:aws:iam::950110266426:role/service-role/mediconnect-ws-authorizer-role-62a577ny",
            "Handler": "index.handler",
            "CodeSize": 92946,
            "Description": "",
            "Timeout": 3,
            "MemorySize": 128,
            "LastModified": "2026-03-26T08:00:38.000+0000",
            "CodeSha256": "Dff06ZURWKYK9fYhHDnkpjzvLnO9U6n+a5oQcvyRhO8=",
            "Version": "$LATEST",
            "Environment": {
                "Variables": {
                    "COGNITO_CLIENT_ID_EU_PATIENT": "1erf0tklmpa0922e3p4eit8iqn",
                    "COGNITO_CLIENT_ID_EU_DOCTOR": "4cmi171ll8dds2cfu26obila9g",
                    "COGNITO_USER_POOL_ID_EU": "eu-central-1_5Fc7eFLB5"
                }
            },
            "TracingConfig": {
                "Mode": "PassThrough"
            },
            "RevisionId": "7ba5edfe-d5c7-46da-9789-91287ea07c5b",
            "PackageType": "Zip",
            "Architectures": [
                "x86_64"
            ],
            "EphemeralStorage": {
                "Size": 512
            },
            "SnapStart": {
                "ApplyOn": "None",
                "OptimizationStatus": "Off"
            },
            "LoggingConfig": {
                "LogFormat": "Text",
                "LogGroup": "/aws/lambda/mediconnect-ws-authorizer"
            }
        }
    ]
}
```

#### mediconnect-cognito-triggers [eu-central-1] — Env Var Keys
```
[
    "COGNITO_CLIENT_ID_EU_STAFF",
    "COGNITO_CLIENT_ID_EU_ADMIN",
    "COGNITO_CLIENT_ID_EU_DOCTOR"
]
```
##### Triggers/Policy
```

An error occurred (ResourceNotFoundException) when calling the GetPolicy operation: The resource you requested does not exist.
(no resource policy)
```

#### mediconnect-auto-group-eu [eu-central-1] — Env Var Keys
```
[
    "DOCTOR_CLIENT_ID"
]
```
##### Triggers/Policy
```
{
    "Policy": "{\"Version\":\"2012-10-17\",\"Id\":\"default\",\"Statement\":[{\"Sid\":\"CSI_PostConfirmation_eu-central-1mVQjD72ZY_CSI_PostConfirmation\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cognito-idp.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-auto-group-eu\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:cognito-idp:eu-central-1:950110266426:userpool/eu-central-1_mVQjD72ZY\"}}},{\"Sid\":\"CSI_PostConfirmation_eu-central-15Fc7eFLB5_CSI_PostConfirmation\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cognito-idp.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-auto-group-eu\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:cognito-idp:eu-central-1:950110266426:userpool/eu-central-1_5Fc7eFLB5\"}}}]}",
    "RevisionId": "4e65433f-f775-4ec3-84e9-a20515bcfbe9"
}
```

#### mediconnect-failover-proxy [eu-central-1] — Env Var Keys
```
[
    "BACKUP_BACKEND_URL",
    "PRIMARY_BACKEND_URL"
]
```
##### Triggers/Policy
```
{
    "Policy": "{\"Version\":\"2012-10-17\",\"Id\":\"default\",\"Statement\":[{\"Sid\":\"7b38a622-cf90-5d0a-9de0-097eb7ab6bf2\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"apigateway.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-failover-proxy\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:execute-api:eu-central-1:950110266426:n37uhok3d7/*/sendMessage\"}}},{\"Sid\":\"0f1c48a6-5ec7-5d09-8205-7cb9ff0a7501\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"apigateway.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-failover-proxy\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:execute-api:eu-central-1:950110266426:n37uhok3d7/*/$disconnect\"}}},{\"Sid\":\"0878ab43-3cb4-5964-9ceb-464c7687bbc5\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"apigateway.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-failover-proxy\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:execute-api:eu-central-1:950110266426:n37uhok3d7/*/$connect\"}}}]}",
    "RevisionId": "bc6351d3-f3e7-4bd9-bb12-b794418bc1d7"
}
```

#### mediconnect-cleanup-recordings [eu-central-1] — Env Var Keys
```
[
    "TABLE_SESSIONS"
]
```
##### Triggers/Policy
```

An error occurred (ResourceNotFoundException) when calling the GetPolicy operation: The resource you requested does not exist.
(no resource policy)
```

#### mediconnect-ws-authorizer [eu-central-1] — Env Var Keys
```
[
    "COGNITO_CLIENT_ID_EU_PATIENT",
    "COGNITO_CLIENT_ID_EU_DOCTOR",
    "COGNITO_USER_POOL_ID_EU"
]
```
##### Triggers/Policy
```
{
    "Policy": "{\"Version\":\"2012-10-17\",\"Id\":\"default\",\"Statement\":[{\"Sid\":\"7cae9170-5ead-599e-a5f3-409b254a4a33\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"apigateway.amazonaws.com\"},\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-ws-authorizer\",\"Condition\":{\"ArnLike\":{\"AWS:SourceArn\":\"arn:aws:execute-api:eu-central-1:950110266426:n37uhok3d7/authorizers/avhe43\"}}}]}",
    "RevisionId": "2fe9efa1-9bc5-46f7-a15a-b2f01a4c2d2b"
}
```

## 9. API Gateway
### REST APIs [us-east-1]
```json
{
    "items": []
}
```
### WebSocket APIs (v2) [us-east-1]
```json
{
    "Items": [
        {
            "ApiEndpoint": "wss://03n2vxsh7i.execute-api.us-east-1.amazonaws.com",
            "ApiId": "03n2vxsh7i",
            "ApiKeySelectionExpression": "$request.header.x-api-key",
            "CreatedDate": "2026-01-11T08:35:06+00:00",
            "DisableExecuteApiEndpoint": false,
            "IpAddressType": "ipv4",
            "Name": "mediconnect-ws-chat",
            "ProtocolType": "WEBSOCKET",
            "RouteSelectionExpression": "$request.body.action",
            "Tags": {}
        }
    ]
}
```

### REST APIs [eu-central-1]
```json
{
    "items": []
}
```
### WebSocket APIs (v2) [eu-central-1]
```json
{
    "Items": [
        {
            "ApiEndpoint": "wss://n37uhok3d7.execute-api.eu-central-1.amazonaws.com",
            "ApiId": "n37uhok3d7",
            "ApiKeySelectionExpression": "$request.header.x-api-key",
            "CreatedDate": "2026-03-04T17:25:23+00:00",
            "DisableExecuteApiEndpoint": false,
            "IpAddressType": "ipv4",
            "Name": "mediconnect-ws-chat",
            "ProtocolType": "WEBSOCKET",
            "RouteSelectionExpression": "$request.body.action",
            "Tags": {}
        }
    ]
}
```

## 10. SSM Parameters (names + types, no values)
### Parameters [us-east-1]
```json
[
    {
        "Name": "/mediconnect/prod/azure/cosmos/endpoint",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-09T22:55:48.286000+06:00"
    },
    {
        "Name": "/mediconnect/prod/azure/cosmos/primary_key",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-09T22:56:53.363000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/client_id_doctor",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-21T15:06:26.013000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/client_id_eu_doctor",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T22:06:56.766000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/client_id_eu_patient",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T22:08:05.207000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/client_id_patient",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-21T15:07:06.246000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/user_pool_id",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-05T19:44:15.385000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/user_pool_id_eu",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T22:19:25.895000+06:00"
    },
    {
        "Name": "/mediconnect/prod/db/doctor_table",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-25T14:30:46.001000+06:00"
    },
    {
        "Name": "/mediconnect/prod/db/patient_table",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-25T14:30:09.316000+06:00"
    },
    {
        "Name": "/mediconnect/prod/google/client_id",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-03T17:59:54.854000+06:00"
    },
    {
        "Name": "/mediconnect/prod/google/client_secret",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-03T18:00:42.367000+06:00"
    },
    {
        "Name": "/mediconnect/prod/kms/signing_key_id",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-14T19:08:26.252000+06:00"
    },
    {
        "Name": "/mediconnect/prod/mqtt/endpoint",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-22T03:27:43.830000+06:00"
    },
    {
        "Name": "/mediconnect/prod/s3/doctor_identity_bucket",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-10T05:44:47.353000+06:00"
    },
    {
        "Name": "/mediconnect/prod/s3/patient_identity_bucket",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-10T05:42:14.346000+06:00"
    },
    {
        "Name": "/mediconnect/prod/sns/topic_arn_eu",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-22T02:48:11.842000+06:00"
    },
    {
        "Name": "/mediconnect/prod/sns/topic_arn_us",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-20T15:20:27.108000+06:00"
    },
    {
        "Name": "/mediconnect/prod/stripe/secret_key",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-05T11:06:14.511000+06:00"
    },
    {
        "Name": "/mediconnect/stripe/keys",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-06T21:23:11.349000+06:00"
    },
    {
        "Name": "/mediconnect/stripe/webhook_secret",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-07T20:39:36.035000+06:00"
    }
]
```

### Parameters [eu-central-1]
```json
[
    {
        "Name": "/mediconnect/prod/cognito/client_id_doctor",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T23:07:22.786000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/client_id_eu_doctor",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T22:31:13.568000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/client_id_eu_patient",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T22:32:12.893000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/client_id_patient",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T23:06:48.403000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/user_pool_id",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T22:05:25.857000+06:00"
    },
    {
        "Name": "/mediconnect/prod/cognito/user_pool_id_eu",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-24T22:04:39.350000+06:00"
    },
    {
        "Name": "/mediconnect/prod/db/doctor_table",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-25T14:30:40.310000+06:00"
    },
    {
        "Name": "/mediconnect/prod/db/patient_table",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-25T14:30:03.091000+06:00"
    },
    {
        "Name": "/mediconnect/prod/google/client_id",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-03T17:59:57.213000+06:00"
    },
    {
        "Name": "/mediconnect/prod/google/client_secret",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-03T18:00:47.986000+06:00"
    },
    {
        "Name": "/mediconnect/prod/kms/signing_key_id",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-21T15:00:29.420000+06:00"
    },
    {
        "Name": "/mediconnect/prod/mqtt/endpoint",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-22T03:27:34.654000+06:00"
    },
    {
        "Name": "/mediconnect/prod/s3/doctor_identity_bucket",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-10T05:44:41.952000+06:00"
    },
    {
        "Name": "/mediconnect/prod/s3/patient_identity_bucket",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-03-10T05:42:33.958000+06:00"
    },
    {
        "Name": "/mediconnect/prod/sns/topic_arn_eu",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-21T14:54:11.930000+06:00"
    },
    {
        "Name": "/mediconnect/prod/sns/topic_arn_us",
        "Type": "String",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-22T03:00:04.598000+06:00"
    },
    {
        "Name": "/mediconnect/prod/stripe/secret_key",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-22T15:33:03.923000+06:00"
    },
    {
        "Name": "/mediconnect/stripe/keys",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-22T15:32:14.966000+06:00"
    },
    {
        "Name": "/mediconnect/stripe/webhook_secret",
        "Type": "SecureString",
        "Tier": "Standard",
        "LastModifiedDate": "2026-02-22T15:33:41.590000+06:00"
    }
]
```

## 11. ECR Repositories
### ECR [us-east-1]
```json
{
    "repositories": [
        {
            "repositoryArn": "arn:aws:ecr:us-east-1:950110266426:repository/mediconnect-migration-job",
            "registryId": "950110266426",
            "repositoryName": "mediconnect-migration-job",
            "repositoryUri": "950110266426.dkr.ecr.us-east-1.amazonaws.com/mediconnect-migration-job",
            "createdAt": "2026-02-05T00:01:59.345000+06:00",
            "imageTagMutability": "MUTABLE",
            "imageScanningConfiguration": {
                "scanOnPush": true
            },
            "encryptionConfiguration": {
                "encryptionType": "AES256"
            }
        }
    ]
}
```

### ECR [eu-central-1]
```json
{
    "repositories": [
        {
            "repositoryArn": "arn:aws:ecr:eu-central-1:950110266426:repository/doctor-service",
            "registryId": "950110266426",
            "repositoryName": "doctor-service",
            "repositoryUri": "950110266426.dkr.ecr.eu-central-1.amazonaws.com/doctor-service",
            "createdAt": "2026-02-27T21:56:21.660000+06:00",
            "imageTagMutability": "MUTABLE",
            "imageScanningConfiguration": {
                "scanOnPush": false
            },
            "encryptionConfiguration": {
                "encryptionType": "AES256"
            }
        },
        {
            "repositoryArn": "arn:aws:ecr:eu-central-1:950110266426:repository/communication-service",
            "registryId": "950110266426",
            "repositoryName": "communication-service",
            "repositoryUri": "950110266426.dkr.ecr.eu-central-1.amazonaws.com/communication-service",
            "createdAt": "2026-02-27T21:56:25.403000+06:00",
            "imageTagMutability": "MUTABLE",
            "imageScanningConfiguration": {
                "scanOnPush": false
            },
            "encryptionConfiguration": {
                "encryptionType": "AES256"
            }
        },
        {
            "repositoryArn": "arn:aws:ecr:eu-central-1:950110266426:repository/patient-service",
            "registryId": "950110266426",
            "repositoryName": "patient-service",
            "repositoryUri": "950110266426.dkr.ecr.eu-central-1.amazonaws.com/patient-service",
            "createdAt": "2026-02-27T21:56:19.685000+06:00",
            "imageTagMutability": "MUTABLE",
            "imageScanningConfiguration": {
                "scanOnPush": false
            },
            "encryptionConfiguration": {
                "encryptionType": "AES256"
            }
        },
        {
            "repositoryArn": "arn:aws:ecr:eu-central-1:950110266426:repository/booking-service",
            "registryId": "950110266426",
            "repositoryName": "booking-service",
            "repositoryUri": "950110266426.dkr.ecr.eu-central-1.amazonaws.com/booking-service",
            "createdAt": "2026-02-27T21:56:23.542000+06:00",
            "imageTagMutability": "MUTABLE",
            "imageScanningConfiguration": {
                "scanOnPush": false
            },
            "encryptionConfiguration": {
                "encryptionType": "AES256"
            }
        }
    ]
}
```

## 12. ECS Clusters
### ECS Clusters [us-east-1]
```
{
    "clusterArns": [
        "arn:aws:ecs:us-east-1:950110266426:cluster/mediconnect-migration-cluster"
    ]
}
```
#### mediconnect-migration-cluster [us-east-1]
```json
{
    "clusters": [
        {
            "clusterArn": "arn:aws:ecs:us-east-1:950110266426:cluster/mediconnect-migration-cluster",
            "clusterName": "mediconnect-migration-cluster",
            "status": "ACTIVE",
            "registeredContainerInstancesCount": 0,
            "runningTasksCount": 0,
            "pendingTasksCount": 0,
            "activeServicesCount": 0,
            "statistics": [],
            "tags": [],
            "settings": [],
            "capacityProviders": [],
            "defaultCapacityProviderStrategy": []
        }
    ],
    "failures": []
}
```
##### Services
```
{
    "serviceArns": []
}
```

### ECS Clusters [eu-central-1]
```
{
    "clusterArns": []
}
```
## 13. CloudWatch Alarms
### Alarms [us-east-1]
```json
[
    {
        "Name": "AWS-Billing-3USD",
        "Metric": "EstimatedCharges",
        "Namespace": "AWS/Billing",
        "State": "INSUFFICIENT_DATA",
        "Threshold": 3.0
    },
    {
        "Name": "AWS-Billing-5USD",
        "Metric": "EstimatedCharges",
        "Namespace": "AWS/Billing",
        "State": "INSUFFICIENT_DATA",
        "Threshold": 5.0
    },
    {
        "Name": "CRITICAL-BigQuery-Down",
        "Metric": "BigQueryDataLoss",
        "Namespace": "MediConnect/Errors",
        "State": "INSUFFICIENT_DATA",
        "Threshold": 1.0
    },
    {
        "Name": "Mediconnect-HighLatency",
        "Metric": "Latency",
        "Namespace": "AWS/ApiGateway",
        "State": "INSUFFICIENT_DATA",
        "Threshold": 2000.0
    },
    {
        "Name": "Mediconnect-SystemErrors",
        "Metric": "Errors",
        "Namespace": "AWS/Lambda",
        "State": "INSUFFICIENT_DATA",
        "Threshold": 1.0
    }
]
```

### Alarms [eu-central-1]
```json
[]
```

## 14. CloudWatch Log Groups
### Log Groups [us-east-1]
```json
[
    {
        "Name": "/aws/lambda/DoctorDiplomaScanner",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-ai-predictor",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-analytics-router",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-analytics-setup",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-auto-group-us",
        "RetentionDays": null,
        "StoredBytes": 19021
    },
    {
        "Name": "/aws/lambda/mediconnect-billing-service",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-book-appointment",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-cancel-appointment",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-chatbot",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-cleanup-service",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-create-doctor",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-create-patient",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-ehr-service",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-emergency-booking",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-failover-proxy",
        "RetentionDays": null,
        "StoredBytes": 22614
    },
    {
        "Name": "/aws/lambda/mediconnect-file-sharing-service",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-get-appointments",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-get-doctors",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-get-patients",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-get-vitals",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-graph-service",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-imaging-service",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-iot-gcp-sync",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-payment-processor",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-pharmacy-service",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-prescription-service",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-stream-to-bigquery",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-symptom-checker",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-update-schedule",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-websocket-handler",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/aws/lambda/mediconnect-ws-authorizer",
        "RetentionDays": null,
        "StoredBytes": 165317
    },
    {
        "Name": "/aws/lambda/verify-identity",
        "RetentionDays": 1,
        "StoredBytes": 0
    },
    {
        "Name": "/ecs/mediconnect-migration",
        "RetentionDays": null,
        "StoredBytes": 9807
    },
    {
        "Name": "AWSIotLogsV2",
        "RetentionDays": 1,
        "StoredBytes": 0
    }
]
```

### Log Groups [eu-central-1]
```json
[
    {
        "Name": "/aws/lambda/mediconnect-auto-group-eu",
        "RetentionDays": null,
        "StoredBytes": 14460
    },
    {
        "Name": "/aws/lambda/mediconnect-failover-proxy",
        "RetentionDays": null,
        "StoredBytes": 12779
    },
    {
        "Name": "/aws/lambda/mediconnect-ws-authorizer",
        "RetentionDays": null,
        "StoredBytes": 55990
    }
]
```

## 15. SES Email Identities
### SES [us-east-1]
```json
{
    "EmailIdentities": [
        {
            "IdentityType": "EMAIL_ADDRESS",
            "IdentityName": "mehzsolution@gmail.com",
            "SendingEnabled": true,
            "VerificationStatus": "SUCCESS"
        },
        {
            "IdentityType": "EMAIL_ADDRESS",
            "IdentityName": "muhammadzahidulislam2222@gmail.com",
            "SendingEnabled": true,
            "VerificationStatus": "SUCCESS"
        }
    ]
}
```

### SES [eu-central-1]
```json
{
    "EmailIdentities": [
        {
            "IdentityType": "EMAIL_ADDRESS",
            "IdentityName": "mehzsolution@gmail.com",
            "SendingEnabled": true,
            "VerificationStatus": "SUCCESS"
        },
        {
            "IdentityType": "EMAIL_ADDRESS",
            "IdentityName": "muhammadzahidulislam2222@gmail.com",
            "SendingEnabled": true,
            "VerificationStatus": "SUCCESS"
        }
    ]
}
```


---
Discovery complete. 2026-04-04 19:26:18 UTC

## 16. EventBridge Rules
### EventBridge Rules [us-east-1]
```json
{
    "Rules": [
        {
            "Name": "mediconnect-stop-recording-rule",
            "Arn": "arn:aws:events:us-east-1:950110266426:rule/mediconnect-stop-recording-rule",
            "EventPattern": "{\"source\":[\"aws.chime\"],\"detail-type\":[\"Chime Meeting State Change\"],\"detail\":{\"eventType\":[\"MeetingEnded\"]}}",
            "State": "ENABLED",
            "Description": "",
            "EventBusName": "default"
        }
    ]
}
```
#### Targets: mediconnect-stop-recording-rule [us-east-1]
```json
{
    "Targets": [
        {
            "Id": "Id9de61f4a-33d3-4c20-957f-e47f6b674b28",
            "Arn": "arn:aws:lambda:us-east-1:950110266426:function:mediconnect-cleanup-recordings",
            "RoleArn": "arn:aws:iam::950110266426:role/service-role/Amazon_EventBridge_Invoke_Lambda_1111363594"
        }
    ]
}
```

### EventBridge Rules [eu-central-1]
```json
{
    "Rules": [
        {
            "Name": "AutoScalingManagedRule",
            "Arn": "arn:aws:events:eu-central-1:950110266426:rule/AutoScalingManagedRule",
            "EventPattern": "{\"source\":[\"aws.ec2\"],\"detail-type\":[\"EC2 Instance Rebalance Recommendation\",\"EC2 Spot Instance Interruption Warning\"]}",
            "State": "ENABLED",
            "Description": "This rule is used to route Instance notifications to EC2 Auto Scaling",
            "ManagedBy": "autoscaling.amazonaws.com",
            "EventBusName": "default"
        },
        {
            "Name": "mediconnect-stop-recording-rule",
            "Arn": "arn:aws:events:eu-central-1:950110266426:rule/mediconnect-stop-recording-rule",
            "EventPattern": "{\"source\":[\"aws.chime\"],\"detail-type\":[\"Chime Meeting State Change\"],\"detail\":{\"eventType\":[\"MeetingEnded\"]}}",
            "State": "ENABLED",
            "Description": "",
            "EventBusName": "default"
        }
    ]
}
```
#### Targets: AutoScalingManagedRule [eu-central-1]
```json
{
    "Targets": [
        {
            "Id": "autoscaling",
            "Arn": "arn:aws:autoscaling:eu-central-1:::"
        }
    ]
}
```
#### Targets: mediconnect-stop-recording-rule [eu-central-1]
```json
{
    "Targets": [
        {
            "Id": "Id6620f07c-de49-44ab-bd56-3c8175c55d69",
            "Arn": "arn:aws:lambda:eu-central-1:950110266426:function:mediconnect-cleanup-recordings",
            "RoleArn": "arn:aws:iam::950110266426:role/service-role/Amazon_EventBridge_Invoke_Lambda_1719528660"
        }
    ]
}
```

## 17. IoT Core
### IoT Endpoint [us-east-1]
```json
{
    "endpointAddress": "a1wt74615ncz8o-ats.iot.us-east-1.amazonaws.com"
}
```
### IoT Things [us-east-1]
```json
{
    "things": [
        {
            "thingName": "mediconnect-wearable",
            "thingArn": "arn:aws:iot:us-east-1:950110266426:thing/mediconnect-wearable",
            "attributes": {},
            "version": 1
        }
    ]
}
```
### IoT Thing Details: mediconnect-wearable
```json
{
    "defaultClientId": "mediconnect-wearable",
    "thingName": "mediconnect-wearable",
    "thingId": "3e68056d-421e-4a01-b92f-a99906fcd957",
    "thingArn": "arn:aws:iot:us-east-1:950110266426:thing/mediconnect-wearable",
    "attributes": {},
    "version": 1
}
```

## 18. CloudFront Distributions
```json
{
    "ETag": "EXP0C3UJEK2GF",
    "Distribution": {
        "Id": "E2ZU49H6L7GQPU",
        "ARN": "arn:aws:cloudfront::950110266426:distribution/E2ZU49H6L7GQPU",
        "Status": "Deployed",
        "LastModifiedTime": "2026-01-07T08:15:19.012000+00:00",
        "InProgressInvalidationBatches": 0,
        "DomainName": "d3ligzc3b5cdix.cloudfront.net",
        "ActiveTrustedSigners": {
            "Enabled": false,
            "Quantity": 0
        },
        "ActiveTrustedKeyGroups": {
            "Enabled": false,
            "Quantity": 0
        },
        "DistributionConfig": {
            "CallerReference": "216a1ebe-b326-49d3-8575-5b7561d2cbea",
            "Aliases": {
                "Quantity": 0
            },
            "DefaultRootObject": "",
            "Origins": {
                "Quantity": 1,
                "Items": [
                    {
                        "Id": "mediconnect-frontend-v1.s3.us-east-1.amazonaws.com-mk3qc52te8r",
                        "DomainName": "mediconnect-frontend-v1.s3.us-east-1.amazonaws.com",
                        "OriginPath": "",
                        "CustomHeaders": {
                            "Quantity": 0
                        },
                        "S3OriginConfig": {
                            "OriginAccessIdentity": "",
                            "OriginReadTimeout": 30
                        },
                        "ConnectionAttempts": 3,
                        "ConnectionTimeout": 10,
                        "OriginShield": {
                            "Enabled": false
                        },
                        "OriginAccessControlId": "E1HSAS741DYKG8"
                    }
                ]
            },
            "OriginGroups": {
                "Quantity": 0
            },
            "DefaultCacheBehavior": {
                "TargetOriginId": "mediconnect-frontend-v1.s3.us-east-1.amazonaws.com-mk3qc52te8r",
                "TrustedSigners": {
                    "Enabled": false,
                    "Quantity": 0
                },
                "TrustedKeyGroups": {
                    "Enabled": false,
                    "Quantity": 0
                },
                "ViewerProtocolPolicy": "redirect-to-https",
                "AllowedMethods": {
                    "Quantity": 3,
                    "Items": [
                        "HEAD",
                        "GET",
                        "OPTIONS"
                    ],
                    "CachedMethods": {
                        "Quantity": 2,
                        "Items": [
                            "HEAD",
                            "GET"
                        ]
                    }
                },
                "SmoothStreaming": false,
                "Compress": true,
                "LambdaFunctionAssociations": {
                    "Quantity": 0
                },
                "FunctionAssociations": {
                    "Quantity": 0
                },
                "FieldLevelEncryptionId": "",
                "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
                "GrpcConfig": {
                    "Enabled": false
                }
            },
            "CacheBehaviors": {
                "Quantity": 0
            },
            "CustomErrorResponses": {
                "Quantity": 1,
                "Items": [
                    {
                        "ErrorCode": 403,
                        "ResponsePagePath": "/index.html",
                        "ResponseCode": "200",
                        "ErrorCachingMinTTL": 10
                    }
                ]
            },
            "Comment": "Frontend for Mediconnect",
            "Logging": {
                "Enabled": false,
                "IncludeCookies": false,
                "Bucket": "",
                "Prefix": ""
            },
            "PriceClass": "PriceClass_All",
            "Enabled": true,
            "ViewerCertificate": {
                "CloudFrontDefaultCertificate": true,
                "SSLSupportMethod": "vip",
                "MinimumProtocolVersion": "TLSv1",
                "CertificateSource": "cloudfront"
            },
            "Restrictions": {
                "GeoRestriction": {
                    "RestrictionType": "none",
                    "Quantity": 0
                }
            },
            "WebACLId": "",
            "HttpVersion": "http2",
            "IsIPV6Enabled": true,
            "ContinuousDeploymentPolicyId": "",
            "Staging": false
        }
    }
}
```

## 19. Security Groups (mediconnect-*)
### Security Groups [us-east-1]
```json
{
    "SecurityGroups": [
        {
            "GroupId": "sg-0c2093826f18129e4",
            "IpPermissionsEgress": [
                {
                    "IpProtocol": "tcp",
                    "FromPort": 5432,
                    "ToPort": 5432,
                    "UserIdGroupPairs": [],
                    "IpRanges": [
                        {
                            "CidrIp": "0.0.0.0/0"
                        }
                    ],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                },
                {
                    "IpProtocol": "tcp",
                    "FromPort": 443,
                    "ToPort": 443,
                    "UserIdGroupPairs": [],
                    "IpRanges": [
                        {
                            "CidrIp": "0.0.0.0/0"
                        }
                    ],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ],
            "VpcId": "vpc-0fefbc3bb91a93e2d",
            "SecurityGroupArn": "arn:aws:ec2:us-east-1:950110266426:security-group/sg-0c2093826f18129e4",
            "OwnerId": "950110266426",
            "GroupName": "mediconnect-migration-sg",
            "Description": "Allow TLS and Postgres outbound for migration",
            "IpPermissions": []
        },
        {
            "GroupId": "sg-0ae552ad7e946e401",
            "IpPermissionsEgress": [
                {
                    "IpProtocol": "-1",
                    "UserIdGroupPairs": [],
                    "IpRanges": [
                        {
                            "CidrIp": "0.0.0.0/0"
                        }
                    ],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ],
            "VpcId": "vpc-0fefbc3bb91a93e2d",
            "SecurityGroupArn": "arn:aws:ec2:us-east-1:950110266426:security-group/sg-0ae552ad7e946e401",
            "OwnerId": "950110266426",
            "GroupName": "mediconnect-rds-sg-v2",
            "Description": "Allow Postgres access",
            "IpPermissions": [
                {
                    "IpProtocol": "tcp",
                    "FromPort": 5432,
                    "ToPort": 5432,
                    "UserIdGroupPairs": [],
                    "IpRanges": [
                        {
                            "CidrIp": "0.0.0.0/0"
                        }
                    ],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ]
        }
    ]
}
```

### Security Groups [eu-central-1]
```json
{
    "SecurityGroups": [
        {
            "GroupId": "sg-0f95bf61874dac888",
            "IpPermissionsEgress": [
                {
                    "IpProtocol": "-1",
                    "UserIdGroupPairs": [],
                    "IpRanges": [
                        {
                            "CidrIp": "0.0.0.0/0"
                        }
                    ],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ],
            "Tags": [
                {
                    "Key": "alpha.eksctl.io/cluster-name",
                    "Value": "mediconnect-eks-eu"
                },
                {
                    "Key": "aws:cloudformation:logical-id",
                    "Value": "ClusterSharedNodeSecurityGroup"
                },
                {
                    "Key": "aws:cloudformation:stack-name",
                    "Value": "eksctl-mediconnect-eks-eu-cluster"
                },
                {
                    "Key": "alpha.eksctl.io/eksctl-version",
                    "Value": "0.223.0"
                },
                {
                    "Key": "alpha.eksctl.io/cluster-oidc-enabled",
                    "Value": "false"
                },
                {
                    "Key": "eksctl.cluster.k8s.io/v1alpha1/cluster-name",
                    "Value": "mediconnect-eks-eu"
                },
                {
                    "Key": "Name",
                    "Value": "eksctl-mediconnect-eks-eu-cluster/ClusterSharedNodeSecurityGroup"
                },
                {
                    "Key": "aws:cloudformation:stack-id",
                    "Value": "arn:aws:cloudformation:eu-central-1:950110266426:stack/eksctl-mediconnect-eks-eu-cluster/13cd24d0-13f6-11f1-8eb6-06a39f47a997"
                }
            ],
            "VpcId": "vpc-0b8fa33a936d71698",
            "SecurityGroupArn": "arn:aws:ec2:eu-central-1:950110266426:security-group/sg-0f95bf61874dac888",
            "OwnerId": "950110266426",
            "GroupName": "eksctl-mediconnect-eks-eu-cluster-ClusterSharedNodeSecurityGroup-j87UX81mNabB",
            "Description": "Communication between all nodes in the cluster",
            "IpPermissions": [
                {
                    "IpProtocol": "-1",
                    "UserIdGroupPairs": [
                        {
                            "Description": "Allow nodes to communicate with each other (all ports)",
                            "UserId": "950110266426",
                            "GroupId": "sg-0f95bf61874dac888"
                        },
                        {
                            "Description": "Allow managed and unmanaged nodes to communicate with each other (all ports)",
                            "UserId": "950110266426",
                            "GroupId": "sg-007514aeb5769fd43"
                        }
                    ],
                    "IpRanges": [],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ]
        },
        {
            "GroupId": "sg-007514aeb5769fd43",
            "IpPermissionsEgress": [
                {
                    "IpProtocol": "-1",
                    "UserIdGroupPairs": [],
                    "IpRanges": [
                        {
                            "CidrIp": "0.0.0.0/0"
                        }
                    ],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ],
            "Tags": [
                {
                    "Key": "Name",
                    "Value": "eks-cluster-sg-mediconnect-eks-eu-1370315152"
                },
                {
                    "Key": "kubernetes.io/cluster/mediconnect-eks-eu",
                    "Value": "owned"
                },
                {
                    "Key": "aws:eks:cluster-name",
                    "Value": "mediconnect-eks-eu"
                }
            ],
            "VpcId": "vpc-0b8fa33a936d71698",
            "SecurityGroupArn": "arn:aws:ec2:eu-central-1:950110266426:security-group/sg-007514aeb5769fd43",
            "OwnerId": "950110266426",
            "GroupName": "eks-cluster-sg-mediconnect-eks-eu-1370315152",
            "Description": "EKS created security group applied to ENI that is attached to EKS Control Plane master nodes, as well as any managed workloads.",
            "IpPermissions": [
                {
                    "IpProtocol": "-1",
                    "UserIdGroupPairs": [
                        {
                            "Description": "Allow unmanaged nodes to communicate with control plane (all ports)",
                            "UserId": "950110266426",
                            "GroupId": "sg-0f95bf61874dac888"
                        },
                        {
                            "UserId": "950110266426",
                            "GroupId": "sg-09c273d80ebd9faaf"
                        }
                    ],
                    "IpRanges": [],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ]
        },
        {
            "GroupId": "sg-09d2ec5aaf2ed9555",
            "IpPermissionsEgress": [
                {
                    "IpProtocol": "-1",
                    "UserIdGroupPairs": [],
                    "IpRanges": [
                        {
                            "CidrIp": "0.0.0.0/0"
                        }
                    ],
                    "Ipv6Ranges": [],
                    "PrefixListIds": []
                }
            ],
            "Tags": [
                {
                    "Key": "aws:cloudformation:stack-name",
                    "Value": "eksctl-mediconnect-eks-eu-cluster"
                },
                {
                    "Key": "alpha.eksctl.io/cluster-oidc-enabled",
                    "Value": "false"
                },
                {
                    "Key": "eksctl.cluster.k8s.io/v1alpha1/cluster-name",
                    "Value": "mediconnect-eks-eu"
                },
                {
                    "Key": "alpha.eksctl.io/cluster-name",
                    "Value": "mediconnect-eks-eu"
                },
                {
                    "Key": "alpha.eksctl.io/eksctl-version",
                    "Value": "0.223.0"
                },
                {
                    "Key": "aws:cloudformation:logical-id",
                    "Value": "ControlPlaneSecurityGroup"
                },
                {
                    "Key": "aws:cloudformation:stack-id",
                    "Value": "arn:aws:cloudformation:eu-central-1:950110266426:stack/eksctl-mediconnect-eks-eu-cluster/13cd24d0-13f6-11f1-8eb6-06a39f47a997"
                },
                {
                    "Key": "Name",
                    "Value": "eksctl-mediconnect-eks-eu-cluster/ControlPlaneSecurityGroup"
                }
            ],
            "VpcId": "vpc-0b8fa33a936d71698",
            "SecurityGroupArn": "arn:aws:ec2:eu-central-1:950110266426:security-group/sg-09d2ec5aaf2ed9555",
            "OwnerId": "950110266426",
            "GroupName": "eksctl-mediconnect-eks-eu-cluster-ControlPlaneSecurityGroup-T0aNmA31YbpX",
            "Description": "Communication between the control plane and worker nodegroups",
            "IpPermissions": []
        }
    ]
}
```

## 20. DynamoDB Streams
### Streams [us-east-1]
```
mediconnect-appointments: {
    "StreamEnabled": true,
    "StreamViewType": "NEW_AND_OLD_IMAGES",
    "StreamArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-appointments/stream/2026-02-20T08:12:32.625"
}
mediconnect-patients: {
    "StreamEnabled": true,
    "StreamViewType": "NEW_AND_OLD_IMAGES",
    "StreamArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-patients/stream/2026-01-12T13:16:04.199"
}
mediconnect-prescriptions: {
    "StreamEnabled": true,
    "StreamViewType": "NEW_IMAGE",
    "StreamArn": "arn:aws:dynamodb:us-east-1:950110266426:table/mediconnect-prescriptions/stream/2026-01-10T22:14:05.344"
}
```

### Streams [eu-central-1]
```
mediconnect-appointments: {
    "StreamEnabled": true,
    "StreamViewType": "NEW_AND_OLD_IMAGES",
    "StreamArn": "arn:aws:dynamodb:eu-central-1:950110266426:table/mediconnect-appointments/stream/2026-02-20T08:12:59.559"
}
```

## 21. S3 Frontend Bucket
### mediconnect-frontend-v1 (CloudFront origin)
```json

An error occurred (NoSuchBucket) when calling the GetBucketVersioning operation: The specified bucket does not exist
```
#### Encryption
```

An error occurred (NoSuchBucket) when calling the GetBucketEncryption operation: The specified bucket does not exist
```
#### Public Access Block
```

An error occurred (NoSuchBucket) when calling the GetPublicAccessBlock operation: The specified bucket does not exist
```
#### Website Config
```

An error occurred (NoSuchBucket) when calling the GetBucketWebsite operation: The specified bucket does not exist
```

## 22. Cognito Identity Pools
### Identity Pools [us-east-1]
```json
{
    "IdentityPools": [
        {
            "IdentityPoolId": "us-east-1:23609247-ceb3-4fc8-88b7-af68aaa40a30",
            "IdentityPoolName": "MediconnectIdentityPoolUS"
        }
    ]
}
```
#### us-east-1:23609247-ceb3-4fc8-88b7-af68aaa40a30 [us-east-1]
```json
{
    "IdentityPoolId": "us-east-1:23609247-ceb3-4fc8-88b7-af68aaa40a30",
    "IdentityPoolName": "MediconnectIdentityPoolUS",
    "AllowUnauthenticatedIdentities": false,
    "AllowClassicFlow": false,
    "CognitoIdentityProviders": [
        {
            "ProviderName": "cognito-idp.us-east-1.amazonaws.com/us-east-1_fUsIfc7kL",
            "ClientId": "20lbag98p4vlj53eumfo11h7ac",
            "ServerSideTokenCheck": false
        },
        {
            "ProviderName": "cognito-idp.us-east-1.amazonaws.com/us-east-1_fUsIfc7kL",
            "ClientId": "6nsqer529j4c8gc688vflosomk",
            "ServerSideTokenCheck": false
        }
    ],
    "IdentityPoolTags": {}
}
```
##### Roles
```json
{
    "IdentityPoolId": "us-east-1:23609247-ceb3-4fc8-88b7-af68aaa40a30",
    "Roles": {
        "authenticated": "arn:aws:iam::950110266426:role/service-role/Cognito_MediconnectIdentityPoolUS_Auth_Role"
    }
}
```

### Identity Pools [eu-central-1]
```json
{
    "IdentityPools": [
        {
            "IdentityPoolId": "eu-central-1:5a8cd657-bd0b-41d3-b53c-eda640bf8e0f",
            "IdentityPoolName": "MediconnectIdentityPoolEU"
        }
    ]
}
```
#### eu-central-1:5a8cd657-bd0b-41d3-b53c-eda640bf8e0f [eu-central-1]
```json
{
    "IdentityPoolId": "eu-central-1:5a8cd657-bd0b-41d3-b53c-eda640bf8e0f",
    "IdentityPoolName": "MediconnectIdentityPoolEU",
    "AllowUnauthenticatedIdentities": false,
    "AllowClassicFlow": false,
    "CognitoIdentityProviders": [
        {
            "ProviderName": "cognito-idp.eu-central-1.amazonaws.com/eu-central-1_5Fc7eFLB5",
            "ClientId": "1erf0tklmpa0922e3p4eit8iqn",
            "ServerSideTokenCheck": false
        },
        {
            "ProviderName": "cognito-idp.eu-central-1.amazonaws.com/eu-central-1_5Fc7eFLB5",
            "ClientId": "4cmi171ll8dds2cfu26obila9g",
            "ServerSideTokenCheck": false
        }
    ],
    "IdentityPoolTags": {}
}
```
##### Roles
```json
{
    "IdentityPoolId": "eu-central-1:5a8cd657-bd0b-41d3-b53c-eda640bf8e0f",
    "Roles": {
        "authenticated": "arn:aws:iam::950110266426:role/service-role/Cognito_MediconnectIdentityPoolEU_Auth_Role"
    }
}
```

