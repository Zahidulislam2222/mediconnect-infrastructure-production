# Phase 0: COMPLETE AWS Resource Inventory (via Resource Explorer 2)

Generated: 2026-04-05
Source: AWS Resource Explorer 2 (636 resource types indexed)
Account: 950110266426
Regions: us-east-1, eu-central-1

---

## Summary

| Metric | Value |
|---|---|
| Total Resources | 458 |
| us-east-1 | 314 |
| eu-central-1 | 144 |
| Unique Resource Types | 67 |
| AWS Services | 34 |

## Services Found

### apigateway (16 resources)

| Resource Type | Region | ARN |
|---|---|---|
| apigateway:apis | eu-central-1 | arn:aws:apigateway:eu-central-1::/apis/n37uhok3d7 |
| apigateway:apis | us-east-1 | arn:aws:apigateway:us-east-1::/apis/03n2vxsh7i |
| apigateway:apis/integrations | eu-central-1 | arn:aws:apigateway:eu-central-1::/apis/n37uhok3d7/integrations/45358rm |
| apigateway:apis/integrations | eu-central-1 | arn:aws:apigateway:eu-central-1::/apis/n37uhok3d7/integrations/6no76nl |
| apigateway:apis/integrations | eu-central-1 | arn:aws:apigateway:eu-central-1::/apis/n37uhok3d7/integrations/tluh6d1 |
| apigateway:apis/integrations | us-east-1 | arn:aws:apigateway:us-east-1::/apis/03n2vxsh7i/integrations/rllc529 |
| apigateway:apis/integrations | us-east-1 | arn:aws:apigateway:us-east-1::/apis/03n2vxsh7i/integrations/s7y5tz8 |
| apigateway:apis/integrations | us-east-1 | arn:aws:apigateway:us-east-1::/apis/03n2vxsh7i/integrations/x4666e6 |
| apigateway:apis/routes | eu-central-1 | arn:aws:apigateway:eu-central-1::/apis/n37uhok3d7/routes/5lneakv |
| apigateway:apis/routes | eu-central-1 | arn:aws:apigateway:eu-central-1::/apis/n37uhok3d7/routes/ap0nkt3 |
| apigateway:apis/routes | eu-central-1 | arn:aws:apigateway:eu-central-1::/apis/n37uhok3d7/routes/ukvde88 |
| apigateway:apis/routes | us-east-1 | arn:aws:apigateway:us-east-1::/apis/03n2vxsh7i/routes/ijbjozu |
| apigateway:apis/routes | us-east-1 | arn:aws:apigateway:us-east-1::/apis/03n2vxsh7i/routes/jzy3fbf |
| apigateway:apis/routes | us-east-1 | arn:aws:apigateway:us-east-1::/apis/03n2vxsh7i/routes/u87gtvi |
| apigateway:apis/stages | eu-central-1 | arn:aws:apigateway:eu-central-1::/apis/n37uhok3d7/stages/production |
| apigateway:apis/stages | us-east-1 | arn:aws:apigateway:us-east-1::/apis/03n2vxsh7i/stages/production |

### apprunner (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| apprunner:autoscalingconfiguration | eu-central-1 | autoscalingconfiguration/DefaultConfiguration/1/00000000000000000000000000000001 |
| apprunner:autoscalingconfiguration | us-east-1 | autoscalingconfiguration/DefaultConfiguration/1/00000000000000000000000000000001 |

### appsync (1 resources)

| Resource Type | Region | ARN |
|---|---|---|
| appsync:apis | us-east-1 | apis/fsstlusiengivc6dhupspw7zzm |

### athena (5 resources)

| Resource Type | Region | ARN |
|---|---|---|
| athena:datacatalog | eu-central-1 | datacatalog/AwsDataCatalog |
| athena:datacatalog | us-east-1 | datacatalog/AwsDataCatalog |
| athena:workgroup | eu-central-1 | workgroup/primary |
| athena:workgroup | us-east-1 | workgroup/mediconnect-analytics |
| athena:workgroup | us-east-1 | workgroup/primary |

### backup (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| backup:backup-plan | us-east-1 | backup-plan:9aa60d41-cce2-45c5-9aea-9453ee2a15cb |
| backup:backup-vault | us-east-1 | backup-vault:mediconnect-backup-vault |

### ce (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| ce:anomalymonitor | global | arn:aws:ce::950110266426:anomalymonitor/754af965-9e6f-4c86-baa7-0828d862e640 |
| ce:anomalysubscription | global | arn:aws:ce::950110266426:anomalysubscription/ad7cc371-5bde-4706-85e3-af82cbfd48ec |

### cloudformation (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| cloudformation:stack | eu-central-1 | stack/eksctl-mediconnect-eks-eu-cluster/13cd24d0-13f6-11f1-8eb6-06a39f47a997 |
| cloudformation:stack | eu-central-1 | stack/eksctl-mediconnect-eks-eu-nodegroup-standard-workers/abe02780-13f7-11f1-9de3-06039270573b |

### cloudfront (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| cloudfront:distribution | global | arn:aws:cloudfront::950110266426:distribution/E2ZU49H6L7GQPU |
| cloudfront:origin-access-control | global | arn:aws:cloudfront::950110266426:origin-access-control/E1HSAS741DYKG8 |

### cloudtrail (1 resources)

| Resource Type | Region | ARN |
|---|---|---|
| cloudtrail:trail | us-east-1 | trail/mediconnect-audit-trail |

### cloudwatch (6 resources)

| Resource Type | Region | ARN |
|---|---|---|
| cloudwatch:alarm | us-east-1 | alarm:AWS-Billing-3USD |
| cloudwatch:alarm | us-east-1 | alarm:AWS-Billing-5USD |
| cloudwatch:alarm | us-east-1 | alarm:CRITICAL-BigQuery-Down |
| cloudwatch:alarm | us-east-1 | alarm:Mediconnect-HighLatency |
| cloudwatch:alarm | us-east-1 | alarm:Mediconnect-SystemErrors |
| cloudwatch:dashboard | global | arn:aws:cloudwatch::950110266426:dashboard/Mediconnect-Ops-Dashboard |

### codepipeline (1 resources)

| Resource Type | Region | ARN |
|---|---|---|
| codepipeline:pipeline | us-east-1 | mediconnect-serverless-pipeline |

### cognito-identity (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| cognito-identity:identitypool | eu-central-1 | identitypool/eu-central-1:5a8cd657-bd0b-41d3-b53c-eda640bf8e0f |
| cognito-identity:identitypool | us-east-1 | identitypool/us-east-1:23609247-ceb3-4fc8-88b7-af68aaa40a30 |

### cognito-idp (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| cognito-idp:userpool | eu-central-1 | userpool/eu-central-1_5Fc7eFLB5 |
| cognito-idp:userpool | us-east-1 | userpool/us-east-1_fUsIfc7kL |

### dynamodb (46 resources)

| Resource Type | Region | ARN |
|---|---|---|
| dynamodb:table | eu-central-1 | table/mediconnect-appointments |
| dynamodb:table | eu-central-1 | table/mediconnect-audit-logs |
| dynamodb:table | eu-central-1 | table/mediconnect-billing-audit |
| dynamodb:table | eu-central-1 | table/mediconnect-booking-locks |
| dynamodb:table | eu-central-1 | table/mediconnect-chat-connections |
| dynamodb:table | eu-central-1 | table/mediconnect-chat-history |
| dynamodb:table | eu-central-1 | table/mediconnect-clinical-notes |
| dynamodb:table | eu-central-1 | table/mediconnect-content-cache |
| dynamodb:table | eu-central-1 | table/mediconnect-doctor-schedules |
| dynamodb:table | eu-central-1 | table/mediconnect-doctors |
| dynamodb:table | eu-central-1 | table/mediconnect-drug-interactions |
| dynamodb:table | eu-central-1 | table/mediconnect-graph-data |
| dynamodb:table | eu-central-1 | table/mediconnect-health-records |
| dynamodb:table | eu-central-1 | table/mediconnect-iot-vitals |
| dynamodb:table | eu-central-1 | table/mediconnect-knowledge-base |
| dynamodb:table | eu-central-1 | table/mediconnect-medical-records |
| dynamodb:table | eu-central-1 | table/mediconnect-patients |
| dynamodb:table | eu-central-1 | table/mediconnect-pharmacy-inventory |
| dynamodb:table | eu-central-1 | table/mediconnect-predictions |
| dynamodb:table | eu-central-1 | table/mediconnect-prescriptions |
| dynamodb:table | eu-central-1 | table/mediconnect-symptom-logs |
| dynamodb:table | eu-central-1 | table/mediconnect-transactions |
| dynamodb:table | eu-central-1 | table/mediconnect-video-sessions |
| dynamodb:table | us-east-1 | table/mediconnect-appointments |
| dynamodb:table | us-east-1 | table/mediconnect-audit-logs |
| dynamodb:table | us-east-1 | table/mediconnect-billing-audit |
| dynamodb:table | us-east-1 | table/mediconnect-booking-locks |
| dynamodb:table | us-east-1 | table/mediconnect-chat-connections |
| dynamodb:table | us-east-1 | table/mediconnect-chat-history |
| dynamodb:table | us-east-1 | table/mediconnect-clinical-notes |
| dynamodb:table | us-east-1 | table/mediconnect-content-cache |
| dynamodb:table | us-east-1 | table/mediconnect-doctor-schedules |
| dynamodb:table | us-east-1 | table/mediconnect-doctors |
| dynamodb:table | us-east-1 | table/mediconnect-drug-interactions |
| dynamodb:table | us-east-1 | table/mediconnect-graph-data |
| dynamodb:table | us-east-1 | table/mediconnect-health-records |
| dynamodb:table | us-east-1 | table/mediconnect-iot-vitals |
| dynamodb:table | us-east-1 | table/mediconnect-knowledge-base |
| dynamodb:table | us-east-1 | table/mediconnect-medical-records |
| dynamodb:table | us-east-1 | table/mediconnect-patients |
| dynamodb:table | us-east-1 | table/mediconnect-pharmacy-inventory |
| dynamodb:table | us-east-1 | table/mediconnect-predictions |
| dynamodb:table | us-east-1 | table/mediconnect-prescriptions |
| dynamodb:table | us-east-1 | table/mediconnect-symptom-logs |
| dynamodb:table | us-east-1 | table/mediconnect-transactions |
| dynamodb:table | us-east-1 | table/mediconnect-video-sessions |

### ec2 (74 resources)

| Resource Type | Region | ARN |
|---|---|---|
| ec2:dhcp-options | eu-central-1 | dhcp-options/dopt-08be69d64a07cc5d6 |
| ec2:dhcp-options | us-east-1 | dhcp-options/dopt-0fe701b9427c435db |
| ec2:internet-gateway | eu-central-1 | internet-gateway/igw-02ec53b7aa03219ca |
| ec2:internet-gateway | eu-central-1 | internet-gateway/igw-055ddfc72b357468b |
| ec2:internet-gateway | us-east-1 | internet-gateway/igw-0b34d938dd641729e |
| ec2:key-pair | us-east-1 | key-pair/key-0c3abfe385a45e922 |
| ec2:launch-template | eu-central-1 | launch-template/lt-069b4efb021840ae6 |
| ec2:network-acl | eu-central-1 | network-acl/acl-029587bcf0a98a40f |
| ec2:network-acl | eu-central-1 | network-acl/acl-0fe0a7eae0b482703 |
| ec2:network-acl | us-east-1 | network-acl/acl-04ce980e04c532949 |
| ec2:network-interface | eu-central-1 | network-interface/eni-01d095a677340e29b |
| ec2:route-table | eu-central-1 | route-table/rtb-005a85abb66657037 |
| ec2:route-table | eu-central-1 | route-table/rtb-031003deebb43ea78 |
| ec2:route-table | eu-central-1 | route-table/rtb-0b4a42b028171ca69 |
| ec2:route-table | eu-central-1 | route-table/rtb-0c00f31cf43e603bd |
| ec2:route-table | eu-central-1 | route-table/rtb-0c03455bdabbe9522 |
| ec2:route-table | eu-central-1 | route-table/rtb-0f0f56481bc425a50 |
| ec2:route-table | us-east-1 | route-table/rtb-0e429e516dab9177c |
| ec2:security-group | eu-central-1 | security-group/sg-007514aeb5769fd43 |
| ec2:security-group | eu-central-1 | security-group/sg-00a5eadba419ffc76 |
| ec2:security-group | eu-central-1 | security-group/sg-012a02a0da5a360a3 |
| ec2:security-group | eu-central-1 | security-group/sg-09c273d80ebd9faaf |
| ec2:security-group | eu-central-1 | security-group/sg-09d2ec5aaf2ed9555 |
| ec2:security-group | eu-central-1 | security-group/sg-0f95bf61874dac888 |
| ec2:security-group | us-east-1 | security-group/sg-00dab85cf7831d5ab |
| ec2:security-group | us-east-1 | security-group/sg-0829451c380801ca8 |
| ec2:security-group | us-east-1 | security-group/sg-0ae552ad7e946e401 |
| ec2:security-group | us-east-1 | security-group/sg-0c2093826f18129e4 |
| ec2:security-group | us-east-1 | security-group/sg-0cbe2bd51ff22f191 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0207b058f09bf3b71 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0288bfb82ab9fbdbf |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-03483789e4c980446 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-03d7e2130c7426d05 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-078046e23ac1e060c |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-07a44cf46751f9b67 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-08baa1ec5a005cc70 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0920a472006db4023 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0b10df519b7bedcf8 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0b8de86704099fb43 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0c7796322e2375dff |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0d1e49191e1c88e35 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0e2baaea12cd9c052 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0ec7c645fa7f385b2 |
| ec2:security-group-rule | eu-central-1 | security-group-rule/sgr-0ef07cb4d87418339 |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-008d3585070707f4c |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-0090f848bf1143683 |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-00a26d434ed8b5067 |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-00f46c75ed3f38c95 |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-01819fa76bcdb1270 |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-031cf481018f15733 |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-041245f197be971df |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-05ac9588f34c0e8be |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-07b6efe899a7b5d8e |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-0bc93a7a5dd003a91 |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-0e266310cac1e7de9 |
| ec2:security-group-rule | us-east-1 | security-group-rule/sgr-0f78271595b516ca2 |
| ec2:subnet | eu-central-1 | subnet/subnet-01a3b35057184fc05 |
| ec2:subnet | eu-central-1 | subnet/subnet-029220e9852dc9de2 |
| ec2:subnet | eu-central-1 | subnet/subnet-02ae1ede5367476d1 |
| ec2:subnet | eu-central-1 | subnet/subnet-035a2d2fedfbde2ee |
| ec2:subnet | eu-central-1 | subnet/subnet-05603477f489d99df |
| ec2:subnet | eu-central-1 | subnet/subnet-068b124e2ec0270a1 |
| ec2:subnet | eu-central-1 | subnet/subnet-088be276d730328b6 |
| ec2:subnet | eu-central-1 | subnet/subnet-09fa8bba77de8ea48 |
| ec2:subnet | eu-central-1 | subnet/subnet-0c7ca8958c10c95ab |
| ec2:subnet | us-east-1 | subnet/subnet-020e5ec2162829485 |
| ec2:subnet | us-east-1 | subnet/subnet-06f10fa507ba9c979 |
| ec2:subnet | us-east-1 | subnet/subnet-0821b082a7bd2c827 |
| ec2:subnet | us-east-1 | subnet/subnet-0baa14d87ad04cc0e |
| ec2:subnet | us-east-1 | subnet/subnet-0c9041b6150175701 |
| ec2:subnet | us-east-1 | subnet/subnet-0f40af60de48144e4 |
| ec2:vpc | eu-central-1 | vpc/vpc-0b8fa33a936d71698 |
| ec2:vpc | eu-central-1 | vpc/vpc-0dafaf04abe0e7201 |
| ec2:vpc | us-east-1 | vpc/vpc-0fefbc3bb91a93e2d |

### ecr (5 resources)

| Resource Type | Region | ARN |
|---|---|---|
| ecr:repository | eu-central-1 | repository/booking-service |
| ecr:repository | eu-central-1 | repository/communication-service |
| ecr:repository | eu-central-1 | repository/doctor-service |
| ecr:repository | eu-central-1 | repository/patient-service |
| ecr:repository | us-east-1 | repository/mediconnect-migration-job |

### ecs (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| ecs:cluster | us-east-1 | cluster/mediconnect-migration-cluster |
| ecs:task-definition | us-east-1 | task-definition/mediconnect-migration-task:1 |

### elasticache (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| elasticache:user | eu-central-1 | user:default |
| elasticache:user | us-east-1 | user:default |

### elasticloadbalancing (3 resources)

| Resource Type | Region | ARN |
|---|---|---|
| elasticloadbalancing:loadbalancer | eu-central-1 | loadbalancer/aab330f0d797f48339d97c602b524712 |
| elasticloadbalancing:targetgroup | eu-central-1 | targetgroup/k8s-ingressn-ingressn-58b50db24c/97008511ee49247d |
| elasticloadbalancing:targetgroup | eu-central-1 | targetgroup/k8s-ingressn-ingressn-9b25cc47c1/7136fa44b597ff10 |

### events (5 resources)

| Resource Type | Region | ARN |
|---|---|---|
| events:event-bus | eu-central-1 | event-bus/default |
| events:event-bus | us-east-1 | event-bus/default |
| events:rule | eu-central-1 | rule/AutoScalingManagedRule |
| events:rule | eu-central-1 | rule/mediconnect-stop-recording-rule |
| events:rule | us-east-1 | rule/mediconnect-stop-recording-rule |

### glue (2 resources)

| Resource Type | Region | ARN |
|---|---|---|
| glue:database | us-east-1 | database/mediconnect_datalake |
| glue:table | us-east-1 | table/mediconnect_datalake/raw_events |

### iam (115 resources)

| Resource Type | Region | ARN |
|---|---|---|
| iam:oidc-provider | global | arn:aws:iam::950110266426:oidc-provider/accounts.google.com |
| iam:oidc-provider | global | arn:aws:iam::950110266426:oidc-provider/eastus.oic.prod-aks.azure.com/678754f1-dc64-4a18-8ccb-58c3ec705230/b5e2854f-fb7e-4e28-a284-f6a3f63f6128/ |
| iam:oidc-provider | global | arn:aws:iam::950110266426:oidc-provider/oidc.eks.eu-central-1.amazonaws.com/id/10DD5939B2195EF92160F940FA905703 |
| iam:oidc-provider | global | arn:aws:iam::950110266426:oidc-provider/token.actions.githubusercontent.com |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/Amazon_EventBridge_Invoke_Lambda_1111363594 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/Amazon_EventBridge_Invoke_Lambda_1719528660 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/Amazon-EventBridge-Scheduler-Execution-Policy-f6398327-fb77-4bef-bfe6-5ceb81356f51 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/aws-iot-role-logging_1768170083755 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/aws-iot-rule-CriticalHeartAlert-action-1-role-IoTSNSRole |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/aws-iot-rule-StoreAndSyncVitals-action-1-role-IoTDynamoRole |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-1c07ad03-b75a-4f2c-86c4-febcaecc6b12 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-24919b12-c4ef-43b3-a0f8-60ce446d5fad |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-2aae0d02-d32a-448f-8696-b3adb491fe8c |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-36d01051-a9cb-4b1c-bb8b-79a79df13a5e |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-3a24a35e-2bea-4058-b58f-86523f89d500 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-3a87352e-25e5-4353-9f24-b3841abe5666 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-3c7b50b9-6b19-4e0e-baa2-df6c8869d885 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-409324f6-40e1-4458-8a0a-4ba2b8dd9740 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-44be0fd6-b6ac-4733-8587-eb0be7201e21 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-4fb40f7a-2f7e-4eec-af15-800d53eecc49 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-566f09a9-53b2-4c66-a4e8-1b16eee6fef5 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-5a794462-eddb-47e2-967d-8e89f7fd24a7 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-5b31be71-70e1-47fc-801c-e5b6228f4443 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-6897db2f-5735-425f-87a6-e9952106e39c |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-6a05061b-a24e-427a-9340-da0402a578ce |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-702add09-41be-4e0a-8ce7-31acfce80e47 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-a0d74f84-740a-4e66-9be3-cdafe886ff98 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-a75b347c-1536-45cf-a38d-93e19f11ef5e |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-a78ab2f5-9124-48a5-99b0-6813c659de18 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-ab8091c4-57fa-4ccd-8adf-997eef44b634 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-af625128-d2cb-4ff3-8cb6-f2d115c0ad88 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-cd3f460a-3615-4560-b001-5f4eda976137 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-ceae4852-54cc-42f5-a533-a518e1e1faeb |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-d1ed3088-4f48-4cfe-af31-42ab5408b144 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-e66fe07b-4e62-4e9a-93bd-eee12a3eb276 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-f12d214b-8bcb-4f87-96ff-2c67b23f073f |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-f13bf7a3-d2c7-41b6-9834-e891988614c4 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-f3c39e03-1dc2-4151-a2b9-dd579ba10f63 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-f88e44ee-dbc1-401c-b9a7-fee1c5c24f60 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/AWSLambdaBasicExecutionRole-fc98eb38-8ca2-470e-8942-102cb3673172 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/Cognito-authenticated-1768485838743 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/Cognito-authenticated-1771840544377 |
| iam:policy | global | arn:aws:iam::950110266426:policy/service-role/Cognito-authenticated-1771840629369 |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/autoscaling.amazonaws.com/AWSServiceRoleForAutoScaling |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/eks-nodegroup.amazonaws.com/AWSServiceRoleForAmazonEKSNodegroup |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/eks.amazonaws.com/AWSServiceRoleForAmazonEKS |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/elasticloadbalancing.amazonaws.com/AWSServiceRoleForElasticLoadBalancing |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/ops.apigateway.amazonaws.com/AWSServiceRoleForAPIGateway |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/resource-explorer-2.amazonaws.com/AWSServiceRoleForResourceExplorer |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/support.amazonaws.com/AWSServiceRoleForSupport |
| iam:role | global | arn:aws:iam::950110266426:role/aws-service-role/trustedadvisor.amazonaws.com/AWSServiceRoleForTrustedAdvisor |
| iam:role | global | arn:aws:iam::950110266426:role/Azure-to-AWS-Bridge-Role |
| iam:role | global | arn:aws:iam::950110266426:role/eksctl-mediconnect-eks-eu-cluster-ServiceRole-VSbZ5eHaoWl0 |
| iam:role | global | arn:aws:iam::950110266426:role/eksctl-mediconnect-eks-eu-nodegrou-NodeInstanceRole-F7QXo0jgDluv |
| iam:role | global | arn:aws:iam::950110266426:role/GitHubActionsRole |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-admin-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-azure-role-us |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-booking-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-comm-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-dicom-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-doctor-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-eks-pod-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-lambda-shared-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-migration-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-patient-role |
| iam:role | global | arn:aws:iam::950110266426:role/mediconnect-staff-role |
| iam:role | global | arn:aws:iam::950110266426:role/MediconnectBillingRole |
| iam:role | global | arn:aws:iam::950110266426:role/MediconnectBuildRole |
| iam:role | global | arn:aws:iam::950110266426:role/MediConnectDoctorVerificationRole |
| iam:role | global | arn:aws:iam::950110266426:role/MediConnectEmergencyRole |
| iam:role | global | arn:aws:iam::950110266426:role/MediconnectLambdaRole |
| iam:role | global | arn:aws:iam::950110266426:role/MediconnectPipelineRole |
| iam:role | global | arn:aws:iam::950110266426:role/MediconnectReplicationRole |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/Amazon_EventBridge_Invoke_Lambda_1111363594 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/Amazon_EventBridge_Invoke_Lambda_1719528660 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/Amazon_EventBridge_Scheduler_LAMBDA_cf1b8a171e |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/AWSIoTLoggingRole |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/Cognito_MediconnectIdentityPoolEU_Auth_Role |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/Cognito_MediconnectIdentityPoolUS_Auth_Role |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/IoTDynamoRole |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/IoTSNSRole |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-auto-group-eu-role-ewcj2kcy |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-auto-group-us-role-msj8mvre |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-billing-service-role-rfaptbgu |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-book-appointment-role-q8q3s008 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-cancel-appointment-role-43pkwks2 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-cleanup-recordings-role-g9twqdgq |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-cleanup-recordings-role-i088yo9g |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-cleanup-service-role-6p3uo83y |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-create-doctor-role-7vu5yt62 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-create-patient-role-a2tin7y6 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-ehr-service-role-qu55gdhw |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-failover-proxy-role-enf1d6hy |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-failover-proxy-role-jehbuy9v |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-file-sharing-service-role-yv0v6kc2 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-get-appointments-role-8f7rs7ve |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-get-doctors-role-bgepsu8i |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-get-patients-role-4p2aska2 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-get-vitals-role-vttgimn7 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-graph-service-role-50gdzyo0 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-imaging-service-role-genwi8el |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-iot-gcp-sync-role-benw9tph |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-prescription-service-role-5pr8s84o |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-stream-to-bigquery-role-rht3ozce |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-symptom-checker-role-hmvxvqh5 |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-update-schedule-role-ul1us2xa |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-websocket-handler-role-ibksgcey |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-ws-authorizer-role-5u712lso |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/mediconnect-ws-authorizer-role-62a577ny |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/MediconnectAnalyticsRole |
| iam:role | global | arn:aws:iam::950110266426:role/service-role/verify-identity-role-nc0fd8xw |
| iam:user | global | arn:aws:iam::950110266426:user/terraform.admin |
| iam:user | global | arn:aws:iam::950110266426:user/zahidul.admin |

### iot (3 resources)

| Resource Type | Region | ARN |
|---|---|---|
| iot:rule | us-east-1 | rule/CriticalHeartAlert |
| iot:rule | us-east-1 | rule/StoreAndSyncVitals |
| iot:thing | us-east-1 | thing/mediconnect-wearable |

### kms (13 resources)

| Resource Type | Region | ARN |
|---|---|---|
| kms:key | eu-central-1 | key/07cb3935-8b4a-4595-8e8d-5df6a0885d19 |
| kms:key | eu-central-1 | key/4f82b264-b5c5-4f13-a237-ba99a9eb586e |
| kms:key | eu-central-1 | key/8ae1cdb6-21a0-4be9-9855-ac6978e65756 |
| kms:key | eu-central-1 | key/ad59022a-8fe7-4159-a1c3-181877f9d4d0 |
| kms:key | eu-central-1 | key/d887553a-87b4-4798-8ce3-445447b89099 |
| kms:key | us-east-1 | key/203d1299-2af6-444e-bf25-6bdae5d16433 |
| kms:key | us-east-1 | key/496d121c-7da8-4d32-bb03-7095b00bd237 |
| kms:key | us-east-1 | key/5e054267-186e-47fd-8cd3-0c5a8a0b0c94 |
| kms:key | us-east-1 | key/7ea417c7-b6a1-4f8f-beda-2b7900f7c01e |
| kms:key | us-east-1 | key/8b8ebaa0-949e-44e6-8dd1-a6aff1dbda73 |
| kms:key | us-east-1 | key/9ec9d9af-8a4e-4a42-8c09-321c76f232bf |
| kms:key | us-east-1 | key/edd45046-214f-4137-8d14-be93d58eaaad |
| kms:key | us-east-1 | key/f3b06cc2-d4bc-4947-8c92-451310f8729c |

### lambda (11 resources)

| Resource Type | Region | ARN |
|---|---|---|
| lambda:event-source-mapping | us-east-1 | event-source-mapping:41f3b83b-f58f-4fe0-9f57-583eaa81d5b3 |
| lambda:function | eu-central-1 | function:mediconnect-auto-group-eu |
| lambda:function | eu-central-1 | function:mediconnect-cleanup-recordings |
| lambda:function | eu-central-1 | function:mediconnect-cognito-triggers |
| lambda:function | eu-central-1 | function:mediconnect-failover-proxy |
| lambda:function | eu-central-1 | function:mediconnect-ws-authorizer |
| lambda:function | us-east-1 | function:mediconnect-auto-group-us |
| lambda:function | us-east-1 | function:mediconnect-cleanup-recordings |
| lambda:function | us-east-1 | function:mediconnect-cognito-triggers |
| lambda:function | us-east-1 | function:mediconnect-failover-proxy |
| lambda:function | us-east-1 | function:mediconnect-ws-authorizer |

### logs (37 resources)

| Resource Type | Region | ARN |
|---|---|---|
| logs:log-group | eu-central-1 | log-group:/aws/lambda/mediconnect-auto-group-eu |
| logs:log-group | eu-central-1 | log-group:/aws/lambda/mediconnect-failover-proxy |
| logs:log-group | eu-central-1 | log-group:/aws/lambda/mediconnect-ws-authorizer |
| logs:log-group | us-east-1 | log-group:/aws/lambda/DoctorDiplomaScanner |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-ai-predictor |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-analytics-router |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-analytics-setup |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-auto-group-us |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-billing-service |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-book-appointment |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-cancel-appointment |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-chatbot |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-cleanup-service |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-create-doctor |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-create-patient |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-ehr-service |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-emergency-booking |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-failover-proxy |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-file-sharing-service |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-get-appointments |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-get-doctors |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-get-patients |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-get-vitals |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-graph-service |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-imaging-service |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-iot-gcp-sync |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-payment-processor |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-pharmacy-service |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-prescription-service |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-stream-to-bigquery |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-symptom-checker |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-update-schedule |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-websocket-handler |
| logs:log-group | us-east-1 | log-group:/aws/lambda/mediconnect-ws-authorizer |
| logs:log-group | us-east-1 | log-group:/aws/lambda/verify-identity |
| logs:log-group | us-east-1 | log-group:/ecs/mediconnect-migration |
| logs:log-group | us-east-1 | log-group:AWSIotLogsV2 |

### memorydb (15 resources)

| Resource Type | Region | ARN |
|---|---|---|
| memorydb:acl | eu-central-1 | acl/open-access |
| memorydb:acl | us-east-1 | acl/open-access |
| memorydb:parametergroup | eu-central-1 | parametergroup/default.memorydb-redis6 |
| memorydb:parametergroup | eu-central-1 | parametergroup/default.memorydb-redis7 |
| memorydb:parametergroup | eu-central-1 | parametergroup/default.memorydb-redis7.search |
| memorydb:parametergroup | eu-central-1 | parametergroup/default.memorydb-valkey7 |
| memorydb:parametergroup | eu-central-1 | parametergroup/default.memorydb-valkey7.search |
| memorydb:parametergroup | us-east-1 | parametergroup/default.memorydb-redis6 |
| memorydb:parametergroup | us-east-1 | parametergroup/default.memorydb-redis7 |
| memorydb:parametergroup | us-east-1 | parametergroup/default.memorydb-redis7.search |
| memorydb:parametergroup | us-east-1 | parametergroup/default.memorydb-redis7.search.preview |
| memorydb:parametergroup | us-east-1 | parametergroup/default.memorydb-valkey7 |
| memorydb:parametergroup | us-east-1 | parametergroup/default.memorydb-valkey7.search |
| memorydb:user | eu-central-1 | user/default |
| memorydb:user | us-east-1 | user/default |

### rds (6 resources)

| Resource Type | Region | ARN |
|---|---|---|
| rds:og | us-east-1 | og:default:postgres-16 |
| rds:og | us-east-1 | og:default:postgres-17 |
| rds:pg | us-east-1 | pg:default.postgres16 |
| rds:pg | us-east-1 | pg:default.postgres17 |
| rds:subgrp | us-east-1 | subgrp:default |
| rds:subgrp | us-east-1 | subgrp:default-vpc-0fefbc3bb91a93e2d |

### resource-explorer-2 (4 resources)

| Resource Type | Region | ARN |
|---|---|---|
| resource-explorer-2:index | eu-central-1 | index/44731fa4-14c4-4ab5-ac6c-c8f4e3ec505d |
| resource-explorer-2:index | us-east-1 | index/34041563-3cf0-4711-94ad-dad56f850ef2 |
| resource-explorer-2:view | eu-central-1 | view/eu-central-1/50e387f6-c253-4bff-90ac-f2558777365a |
| resource-explorer-2:view | us-east-1 | view/us-east-1/44b12dae-7221-4b76-b469-8f6fd5819b61 |

### s3 (18 resources)

| Resource Type | Region | ARN |
|---|---|---|
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-audit-logs-950110266426 |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-cicd-950110266426 |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-consultation-files |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-consultation-recordings |
| s3:bucket | eu-central-1 | arn:aws:s3:::mediconnect-consultation-recordings-eu |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-datalake-950110266426 |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-doctor-data |
| s3:bucket | eu-central-1 | arn:aws:s3:::mediconnect-doctor-data-eu |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-ehr-records |
| s3:bucket | eu-central-1 | arn:aws:s3:::mediconnect-ehr-records-eu |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-media-assets |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-medical-images |
| s3:bucket | eu-central-1 | arn:aws:s3:::mediconnect-medical-images-eu |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-patient-data |
| s3:bucket | eu-central-1 | arn:aws:s3:::mediconnect-patient-data-eu |
| s3:bucket | us-east-1 | arn:aws:s3:::mediconnect-prescriptions |
| s3:bucket | eu-central-1 | arn:aws:s3:::mediconnect-prescriptions-eu |
| s3:storage-lens | us-east-1 | storage-lens/default-account-dashboard |

### ses (4 resources)

| Resource Type | Region | ARN |
|---|---|---|
| ses:identity | eu-central-1 | identity/mehzsolution@gmail.com |
| ses:identity | eu-central-1 | identity/muhammadzahidulislam2222@gmail.com |
| ses:identity | us-east-1 | identity/mehzsolution@gmail.com |
| ses:identity | us-east-1 | identity/muhammadzahidulislam2222@gmail.com |

### sns (8 resources)

| Resource Type | Region | ARN |
|---|---|---|
| sns:topic | eu-central-1 | mediconnect-high-risk-alerts-eu |
| sns:topic | us-east-1 | AWS-Billing-USD3 |
| sns:topic | us-east-1 | billing-alert |
| sns:topic | us-east-1 | mediconnect-appointments |
| sns:topic | us-east-1 | mediconnect-high-risk-alerts |
| sns:topic | us-east-1 | mediconnect-ops-alerts |
| sns:topic | us-east-1 | mediconnect-pharmacy-alerts |
| sns:topic | us-east-1 | mediconnect-prescription-alerts |

### sqs (1 resources)

| Resource Type | Region | ARN |
|---|---|---|
| sqs:queue | us-east-1 | mediconnect-dlq |

### ssm (40 resources)

| Resource Type | Region | ARN |
|---|---|---|
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/cognito/client_id_doctor |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/cognito/client_id_eu_doctor |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/cognito/client_id_eu_patient |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/cognito/client_id_patient |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/cognito/user_pool_id |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/cognito/user_pool_id_eu |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/db/doctor_table |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/db/patient_table |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/google/client_id |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/google/client_secret |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/kms/signing_key_id |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/mqtt/endpoint |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/s3/doctor_identity_bucket |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/s3/patient_identity_bucket |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/sns/topic_arn_eu |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/sns/topic_arn_us |
| ssm:parameter | eu-central-1 | parameter/mediconnect/prod/stripe/secret_key |
| ssm:parameter | eu-central-1 | parameter/mediconnect/stripe/keys |
| ssm:parameter | eu-central-1 | parameter/mediconnect/stripe/webhook_secret |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/azure/cosmos/endpoint |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/azure/cosmos/primary_key |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/cognito/client_id_doctor |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/cognito/client_id_eu_doctor |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/cognito/client_id_eu_patient |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/cognito/client_id_patient |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/cognito/user_pool_id |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/cognito/user_pool_id_eu |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/db/doctor_table |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/db/patient_table |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/google/client_id |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/google/client_secret |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/kms/signing_key_id |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/mqtt/endpoint |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/s3/doctor_identity_bucket |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/s3/patient_identity_bucket |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/sns/topic_arn_eu |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/sns/topic_arn_us |
| ssm:parameter | us-east-1 | parameter/mediconnect/prod/stripe/secret_key |
| ssm:parameter | us-east-1 | parameter/mediconnect/stripe/keys |
| ssm:parameter | us-east-1 | parameter/mediconnect/stripe/webhook_secret |

