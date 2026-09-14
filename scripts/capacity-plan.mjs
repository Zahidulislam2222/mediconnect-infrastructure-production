import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
}

export function planCapacity(input) {
  if (!input || input.status !== 'PLANNING_ONLY_NOT_A_BENCHMARK') throw new Error('Planning status is required');
  positive(input.concurrentUsers, 'concurrentUsers');
  if (!Number.isSafeInteger(input.concurrentUsers)) throw new Error('concurrentUsers must be a safe integer');
  positive(input.requestsPerUserPerMinute, 'requestsPerUserPerMinute');
  positive(input.headroomMultiplier, 'headroomMultiplier');
  if (input.headroomMultiplier < 1) throw new Error('Headroom must not reduce demand');
  if (!Array.isArray(input.services) || !input.services.length) throw new Error('Services required');
  const names = new Set();
  let totalFraction = 0;
  // Seconds per minute is an immutable unit conversion, not a deployment default.
  const requestedRps = input.concurrentUsers * input.requestsPerUserPerMinute / 60;
  const provisionedRps = requestedRps * input.headroomMultiplier;
  positive(provisionedRps, 'computed request demand');
  const services = input.services.map(service => {
    if (!service || typeof service.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(service.name) || names.has(service.name)) {
      throw new Error('Service names must be unique lower-case identifiers');
    }
    names.add(service.name);
    positive(service.requestFraction, 'requestFraction');
    if (service.requestFraction > 1) throw new Error('requestFraction exceeds one');
    totalFraction += service.requestFraction;
    const rps = provisionedRps * service.requestFraction;
    const throughput = service.sustainedRequestsPerSecondPerReplica;
    if (throughput !== null) positive(throughput, 'sustainedRequestsPerSecondPerReplica');
    const replicas = throughput === null ? null : Math.ceil(rps / throughput);
    if (replicas !== null && !Number.isSafeInteger(replicas)) throw new Error('Replica estimate is out of range');
    return { name: service.name, requiredRequestsPerSecond: rps, estimatedReplicas: replicas,
      status: throughput === null ? 'BLOCKED_MISSING_BENCHMARK' : 'ARITHMETIC_ESTIMATE_NOT_CAPACITY_PROOF' };
  });
  if (Math.abs(totalFraction - 1) > Number.EPSILON * input.services.length) throw new Error('Request fractions must total one');
  return { status: input.status, requestedRequestsPerSecond: requestedRps,
    withHeadroomRequestsPerSecond: provisionedRps, services,
    capacityProven: false, provisionsResources: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/capacity-plan.mjs <planning-json>');
    const result = planCapacity(JSON.parse(await readFile(process.argv[2], 'utf8')));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.services.some(service => service.estimatedReplicas === null)) process.exitCode = 2;
  } catch {
    // Do not echo untrusted input or filesystem/provider details into public CI logs.
    process.stderr.write('Invalid capacity planning input; validate the documented schema.\n');
    process.exitCode = 1;
  }
}
