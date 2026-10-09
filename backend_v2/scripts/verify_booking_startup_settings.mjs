import { createRequire } from 'node:module';

const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const { getBookingStartupSettings } = require('./dist/shared/settings.js');

try {
  getBookingStartupSettings();
  console.log('Booking startup configuration verified.');
} catch {
  console.error('Invalid booking startup configuration.');
  process.exitCode = 1;
}
