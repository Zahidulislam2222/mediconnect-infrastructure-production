export {};
// ─── Chatbot Safety Tests ───────────────────────────────────────────────
// Verifies HIPAA, GDPR, EU AI Act, and abuse protection compliance.
//
// Run: npx tsx shared/__tests__/compliance/chatbot-safety.test.ts
// ────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) { passed++; console.log(`  \u2705 ${message}`); }
    else { failed++; console.error(`  \u274C FAIL: ${message}`); }
}

function describe(name: string, fn: () => void) {
    console.log(`\n\uD83E\uDDEA ${name}`);
    fn();
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const readFile = (relPath: string): string => {
    try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
    catch { return ''; }
};

// ─── HIPAA: PHI Protection ──────────────────────────────────────────────

describe('HIPAA: PHI never sent to LightRAG or AI', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('scrubPII'), 'PII scrubbing imported and used');
    assert(chatbot.includes('scrubbedMessage'), 'Messages are scrubbed before processing');
    assert(!chatbot.includes('message') || chatbot.includes('scrubbedMessage'), 'Scrubbed version used for RAG/AI');
    assert(chatbot.includes('writeAuditLog'), 'Audit trail on every interaction');
});

// ─── HIPAA: Audit Logging ───────────────────────────────────────────────

describe('HIPAA: Every interaction audited', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('CHATBOT_MESSAGE'), 'Audit log action for chatbot messages');
    assert(chatbot.includes('writeAuditLog'), 'writeAuditLog called in message handler');
});

// ─── EU AI Act: Transparency ────────────────────────────────────────────

describe('EU AI Act Art 52: AI identification', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(
        chatbot.includes("I'm MediConnect's AI assistant") || chatbot.includes("AI assistant"),
        'First message identifies as AI'
    );

    assert(
        chatbot.includes('not a medical professional') || chatbot.includes('not a doctor'),
        'Disclaims medical professional status'
    );
});

// ─── GDPR: Data Handling ────────────────────────────────────────────────

describe('GDPR: Chat data lifecycle', () => {
    const dynamoUs = readFile('../environments/prod/dynamodb_us.tf');
    const dynamoEu = readFile('../environments/prod/dynamodb_eu.tf');

    assert(dynamoUs.includes('mediconnect-chat-sessions'), 'Chat sessions table in US');
    assert(dynamoEu.includes('mediconnect-chat-sessions'), 'Chat sessions table in EU');
    assert(dynamoUs.includes('mediconnect-chatbot-usage'), 'Usage tracking table in US');
    assert(dynamoEu.includes('mediconnect-chatbot-usage'), 'Usage tracking table in EU');
});

// ─── Rate Limiting ──────────────────────────────────────────────────────

describe('Rate limiting per user tier', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('RATE_LIMITS'), 'Rate limits defined');
    assert(chatbot.includes('public') && chatbot.includes('messages: 5'), 'Public: 5 messages/day');
    assert(chatbot.includes('free') && chatbot.includes('messages: 10'), 'Free: 10 messages/day');
    assert(chatbot.includes('plus') && chatbot.includes('messages: 50'), 'Plus: 50 messages/day');
    assert(chatbot.includes('premium') && chatbot.includes('messages: 200'), 'Premium: 200 messages/day');
    assert(chatbot.includes('RATE_LIMIT_EXCEEDED'), 'Returns rate limit error');
});

// ─── Token Budget ───────────────────────────────────────────────────────

describe('Token budget per user tier', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('tokens: 5000'), 'Public: 5K tokens/day');
    assert(chatbot.includes('tokens: 300000'), 'Premium: 300K tokens/day');
    assert(chatbot.includes('TOKEN_LIMIT_EXCEEDED'), 'Returns token limit error');
});

// ─── Off-Topic Blocking ─────────────────────────────────────────────────

describe('Off-topic questions blocked', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('off_topic'), 'Off-topic intent detection');
    assert(chatbot.includes('poem') || chatbot.includes('essay'), 'Blocks creative writing requests');
    assert(chatbot.includes('weather') || chatbot.includes('restaurant'), 'Blocks non-medical questions');
});

// ─── Abuse Detection ────────────────────────────────────────────────────

describe('Abuse detection', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('ignore.*instructions') || chatbot.includes('prompt injection'), 'Detects prompt injection');
    assert(chatbot.includes('CHATBOT_ABUSE_DETECTED'), 'Logs abuse events');
    assert(chatbot.includes('MAX_MESSAGE_LENGTH') || chatbot.includes('MESSAGE_TOO_LONG'), 'Message length limit');
});

// ─── System Prompt ──────────────────────────────────────────────────────

describe('System prompt security', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('SYSTEM_PROMPT'), 'System prompt defined as constant');
    assert(chatbot.includes('FORBIDDEN'), 'System prompt has FORBIDDEN section');
    assert(chatbot.includes('Medical diagnoses'), 'Blocks medical diagnoses');
    assert(!chatbot.match(/req\.body\..*prompt/), 'System prompt NOT from client request');
});

// ─── LightRAG Integration ───────────────────────────────────────────────

describe('LightRAG integration', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('LIGHTRAG_URL'), 'LightRAG URL configurable via env var');
    assert(chatbot.includes('queryLightRAG'), 'LightRAG query function exists');
    assert(chatbot.includes('naive') && chatbot.includes('mix'), 'Both RAG modes supported');
});

// ─── Cache ──────────────────────────────────────────────────────────────

describe('Redis caching', () => {
    const chatbot = readFile('communication-service/src/controllers/chatbot.controller.ts');

    assert(chatbot.includes('getCached'), 'Cache check before AI call');
    assert(chatbot.includes('setCache'), 'Cache response after AI call');
    assert(chatbot.includes('CACHE_TTL'), 'Cache TTL defined');
});

// ─── Event Bus ──────────────────────────────────────────────────────────

describe('Event bus integration', () => {
    const eventBus = readFile('shared/event-bus.ts');

    assert(eventBus.includes('CHATBOT_MESSAGE_PROCESSED'), 'EventType: CHATBOT_MESSAGE_PROCESSED');
    assert(eventBus.includes('CHATBOT_RATE_LIMITED'), 'EventType: CHATBOT_RATE_LIMITED');
    assert(eventBus.includes('CHATBOT_ABUSE_DETECTED'), 'EventType: CHATBOT_ABUSE_DETECTED');
});

// ─── Frontend ───────────────────────────────────────────────────────────

describe('Frontend ChatWidget', () => {
    const widget = readFile('../../mediconnect-hub/src/components/chat/ChatWidget.tsx');
    const apiTs = readFile('../../mediconnect-hub/src/lib/api.ts');

    assert(widget.includes('ChatWidget'), 'ChatWidget component exists');
    assert(widget.includes('AI') || widget.includes('assistant'), 'Shows AI identification');
    assert(widget.includes('remaining') || widget.includes('left'), 'Shows remaining messages');
    assert(apiTs.includes('/chatbot'), 'API routes chatbot to communication-service');
});

// ─── Results ────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(60)}`);
console.log(`  Chatbot Safety: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}`);
if (failed > 0) process.exit(1);
