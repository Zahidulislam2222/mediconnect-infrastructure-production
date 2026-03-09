#I have updated the Infrastructure section and the Tech Stack to explicitly highlight your use of Terraform. This is a critical addition because it shows you can manage "Infrastructure as Code" (IaC) across multiple clouds simultaneously.

🏥 MediConnect: Enterprise-Grade Multi-Cloud Healthcare Ecosystem

![alt text](https://img.shields.io/badge/License-MIT-blue.svg)


![alt text](https://img.shields.io/badge/Security-HIPAA%20Compliant-green.svg)


![alt text](https://img.shields.io/badge/Compliance-GDPR%20Ready-blue.svg)


![alt text](https://img.shields.io/badge/Architecture-Zero--Cost%20Idle-orange.svg)


![alt text](https://img.shields.io/badge/IaC-Terraform-623CE4.svg)

MediConnect is a state-of-the-art healthcare platform engineered for maximum security, regulatory compliance, and extreme cost-efficiency. By leveraging a Triple-Cloud Strategy (AWS, GCP, Azure) orchestrated via Terraform, the system achieves a "Zero-Cost Idle" state, scaling down to zero compute consumption when not in use.

🌐 The "Triple-Cloud" Architecture

MediConnect strategically splits workloads across the "Big Three" to maximize Free Tier offerings and specialized medical services.

Provider	Role	Component	Zero-Cost Logic
AWS	Security & Identity	Cognito, DynamoDB, SSM	50k Free MAUs / On-Demand Billing
GCP	Relational Heart	Cloud Run, Cloud SQL	Scale-to-Zero / Auto-Pause Instances
Azure	Clinical Intelligence	Container Apps, Cosmos DB	Scale-to-Zero / Serverless Request Mode
🛠️ Infrastructure as Code (Terraform)

The entire ecosystem is provisioned using Terraform, ensuring that the multi-cloud environment is reproducible, version-controlled, and documented.

Multi-Provider Orchestration: A single terraform apply manages resources across AWS, GCP, and Azure simultaneously.

State Management: Secure handling of cloud state to ensure environment consistency.

Modular Design: Separate modules for networking, databases, and compute to allow for independent scaling and updates.

Automated Secrets: Terraform handles the initial setup of the AWS SSM Parameter Store, creating the secure vault used by all microservices.

🛡️ Compliance & Security (HIPAA & GDPR)

Designed for PHI (Protected Health Information) and PII (Personally Identifiable Information) protection.

HIPAA (Health Insurance Portability and Accountability Act)

Encrypted Audit Logs: A custom-built @shared/logger interceptor automatically masks sensitive data (SSNs, Emails, Credit Cards) before they hit any log stream.

KMS Digital Signatures: All E-Prescriptions are cryptographically signed using AWS KMS to ensure anti-tamper integrity.

Encryption in Transit: Enforced TLS 1.2+ for all cross-cloud communication.

Encryption at Rest: AES-256 encryption enforced across all database tiers.

GDPR (General Data Protection Regulation)

Right to be Forgotten: Automated "Anonymization" workflows. When a user deletes their account, PII is scrubbed (e.g., John Doe becomes Deleted_User_7f8...), and data is set to auto-purge via TTL (Time-To-Live).

🚀 The Infrastructure Transition

MediConnect successfully underwent a major structural migration using the Strangler Fig Pattern.

From: A high-cost, static architecture (AWS EKS, RDS Always-On).

To: A serverless, event-driven ecosystem.

Migration Bridge: Built a custom Python-based migration container that moved data from legacy AWS DynamoDB tables into GCP PostgreSQL and Azure Cosmos DB without downtime.

🛠️ Tech Stack & Microservices
Microservices (Dockerized)

Patient Service (GCP): Identity verification, Appointment booking, and IoT Vital ingestion.

Doctor Service (Azure): Credentialing, Schedule management, and Clinical Notes.

Communication Hub (Azure): Video consultations and AI-powered real-time chat.

Core Technologies

IaC: Terraform (AWS, Google, and Azure Providers).

Backend: Node.js, TypeScript, Express.

Frontend: React (Vite), Tailwind CSS, AWS Amplify.

Mobile: Capacitor (Android/iOS cross-platform).

DevOps: Docker, Docker-Compose, Google Cloud Run, Azure Container Apps.

📈 Financial Impact: The "Zero-Cost Idle" Result

Traditional Cloud Cost: Estimated $150 - $300/month (Idle).

MediConnect Architecture: $0.00/month (Idle).

📂 Project Structure
code
Bash
download
content_copy
expand_less
├── environments/prod/       # Terraform Configuration (main.tf, variables.tf)
├── backend_v2/
│   ├── patient-service/     # GCP Cloud Run (Node/TS)
│   ├── doctor-service/      # Azure Container Apps (Node/TS)
│   ├── shared/              # HIPAA-compliant Logger & Utils
│   └── config/              # Centralized AWS SDK configuration
├── mediconnect-hub/         # Frontend (React/Vite/Capacitor)
├── modules/
│   ├── deploy_gcp.sh        # Deployment orchestration
│   └── deploy_azure.sh
└── docker-compose.yml       # Local orchestration for testing
👨‍💻 Getting Started
Infrastructure Setup

Initialize Terraform: terraform init.

Review plan: terraform plan.

Provision Cloud: terraform apply.

Local Development

Install dependencies: npm install.

Run locally: docker-compose up.

📄 License

This project is licensed under the MIT License.

Architected by Muhammad Zahidul Islam
LinkedIn | GitHub
