# Knowledge and AI governance

Reviewed 2026-10-13. MediConnect's knowledge assistant is intended to provide general information grounded in approved sources. It must not independently diagnose, prescribe, authorize care, change records, execute payments or decide access. Clinical functions require their own intended-use assessment and activation approval.

## Accountability and source lifecycle

Assign an accountable product owner, qualified health-content reviewer and security/privacy reviewer before release. Keep an inventory of model/provider version and license, prompts/templates, knowledge corpus, embedding configuration, evaluation dataset and deployment revision. Each source needs permission/license, provenance, review date, owner and retirement policy.

Medical public content and developer codebase content use separate workspaces and access boundaries. Exclude credentials, private operational detail and identifiable patient material from the public corpus. Review changes before ingestion. Deleting a source must also address derived chunks, entities, embeddings and cached answers.

## Runtime behavior

- Authenticate and authorize before retrieval. Model output never grants a role or expands the caller's scope.
- Treat document instructions and tool-like output as data; do not execute them.
- Return attributable sources with answers and make uncertainty/limitations understandable.
- Decline unsupported claims and provide an appropriate human route when evidence is missing.
- Keep emergency guidance explicit and localizable; the assistant is not an emergency response service.
- Bound input, retrieval, generation, queue size and deadlines; propagate cancellation and fail safely when dependencies are unavailable.
- Keep provider execution explicit. No paid fallback, external data transfer or training reuse is implied by a local-model deployment.

## Evaluation and acceptance

| Area | Required cases and measurements |
|---|---|
| Retrieval | Curated answerable/unanswerable queries, relevance, source coverage, citation accuracy, stale/deleted content and empty corpus |
| Grounding | Claim support against source passages, contradiction handling, appropriate abstention and reviewer agreement |
| Health safety | Emergency language, contraindication-sensitive questions, unsupported diagnosis/prescription requests and escalation |
| Security | Prompt injection, poisoned documents, malicious links, cross-workspace keys/tokens, data exfiltration and oversized inputs |
| Privacy | Minimization, sensitive text in request/log/error paths, retention/deletion, provider boundaries and consent where applicable |
| Fairness/accessibility | Representative language/readability and user needs, with reviewed failure analysis |
| Operations | Actual generation, embedding dimensions, ingestion completion, repeatability, cancellation, queue saturation, restart, backup and restore |

Define numeric thresholds, corpus size, reviewer rubric and release-blocking conditions before a run. Keep controlled datasets and content-specific decisions private where necessary; publish the method and aggregate accepted results. An automated judge cannot replace qualified review of clinical risks.

The current source/local runtime checks cover processor failure semantics, authentication, isolation, request logging, deadlines and container recreation. Actual selected-model output, embedding dimension, grounded retrieval and live VPS acceptance remain open. Passing a model health endpoint or returning plausible text is insufficient.

## Change and incident management

Re-evaluate after changes to models, provider, prompts, corpus, parsers, authorization or intended use. Use versioned releases and rollback criteria. Monitor aggregate availability, latency, abstention/escalation and safety reports without retaining unnecessary conversation content. Suspend a feature when safety, privacy or legal prerequisites fail. Record affected revisions, containment, correction and the evaluation/gate added after an incident.

See [law](COMPLIANCE-AND-LAW.md), [privacy](PRIVACY-AND-DATA.md), [scaling](SCALABILITY.md) and [operations](OPERATIONS.md). The [European Commission AI Act guidance](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) and [FDA clinical decision support guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software) inform the intended-use review; neither establishes approval of this release.
