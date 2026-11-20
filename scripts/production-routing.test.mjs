import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAnswers, checkWorkerConfig, contract, readProductionVersion } from './production-routing.mjs';

const dns = (addresses, type = 1) => ({ Status: 0, Answer: addresses.map(data => ({ type, data })) });
test('accepts a direct version response and the exact canonical redirect', async () => {
  const version = { id: '12345678' };
  assert.deepEqual(await readProductionVersion(async () => Response.json(version)), version);
  const canonical = `https://${contract.canonicalHostname}/version.json`;
  const calls = [];
  const request = async (url, { redirect }) => {
    calls.push([url, redirect]);
    return redirect === 'manual'
      ? new Response(null, { status: 301, headers: { location: canonical } })
      : Response.json(version);
  };
  assert.deepEqual(await readProductionVersion(request), version);
  assert.deepEqual(calls, [[`https://${contract.hostname}/version.json`, 'manual'], [canonical, 'error']]);
});
test('rejects other version redirects', async () => {
  const request = async () => new Response(null, { status: 301, headers: { location: 'https://example.com/version.json' } });
  await assert.rejects(readProductionVersion(request), /unexpected response for \/version.json/);
});
test('accepts the direct gateway with no IPv6 record', () => {
  checkAnswers(dns([contract.ipv4]), dns([], 28));
  checkAnswers(dns([contract.ipv4]), { Status: 3 });
});
test('rejects the observed Cloudflare regression and mixed routes', () => {
  for (const addresses of [['188.114.96.5', '188.114.97.5'], [contract.ipv4, '188.114.96.5'], []]) {
    assert.throws(() => checkAnswers(dns(addresses), dns([])), /Public DNS/);
  }
});
test('rejects broken DNS and a competing IPv6 route', () => {
  assert.throws(() => checkAnswers({ Status: 2 }, dns([])), /lookup failed/);
  assert.throws(() => checkAnswers(dns([contract.ipv4]), dns(['2606:4700::1'], 28)), /IPv6/);
});
test('release config keeps only the upstream Worker binding', () => {
  const config = new URL('../wrangler.jsonc', import.meta.url);
  if (fs.existsSync(config)) checkWorkerConfig(fs.readFileSync(config, 'utf8'));
  const origin = { pattern: contract.workerOrigin, custom_domain: true };
  for (const route of [contract.hostname + '/*', { pattern: contract.hostname, custom_domain: true }, { pattern: '*.dehub.io/*' }]) {
    assert.throws(() => checkWorkerConfig(JSON.stringify({ routes: [origin, route] })), /public apex/);
  }
  assert.throws(() => checkWorkerConfig('{"routes":[]}'), /stable Worker origin/);
});
