import assert from 'node:assert/strict';
import { buildSecurityHeaders } from './securityHeaders.js';

const development = buildSecurityHeaders();
assert.equal(development['X-Frame-Options'], 'DENY');
assert.match(development['Content-Security-Policy'], /frame-ancestors 'none'/);
assert.match(development['Content-Security-Policy'], /worker-src 'self' blob:/);
assert.equal(development['Strict-Transport-Security'], undefined);

const production = buildSecurityHeaders({ isProduction: true });
assert.match(production['Strict-Transport-Security'], /max-age=31536000/);
assert.match(production['Content-Security-Policy'], /upgrade-insecure-requests/);

console.log('securityHeaders tests passed');
