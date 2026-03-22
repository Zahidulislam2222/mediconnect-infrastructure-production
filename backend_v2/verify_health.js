const http = require('http');
const services = [
    { name: 'Patient Service', port: 8081, path: '/health' },
    { name: 'Doctor Service', port: 8082, path: '/health' },
    { name: 'Booking Service', port: 8083, path: '/health' },
    { name: 'Communication Service', port: 8084, path: '/health' },
    { name: 'Admin Service', port: 8085, path: '/health' },
    { name: 'Staff Service', port: 8086, path: '/health' },
    { name: 'DICOM Service', port: 8005, path: '/health' },
];

function check(name, port, path, expected = 200) {
    return new Promise((resolve) => {
        const req = http.request({ hostname: 'localhost', port, path, method: 'GET', timeout: 2000 }, (res) => {
            console.log(res.statusCode === expected ? `✅ ${name}: PASS` : `❌ ${name}: FAIL (${res.statusCode})`);
            resolve();
        });
        req.on('error', () => { console.log(`❌ ${name}: OFFLINE`); resolve(); });
        req.end();
    });
}

(async () => {
    console.log("=== MediConnect 7-Service Health Check ===");
    for (const s of services) await check(s.name, s.port, s.path);
    console.log("\n=== Route Verification ===");
    await check('Patient - Appointments Route', 8081, '/appointments', 401);
    await check('Doctor - Clinical Prescriptions', 8082, '/clinical/prescriptions', 401);
    await check('Booking - Analytics Route', 8083, '/analytics', 401);
    await check('Communication - Chat Route', 8084, '/chat', 401);
    await check('Staff - Shifts Route', 8086, '/shifts', 401);
})();
