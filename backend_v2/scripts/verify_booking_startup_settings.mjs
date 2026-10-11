import { createRequire } from 'node:module';

const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const { getBookingStartupSettings, BOOKING_STARTUP_ENV_NAMES } = require('./dist/shared/settings.js');

try {
  if (process.argv.length === 3 && process.argv[2] === '--env-names') {
    console.log(BOOKING_STARTUP_ENV_NAMES.join('\n'));
  } else {
    if (process.argv.length !== 2) throw new Error('Unsupported preflight arguments');
    getBookingStartupSettings();
  }
  if (process.argv.length === 2) console.log('Booking startup configuration verified.');
} catch {
  console.error('Invalid booking startup configuration.');
  process.exitCode = 1;
}
