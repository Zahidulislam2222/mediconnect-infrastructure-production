// backend_v2/failover-proxy/index.mjs
// Failover Proxy — Routes to primary backend, falls back to backup on failure
// Deployed per-region: US (us-east-1) and EU (eu-central-1)

import https from "https";
import http from "http";

const REGION = process.env.AWS_REGION || "us-east-1";
const TIMEOUT_MS = parseInt(process.env.PROXY_TIMEOUT_MS || "5000", 10);

function makeRequest(url, method, body, originalHeaders) {
    return new Promise((resolve, reject) => {
        if (!url) return reject(new Error("URL is undefined"));

        const lib = url.startsWith("https") ? https : http;
        const payloadBuffer = Buffer.from(body || "");

        const headers = {
            ...originalHeaders,
            "Content-Length": payloadBuffer.length,
        };

        const req = lib.request(url, { method, headers, timeout: TIMEOUT_MS }, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                if (res.statusCode >= 500) reject(new Error(`Server Error ${res.statusCode}`));
                else resolve({ statusCode: res.statusCode, body: data });
            });
        });

        req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
        req.on("error", (e) => reject(e));

        req.write(payloadBuffer);
        req.end();
    });
}

export const handler = async (event) => {
    const PRIMARY_URL = process.env.PRIMARY_BACKEND_URL;
    const BACKUP_URL = process.env.BACKUP_BACKEND_URL;

    if (!PRIMARY_URL || !BACKUP_URL) {
        console.error(`[failover-proxy][${REGION}] FATAL: PRIMARY_BACKEND_URL or BACKUP_BACKEND_URL missing`);
        return { statusCode: 500, body: JSON.stringify({ error: "Proxy configuration error" }) };
    }

    const payload = JSON.stringify(event);
    const headers = { "Content-Type": "application/json" };

    try {
        console.log(`[failover-proxy][${REGION}] Attempting primary: ${PRIMARY_URL}`);
        const response = await makeRequest(PRIMARY_URL, "POST", payload, headers);
        return { statusCode: 200, body: response.body };
    } catch (err) {
        console.warn(`[failover-proxy][${REGION}] Primary failed: ${err.message} — switching to backup`);

        try {
            const response = await makeRequest(BACKUP_URL, "POST", payload, headers);
            return { statusCode: 200, body: response.body };
        } catch (backupErr) {
            console.error(`[failover-proxy][${REGION}] CRITICAL: All backends unavailable`);
            return { statusCode: 503, body: JSON.stringify({ error: "Service temporarily unavailable" }) };
        }
    }
};
