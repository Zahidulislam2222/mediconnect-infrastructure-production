# Release, monitoring and recovery operations

Reviewed 2026-10-13. These procedures define required operation. Staffing, alert delivery, off-host recovery and sustained SLO performance require their own evidence; they are not established by this document.

## Release procedure

1. Write acceptance criteria and identify source, public configuration and affected data/resources.
2. Inventory the actual target and capture drift, capacity, service state and neighboring workloads.
3. Reconcile live-ahead drift locally before editing. Keep an auditable before snapshot.
4. Implement and pass affected tests, typing, lint, scans, build and independent review.
5. Freeze source/configuration/image manifests; verify publisher identity, Git target and workflow effects.
6. Confirm backup/rollback, current capacity and applicable approvals; stage only the allowlisted payload.
7. Deploy the application locally-built artifact to its exclusive target. Avoid unrelated/shared-stack changes.
8. Verify every touched artifact hash, active source/image/configuration, real flow, access controls, resource caps and sibling health.
9. Record exact Git/active release references, results and remaining gates. Preserve failed attempts and update recovery records.

A successful branch push, build or health endpoint alone does not complete deployment. Recheck remote SHA and workflow results separately. Infrastructure/state changes require native inventory, a reviewed plan and operator execution. Paid actions require a separate explicit cost approval.

## Monitoring and ownership

| Signal | Required action path |
|---|---|
| Public/critical journey success and latency | Regional synthetic and user-visible metrics; route to the assigned service owner |
| Error-budget consumption | Multi-window burn-rate alerts and release policy from [reliability](RELIABILITY.md) |
| Authentication/authorization anomalies | Rate-limit and deny metrics; security triage without logging credentials |
| Queue depth, saturation, CPU/RAM/disk | Backpressure/capacity action before exhaustion; avoid uncontrolled scaling |
| Database/object/index integrity and replication | Owner escalation, reconciliation and recovery decision |
| Model ingestion/search readiness | Dependency, queue, source freshness and grounded-response checks |
| Backups, certificate expiry and dependency advisories | Timely renewal/repair with verification and recorded owner |

Before sustained service activation, assign primary/secondary on-call owners, coverage, severity levels, acknowledgment/escalation targets and an accessible status/communication channel. Exercise actual alert delivery and an operator response; installed dashboards do not prove monitoring coverage.

Telemetry must use approved destinations, field allowlists and retention. Keep PHI, document bodies, keys and provider error payloads out of ordinary logs. Use bounded synthetic inputs for external availability checks. See [privacy](PRIVACY-AND-DATA.md).

## Backup inventory and consistency

Back up configuration/release manifests and necessary application data: regional stores, approved uploads, CMS database plus referenced media, knowledge stores/indexes, source/provenance inventory and required recovery material. Record model/image digests and a reproducible recovery path; model weights may be restored from verified licensed sources if that meets recovery objectives. Inventory any generated service identity as well.

Use an application-consistent checkpoint: quiesce writes or use supported transactional snapshots, flush/finalize indexes and capture related stores at a known point. Produce an integrity manifest, encrypt before transfer, verify the authorized off-device destination and separate the recovery key from the encrypted backup. Restrict access and retention; do not bundle unrelated project credentials.

The owner confirmed on 2026-10-13 that the recovery key is stored separately offline. This is custody confirmation; it does not establish successful decryption/restoration or an independent physical audit. Consistent live CMS/RAG backup and off-host restoration remain open.

## Restore exercise

Restore into an isolated environment with fresh network/authentication controls. Verify backup authenticity/integrity, decrypt without exposing keys, restore all related stores, and reconcile record/media/index counts. Exercise representative reads/writes, permissions, cross-workspace denial and search. Check that deleted/held records follow policy. Measure data loss and recovery time against [RPO/RTO objectives](RELIABILITY.md).

Record backup identifier/time, source/configuration/image references, destination class, consistency method, integrity results, measured RPO/RTO and operator sign-off. A copied archive or successful local file extraction is not full application recovery.

## Incidents and rollback

For an incident, assign an owner and severity, contain the affected boundary, preserve restricted evidence and determine customer/data impact. Use the jurisdiction-specific notification matrix from [law](COMPLIANCE-AND-LAW.md). Communicate verified facts and the next update time through the approved channel.

Rollback to a previously verified artifact only after checking data/schema compatibility and configuration. Pause irreversible writes when necessary; reconcile partially completed payments/jobs rather than replaying blindly. Verify restored service, privacy and neighboring workloads. Add escaped defects and the missing preventive gate to the defect record, and retain the incident lesson.

## Recovery from interrupted maintenance

Maintain a durable active checkpoint before work, at each milestone and during long gates. Include exact unfinished edits, commands, last verified results, evidence paths, next action and restrictions. Use atomic writes and preserve earlier checkpoints. The next operator must inspect actual process/target state before resuming; never automatically repeat an uncertain upload, activation or mutation.
