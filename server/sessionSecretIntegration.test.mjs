import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serverSource = readFileSync(resolve(process.cwd(), 'server.js'), 'utf8');

assert.match(serverSource, /from '\.\/server\/sessionSecret\.js'/, 'server must use the persistent session secret resolver');
assert.match(serverSource, /const sessionSecretState = await resolveSessionSecret\(\{[\s\S]{0,180}configuredSecret:[\s\S]{0,180}pool,[\s\S]{0,180}isProduction/, 'session key must be resolved after the PostgreSQL pool exists');
assert.match(serverSource, /const effectiveSessionSecret = sessionSecretState\.secret/);
assert.match(serverSource, /createHmac\('sha256', effectiveSessionSecret\)/, 'login cookies must use the resolved persistent secret');
assert.match(serverSource, /createPhotoAssetGateway\(\{[\s\S]{0,180}sessionSecret: effectiveSessionSecret/, 'Bucket authorization must use the same persistent secret');
assert.match(serverSource, /createHeicConversionHandler\(\{[\s\S]{0,180}sessionSecret: effectiveSessionSecret/, 'HEIC authorization must use the same persistent secret');
assert.doesNotMatch(serverSource, /randomBytes\([^)]*\).*effectiveSessionSecret/, 'server must not create a new signing key on every production boot');
assert.match(serverSource, /sessionPersistent: sessionSecretState\.persistent/);
assert.match(serverSource, /sessionSecretSource: sessionSecretState\.source/);
assert.match(serverSource, /recommendedStrength: sessionSecretState\.recommendedStrength/);
assert.doesNotMatch(serverSource, /auth:[\s\S]{0,300}sessionSecretState\.secret/, 'health response must never expose the secret');

console.log('persistent session secret server integration checks passed');
