// Regression for CI omitting the required central Node build argument on doctor images.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
for(const service of ['booking-service','doctor-service']) test(`${service} CI build receives the centrally maintained Node version`,()=>{
 const block=workflow.match(/BUILD_ARGS=\(\)([\s\S]*?)docker build/)[1];
 assert.ok(block.includes(`"${service}"`));
 assert.match(block,/--build-arg "NODE_VERSION=\$\(cat backend_v2\/\.node-version\)"/);
 const dockerfile=readFileSync(new URL(`../${service}/Dockerfile`,import.meta.url),'utf8');
 assert.match(dockerfile,/ARG NODE_VERSION\s+FROM node:\$\{NODE_VERSION\}/);
 assert.match(dockerfile,/npm ci --include=dev/);
});
