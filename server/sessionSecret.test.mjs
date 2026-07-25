import assert from 'node:assert/strict';
import {
  MIN_RECOMMENDED_SESSION_SECRET_BYTES,
  SESSION_SECRET_RECORD_NAME,
  describeSessionSecretState,
  resolveSessionSecret,
} from './sessionSecret.js';

function deterministicBytes(byte) {
  return () => Buffer.alloc(48, byte);
}

function createFakePool() {
  const records = new Map();
  const calls = [];
  return {
    records,
    calls,
    async query(sql, params = []) {
      const compact = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: compact, params });
      if (compact.startsWith('CREATE TABLE')) return { rows: [] };
      if (compact.startsWith('INSERT INTO app_secrets')) {
        if (!records.has(params[0])) records.set(params[0], params[1]);
        return { rows: [] };
      }
      if (compact.startsWith('SELECT secret_value FROM app_secrets')) {
        return { rows: records.has(params[0]) ? [{ secret_value: records.get(params[0]) }] : [] };
      }
      throw new Error(`Unexpected query: ${compact}`);
    },
  };
}

{
  const pool = createFakePool();
  const explicit = 'x'.repeat(MIN_RECOMMENDED_SESSION_SECRET_BYTES);
  const state = await resolveSessionSecret({
    configuredSecret: explicit,
    pool,
    isProduction: true,
    randomBytesImpl: deterministicBytes(1),
  });
  assert.equal(state.secret, explicit);
  assert.equal(state.source, 'environment');
  assert.equal(state.persistent, true);
  assert.equal(state.recommendedStrength, true);
  assert.equal(pool.calls.length, 0, 'an explicit Railway secret must not touch the database secret table');
}

{
  const pool = createFakePool();
  const first = await resolveSessionSecret({
    pool,
    isProduction: true,
    randomBytesImpl: deterministicBytes(2),
  });
  const second = await resolveSessionSecret({
    pool,
    isProduction: true,
    randomBytesImpl: deterministicBytes(3),
  });
  assert.equal(first.source, 'database');
  assert.equal(first.persistent, true);
  assert.equal(first.secret, second.secret, 'database-backed sessions must survive process restarts');
  assert.equal(pool.records.get(SESSION_SECRET_RECORD_NAME), first.secret);
  assert.notEqual(first.secret, Buffer.alloc(48, 3).toString('base64url'), 'later starts must reuse the stored secret');
  assert.match(describeSessionSecretState(first), /persistent database-backed/i);
}

{
  const failingPool = {
    async query() {
      throw new Error('database unavailable');
    },
  };
  const state = await resolveSessionSecret({
    pool: failingPool,
    isProduction: true,
    randomBytesImpl: deterministicBytes(4),
  });
  assert.equal(state.source, 'ephemeral');
  assert.equal(state.persistent, false);
  assert.match(describeSessionSecretState(state), /ephemeral session key/i);
  assert.match(describeSessionSecretState(state), /database unavailable/i);
}

{
  const state = await resolveSessionSecret({
    pool: null,
    isProduction: false,
    randomBytesImpl: deterministicBytes(5),
  });
  assert.equal(state.source, 'development');
  assert.equal(state.secret, 'collage-dev-secret-change-me');
  assert.equal(state.persistent, true);
}

console.log('persistent session secret checks passed');
