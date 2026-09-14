/**
 * Model Router — Dynamic model selection per task type
 *
 * Wraps AICircuitBreaker to route prompts to the cheapest appropriate model
 * based on task type. All model IDs and token limits come from validated configuration.
 *
 * Task types:
 *   generation  — Main chatbot response (can be slightly more expensive)
 *   validation  — Auditor + Strategist checks (cheapest possible)
 *   planning    — Query decomposition (cheap)
 *   evaluation  — Offline LLM judge (cheap, runs infrequently)
 *
 * Compliance:
 *   HIPAA: All inputs scrubbed via scrubPII() in circuit breaker
 *   GDPR: Region passed through to circuit breaker for EU routing
 */

import { AICircuitBreaker, ModelConfig, AIResponse } from './ai-circuit-breaker';
import { safeLog, safeError } from '../../../shared/logger';
import { requiredEnv, requiredPositiveInteger } from '../../../shared/settings';

// ─── Types ─────────────────────────────────────────────────────────────

export type TaskType = 'generation' | 'validation' | 'planning' | 'evaluation';

export interface ModelRouterResponse extends AIResponse {
    taskType: TaskType;
    latencyMs: number;
}

interface TaskModelConfig {
    generation: ModelConfig;
    validation: ModelConfig;
    planning: ModelConfig;
    evaluation: ModelConfig;
}

// ─── Config Loader ─────────────────────────────────────────────────────

function loadTaskConfig(): TaskModelConfig {
    const buildConfig = (
        bedrockName: string,
        vertexName: string,
        azureName: string,
        maxTokensName: string,
    ): ModelConfig => ({
        bedrock: {
            modelId: requiredEnv(bedrockName),
            maxTokens: requiredPositiveInteger(maxTokensName),
        },
        vertex: {
            modelName: requiredEnv(vertexName),
            maxTokens: requiredPositiveInteger(maxTokensName),
        },
        azure: {
            deployment: requiredEnv(azureName),
            maxTokens: requiredPositiveInteger(maxTokensName),
        },
    });

    return {
        generation: buildConfig(
            "MODEL_GENERATION_BEDROCK",
            "MODEL_GENERATION_VERTEX",
            "MODEL_GENERATION_AZURE",
            "MODEL_GENERATION_MAX_TOKENS",
        ),
        validation: buildConfig(
            "MODEL_VALIDATION_BEDROCK",
            "MODEL_VALIDATION_VERTEX",
            "MODEL_VALIDATION_AZURE",
            "MODEL_VALIDATION_MAX_TOKENS",
        ),
        planning: buildConfig(
            "MODEL_PLANNING_BEDROCK",
            "MODEL_PLANNING_VERTEX",
            "MODEL_PLANNING_AZURE",
            "MODEL_PLANNING_MAX_TOKENS",
        ),
        evaluation: buildConfig(
            "MODEL_EVALUATION_BEDROCK",
            "MODEL_EVALUATION_VERTEX",
            "MODEL_EVALUATION_AZURE",
            "MODEL_EVALUATION_MAX_TOKENS",
        ),
    };
}

// ─── Model Router ──────────────────────────────────────────────────────

export class ModelRouter {
    private circuitBreaker: AICircuitBreaker;
    private config: TaskModelConfig;

    constructor() {
        this.circuitBreaker = new AICircuitBreaker();
        this.config = loadTaskConfig();
    }

    /**
     * Route a prompt to the appropriate model based on task type.
     * Uses the circuit breaker's failover chain with task-specific model config.
     */
    public async route(
        taskType: TaskType,
        prompt: string,
        region: string,
    ): Promise<ModelRouterResponse> {
        const startTime = Date.now();
        const modelConfig = this.config[taskType];

        if (!modelConfig) {
            safeError(`ModelRouter: Unknown task type "${taskType}", falling back to generation`);
            return this.route('generation', prompt, region);
        }

        const logs: string[] = [];
        const response = await this.circuitBreaker.generateWithConfig(prompt, logs, region, modelConfig);
        const latencyMs = Date.now() - startTime;

        if (logs.length > 0) {
            safeLog(`ModelRouter [${taskType}]: failover chain used — ${logs.join(', ')}`);
        }

        return {
            ...response,
            taskType,
            latencyMs,
        };
    }

    /** Get current config for debugging/metrics. */
    public getConfig(): TaskModelConfig {
        return this.config;
    }

    /** Reload config from env vars (useful if env changes at runtime). */
    public reloadConfig(): void {
        this.config = loadTaskConfig();
    }
}

// ─── Singleton ─────────────────────────────────────────────────────────

export const modelRouter = new ModelRouter();
