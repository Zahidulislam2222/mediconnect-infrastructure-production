import https from 'https';
import http from 'http';

// 🟢 PROFESSIONAL FIX: Pulling URLs from Lambda Environment Variables
const PRIMARY_URL = process.env.PRIMARY_BACKEND_URL; 
const BACKUP_URL = process.env.BACKUP_BACKEND_URL;

function makeRequest(url, method, body, headers) {
    return new Promise((resolve, reject) => {
        if (!url) return reject(new Error("URL is undefined"));
        
        const lib = url.startsWith('https') ? https : http;
        const req = lib.request(url, { method, headers, timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                // If backend returns 5xx error, we trigger failover
                if (res.statusCode >= 500) reject(new Error(`Server Error ${res.statusCode}`));
                else resolve({ statusCode: res.statusCode, body: data });
            });
        });

        req.on('timeout', () => { req.destroy(); reject(new Error("Timeout")); });
        req.on('error', (e) => reject(e));
        
        if (body) req.write(body);
        req.end();
    });
}

export const handler = async (event) => {

    const payload = JSON.stringify(event);
    const headers = { 'Content-Type': 'application/json' };

    try {
        console.log(`[Failover] Attempting Primary: ${PRIMARY_URL}`);
        
        const response = await makeRequest(PRIMARY_URL, 'POST', payload, headers);
        return { statusCode: 200, body: response.body };

    } catch (err) {
        console.warn(`⚠️ Primary Failed: ${err.message}. Switching to Backup: ${BACKUP_URL}`);
        
        try {
            const response = await makeRequest(BACKUP_URL, 'POST', payload, headers);
            return { statusCode: 200, body: response.body };
        } catch (backupErr) {
            console.error("❌ CRITICAL: All Backends Unavailable");
            return { statusCode: 503, body: JSON.stringify({ error: "Service temporarily unavailable" }) };
        }
    }
};