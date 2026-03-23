
const http = require('http');

const checks = [
    // Patient Service (port 8081)
    { name: 'Patient Service - Health', port: 8081, path: '/health', expected: 200 },
    { name: 'Patient Service - Appointments Route', port: 8081, path: '/appointments', expected: 401 },
    { name: 'Patient Service - Vitals Route', port: 8081, path: '/vitals', expected: 401 },

    // Doctor Service (port 8082)
    { name: 'Doctor Service - Health', port: 8082, path: '/health', expected: 200 },
    { name: 'Doctor Service - Prescriptions', port: 8082, path: '/prescriptions', method: 'GET', expected: 401 },
    { name: 'Doctor Service - EHR', port: 8082, path: '/ehr', method: 'POST', expected: 401 },

    // Booking Service (port 8083)
    { name: 'Booking Service - Health', port: 8083, path: '/health', expected: 200 },
    { name: 'Booking Service - Analytics Route', port: 8083, path: '/analytics/revenue', expected: 401 },
    { name: 'Booking Service - Billing Route', port: 8083, path: '/billing', expected: 401 },

    // Communication Service (port 8084)
    { name: 'Communication Service - Health', port: 8084, path: '/health', expected: 200 },
    { name: 'Communication Service - Chat Route', port: 8084, path: '/chat', expected: 401 },

    // Admin Service (port 8085)
    { name: 'Admin Service - Health', port: 8085, path: '/health', expected: 200 },

    // Staff Service (port 8086)
    { name: 'Staff Service - Health', port: 8086, path: '/health', expected: 200 },
    { name: 'Staff Service - Shifts Route', port: 8086, path: '/shifts', expected: 401 },
    { name: 'Staff Service - Tasks Route', port: 8086, path: '/tasks', expected: 401 },

    // DICOM Service (port 8005)
    { name: 'DICOM Service - Health', port: 8005, path: '/health', expected: 200 },
];

function check(c) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: c.port,
            path: c.path,
            method: c.method || 'GET',
            timeout: 2000
        };

        const req = http.request(options, (res) => {
            if (res.statusCode === c.expected) {
                console.log(`✅ ${c.name}: PASS (Status ${res.statusCode})`);
            } else {
                console.log(`❌ ${c.name}: FAIL (Expected ${c.expected}, Got ${res.statusCode})`);
            }
            resolve();
        });

        req.on('error', (e) => {
            console.log(`❌ ${c.name}: ERROR - ${e.message}`);
            resolve();
        });

        req.end();
    });
}

(async () => {
    console.log("=== MediConnect 7-Service Consolidation Verification ===");
    for (const c of checks) {
        await check(c);
    }
})();
