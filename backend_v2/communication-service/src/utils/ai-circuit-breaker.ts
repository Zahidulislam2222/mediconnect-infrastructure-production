import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { GoogleAuth } from "google-auth-library";
import { OpenAI } from "openai";
import { getSSMParameter } from '../../../shared/aws-config';
import { logger } from '../../../shared/logger';
import { scrubPII } from "./fhir-mapper";

export interface AIResponse {
    text: string;
    provider: string;
    model: string;
}

export interface ModelConfig {
    bedrock: { modelId: string; maxTokens: number };
    vertex: { modelName: string; maxTokens: number };
    azure: { deployment: string; maxTokens: number };
}

export class AICircuitBreaker {
    private azureClient: OpenAI | null = null;
    private googleAuth: GoogleAuth | null = null;
    // 🟢 REGIONAL CACHE for Bedrock
    private bedrockClients: Record<string, BedrockRuntimeClient> = {};

    private getBedrockClient(region: string): BedrockRuntimeClient {
        const targetRegion = region.toUpperCase() === 'EU' ? 'eu-central-1' : 'us-east-1';
        if (!this.bedrockClients[targetRegion]) {
            this.bedrockClients[targetRegion] = new BedrockRuntimeClient({ region: targetRegion });
        }
        return this.bedrockClients[targetRegion];
    }

    /**
     * 1. TEXT GENERATION ENTRY POINT
     * 🟢 GDPR FIX: Requires region parameter to keep data local
     */
    public async generateResponse(prompt: string, logs: string[], region: string = "us-east-1"): Promise<AIResponse> {
        const cleanPrompt = scrubPII(prompt);

        try {
            const response = await this.callBedrock(cleanPrompt, region);
            response.text = scrubPII(response.text);
            return response;
        } catch (bedrockError: any) {
            logger.warn("⚠️ Bedrock Failed. Failover to Vertex AI...");
            logs.push(`Bedrock Failed: ${bedrockError.message}`);

            try {
                const response = await this.callVertexAI(cleanPrompt, region);
                response.text = scrubPII(response.text);
                return response;
            } catch (vertexError: any) {
                logger.warn("⚠️ Vertex AI Failed. Failover to Azure OpenAI...");
                logs.push(`Vertex Failed: ${vertexError.message}`);

                try {
                    const response = await this.callAzureOpenAI(cleanPrompt, region);
                    response.text = scrubPII(response.text);
                    return response;
                } catch (azureError: any) {
                    logger.error("❌ ALL AI PROVIDERS FAILED.");
                    return {
                        text: JSON.stringify({
                            risk: "Medium",
                            reason: "AI Clinical Service is temporarily degraded. Standard protocols suggest immediate clinical review."
                        }),
                        provider: "System Recovery",
                        model: "Emergency-Fallback"
                    };
                }
            }
        }
    }

    /**
     * 2. VISION (IMAGING) ENTRY POINT
     */
    public async generateVisionResponse(prompt: string, imageBase64: string, region: string = "us-east-1"): Promise<AIResponse> {
        const cleanPrompt = scrubPII(prompt);

        try {
            return await this.callBedrockVision(cleanPrompt, imageBase64, region);
        } catch (error: any) {
            logger.warn("⚠️ Bedrock Vision Failed. Failover to Vertex Vision...");
            try {
                return await this.callVertexVision(cleanPrompt, imageBase64, region);
            } catch (vError: any) {
                logger.error("❌ ALL VISION PROVIDERS FAILED.");
                throw new Error("Imaging AI Service Unavailable");
            }
        }
    }

    // --- PRIVATE PROVIDERS: TEXT ---

    private async callBedrock(
        prompt: string, region: string,
        modelId: string = process.env.MODEL_GENERATION_BEDROCK || "anthropic.claude-3-haiku-20240307-v1:0",
        maxTokens: number = parseInt(process.env.MODEL_GENERATION_MAX_TOKENS || "500", 10),
    ): Promise<AIResponse> {
        const client = this.getBedrockClient(region);
        const command = new InvokeModelCommand({
            modelId,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: maxTokens,
                messages: [{ role: "user", content: prompt }]
            })
        });

        const response = await client.send(command);
        const body = JSON.parse(new TextDecoder().decode(response.body));
        return { text: body.content[0].text, provider: "AWS Bedrock", model: modelId };
    }

    private async callVertexAI(
        prompt: string, region: string,
        modelName: string = process.env.MODEL_GENERATION_VERTEX || "gemini-2.0-flash-lite",
        maxTokens: number = parseInt(process.env.MODEL_GENERATION_MAX_TOKENS || "500", 10),
    ): Promise<AIResponse> {
        const { accessToken, projectId } = await this.getGCPAuth(region);

        // 🟢 GDPR FIX: Switch to EU endpoint for EU users
        const location = region.toUpperCase() === 'EU' ? 'europe-west3' : 'us-central1';
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelName}:generateContent`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: maxTokens },
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(`Vertex_Error_${response.status}`);
        return {
            text: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
            provider: "GCP Vertex AI",
            model: modelName,
        };
    }

    private async callAzureOpenAI(
        prompt: string, region: string,
        deployment: string = process.env.MODEL_GENERATION_AZURE || "gpt-4o-mini",
        maxTokens: number = parseInt(process.env.MODEL_GENERATION_MAX_TOKENS || "500", 10),
    ): Promise<AIResponse> {
        if (!this.azureClient) {
            // 🟢 Pass Region down to fetch the correct regional Azure credentials
            const apiKey = await getSSMParameter("/mediconnect/prod/azure/cosmos/primary_key", region, true);
            const endpoint = await getSSMParameter("/mediconnect/prod/azure/cosmos/endpoint", region);

            this.azureClient = new OpenAI({
                apiKey: apiKey,
                baseURL: `${endpoint}/openai/deployments/${deployment}`,
                defaultQuery: { 'api-version': '2024-02-15-preview' },
                defaultHeaders: { 'api-key': apiKey }
            });
        }

        const completion = await this.azureClient.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: deployment,
            max_tokens: maxTokens,
        });

        return { text: completion.choices[0].message.content || "", provider: "Azure OpenAI", model: deployment };
    }

    /**
     * 3. CONFIGURABLE GENERATION — Used by Model Router
     * Accepts per-task model config for dynamic model selection.
     */
    public async generateWithConfig(
        prompt: string, logs: string[], region: string,
        config: ModelConfig,
    ): Promise<AIResponse> {
        const cleanPrompt = scrubPII(prompt);

        try {
            const response = await this.callBedrock(cleanPrompt, region, config.bedrock.modelId, config.bedrock.maxTokens);
            response.text = scrubPII(response.text);
            return response;
        } catch (bedrockError: any) {
            logger.warn("⚠️ Bedrock Failed (config). Failover to Vertex AI...");
            logs.push(`Bedrock Failed: ${bedrockError.message}`);

            try {
                const response = await this.callVertexAI(cleanPrompt, region, config.vertex.modelName, config.vertex.maxTokens);
                response.text = scrubPII(response.text);
                return response;
            } catch (vertexError: any) {
                logger.warn("⚠️ Vertex AI Failed (config). Failover to Azure OpenAI...");
                logs.push(`Vertex Failed: ${vertexError.message}`);

                try {
                    const response = await this.callAzureOpenAI(cleanPrompt, region, config.azure.deployment, config.azure.maxTokens);
                    response.text = scrubPII(response.text);
                    return response;
                } catch (azureError: any) {
                    logger.error("❌ ALL AI PROVIDERS FAILED (config).");
                    return {
                        text: JSON.stringify({
                            risk: "Medium",
                            reason: "AI Clinical Service is temporarily degraded. Standard protocols suggest immediate clinical review."
                        }),
                        provider: "System Recovery",
                        model: "Emergency-Fallback"
                    };
                }
            }
        }
    }

    // --- PRIVATE PROVIDERS: VISION ---

    private async callBedrockVision(prompt: string, imageBase64: string, region: string): Promise<AIResponse> {
        const client = this.getBedrockClient(region);
        const command = new InvokeModelCommand({
            modelId: "anthropic.claude-3-5-sonnet-20240620-v1:0", 
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 1000,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } }
                    ]
                }]
            })
        });
        const res = await client.send(command);
        const body = JSON.parse(new TextDecoder().decode(res.body));
        return { text: body.content[0].text, provider: "AWS Bedrock", model: "Claude 3.5 Sonnet Vision" };
    }

    private async callVertexVision(prompt: string, imageBase64: string, region: string): Promise<AIResponse> {
        const { accessToken, projectId } = await this.getGCPAuth(region);
        
        // 🟢 GDPR FIX: Switch to EU endpoint
        const location = region.toUpperCase() === 'EU' ? 'europe-west3' : 'us-central1';
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/gemini-1.5-flash:generateContent`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
                    ]
                }]
            })
        });
        const data = await response.json();
        return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || "", provider: "GCP Vertex AI", model: "Gemini 1.5 Vision" };
    }

    // --- HELPERS ---

    private async getGCPAuth(region: string) {
        if (!this.googleAuth) {
            this.googleAuth = new GoogleAuth({
                scopes:['https://www.googleapis.com/auth/cloud-platform']
            });
        }
        
        const client = await this.googleAuth.getClient();
        const token = (await client.getAccessToken()).token;
        const projId = await this.googleAuth.getProjectId(); 
        
        return { accessToken: token, projectId: projId };
    }
}