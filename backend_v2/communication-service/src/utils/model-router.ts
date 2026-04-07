/**
 * Model Router — Dynamic model selection per task type
 *
 * Wraps AICircuitBreaker to route prompts to the cheapest appropriate model
 * based on task type. All model IDs come from env vars with safe defaults.
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
    const buildConfig = (prefix: string, defaults: { bedrock: string; vertex: string; azure: string; maxTokens: string }): ModelConfig => ({
        bedrock: {
            modelId: process.env[`MODEL_${prefix}_BEDROCK`] || defaults.bedrock,
            maxTokens: parseInt(process.env[`MODEL_${prefix}_MAX_TOKENS`] || defaults.maxTokens, 10),
        },
        vertex: {
            modelName: process.env[`MODEL_${prefix}_VERTEX`] || defaults.vertex,
            maxTokens: parseInt(process.env[`MODEL_${prefix}_MAX_TOKENS`] || defaults.maxTokens, 10),
        },
        azure: {
            deployment: process.env[`MODEL_${prefix}_AZURE`] || defaults.azure,
            maxTokens: parseInt(process.env[`MODEL_${prefix}_MAX_TOKENS`] || defaults.maxTokens, 10),
        },
    });

    return {
        generation: buildConfig('GENERATION', {
            bedrock: 'anthropic.claude-3-haiku-20240307-v1:0',
            vertex: 'gemini-2.0-flash-lite',
            azure: 'gpt-4o-mini',
            maxTokens: '500',
        }),
        validation: buildConfig('VALIDATION', {
            bedrock: 'anthropic.claude-3-haiku-20240307-v1:0',
            vertex: 'gemini-2.0-flash-lite',
            azure: 'gpt-4o-mini',
            maxTokens: '300',
        }),
        planning: buildConfig('PLANNING', {
            bedrock: 'anthropic.claude-3-haiku-20240307-v1:0',
            vertex: 'gemini-2.0-flash-lite',
            azure: 'gpt-4o-mini',
            maxTokens: '400',
        }),
        evaluation: buildConfig('EVALUATION', {
            bedrock: 'anthropic.claude-3-haiku-20240307-v1:0',
            vertex: 'gemini-2.0-flash-lite',
            azure: 'gpt-4o-mini',
            maxTokens: '500',
        }),
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
