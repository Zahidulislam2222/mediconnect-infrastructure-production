import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planCapacity } from './capacity-plan.mjs';

const example = JSON.parse(await readFile(new URL('../architecture/capacity-plan.example.json', import.meta.url), 'utf8'));
test('unmeasured example refuses to invent replica capacity', () => {
  const result = planCapacity(example);
  assert.equal(result.requestedRequestsPerSecond, 100000);
  assert.equal(result.withHeadroomRequestsPerSecond, 150000);
  assert.equal(result.capacityProven, false);
  assert.equal(result.provisionsResources, false);
  assert.ok(result.services.every(service => service.estimatedReplicas === null));
});
test('calculates estimates only with explicit per-service throughput', () => {
  const result = planCapacity({ ...example, services: [{ name: 'test-service', requestFraction: 1, sustainedRequestsPerSecondPerReplica: 1000 }] });
  assert.equal(result.services[0].estimatedReplicas, 150);
  assert.equal(result.capacityProven, false);
});
for (const value of [0, -1, NaN, Infinity, '100', 1.5]) {
  test(`rejects invalid concurrent users ${String(value)}`, () => {
    assert.throws(() => planCapacity({ ...example, concurrentUsers: value }));
  });
}
test('rejects missing throughput rather than treating it as measured', () => {
  assert.throws(() => planCapacity({ ...example, services: [{ name: 'test', requestFraction: 1 }] }));
});
test('rejects incomplete workload allocation', () => {
  assert.throws(() => planCapacity({ ...example, services: [example.services[0]] }));
});
test('rejects duplicate services and inadequate headroom', () => {
  assert.throws(() => planCapacity({ ...example, services: [example.services[0], example.services[0]] }));
  assert.throws(() => planCapacity({ ...example, headroomMultiplier: 0.5 }));
});
test('rejects overflow and invalid throughput', () => {
  assert.throws(() => planCapacity({ ...example, requestsPerUserPerMinute: Number.MAX_VALUE }));
  assert.throws(() => planCapacity({ ...example, services: [{ name: 'test', requestFraction: 1, sustainedRequestsPerSecondPerReplica: 0 }] }));
});
