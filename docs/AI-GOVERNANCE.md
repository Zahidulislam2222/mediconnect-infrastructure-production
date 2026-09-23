# AI safety and governance

Last reviewed: 2026-09-24

MediConnect contains two AI features: a **knowledge assistant** (chatbot) that answers questions from
a curated knowledge base (LightRAG, in the `mediconnect-rag` repository), and a **symptom checker**
in the clinical backend. Neither is operating as a live service today.

## 1. Non-negotiable rules

1. **AI never diagnoses, prescribes or triages on its own.** Clinical decisions are made by licensed clinicians.
2. **Always disclosed.** Users are told they are talking to an AI system (EU AI Act transparency duties apply from 2 August 2026).
3. **Honest failure.** When a model is unavailable or its output fails validation, the product says "the assistant is unavailable". It must never substitute a made-up risk level or reassuring advice. (Earlier fallback behaviour that did this was removed and is documented in [architecture/RETIRED-AI-FALLBACKS.md](../architecture/RETIRED-AI-FALLBACKS.md).)
4. **Emergency language.** Any mention of emergency symptoms shows local emergency guidance first.
5. **Grounded answers.** The knowledge assistant answers from approved, dated content and shows its source.
6. **Privacy.** No identifiable health data is sent to a model provider without a signed BAA/DPA; personal identifiers are scrubbed from prompts and logs.
7. **Bounded cost and load.** Per-tier quotas, concurrency caps and caching. AI is never on the critical path of booking or records.

## 2. Regulatory position (engineering assessment, not legal advice)

| Framework | Assessment | Action before launch |
|---|---|---|
| FDA device rules and CDS guidance (revised January 2026) | The knowledge assistant provides general information. The symptom checker could become a medical device if it steers diagnosis or treatment. | Keep it informational, show its basis, or pursue regulatory clearance. |
| EU MDR Rule 11 | Software informing diagnostic or therapeutic decisions is usually class IIa or higher. | Qualification assessment for the symptom checker. |
| EU AI Act | Transparency duties apply now. If the symptom checker became a medical device, it would be high-risk (AI in regulated products: obligations from 2 August 2028). | Classify each feature; keep technical documentation and logs. |
| UK DUAA 2025 | Significant solely-automated decisions using health data stay restricted. | No automated decisions with legal or similar effects. |
| California ADMT rules (from 1 January 2027) | Notice, opt-out and access rights if automated decision-making technology makes significant decisions. | Not used for significant decisions by design. |

## 3. Evaluation before any release

| Evaluation | Pass condition (TARGET) |
|---|---|
| Grounding: answers supported by retrieved sources | ≥ 95% on a reviewed question set |
| Safety: emergency and self-harm prompts route to emergency guidance | 100% |
| Refusal: requests for diagnosis or dosing are declined and redirected to a clinician | 100% |
| Privacy: identifiers in prompts are scrubbed before provider calls and logs | 100% on the test set |
| Prompt injection: retrieved content cannot override system rules | No critical failures on the adversarial set |
| Clinical review | Sign-off by a licensed clinician on the knowledge base and test results |

## 4. Monitoring

Log question category, source documents, latency, refusal and unavailability rates, with no
personal data. Review a sample of conversations with clinician oversight, and keep a channel for
users to report harmful answers.
