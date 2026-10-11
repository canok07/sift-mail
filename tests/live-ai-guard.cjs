const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

function blocked(configuration) {
  const env = {...process.env};
  for (const name of Object.keys(env)) {
    if (name.startsWith('SIFT_LIVE_AI_') || ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY'].includes(name)) delete env[name];
  }
  const result = spawnSync(process.execPath, ['tests/live-ai-provider.cjs'], {
    env: {...env, ...configuration}, encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED:/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret|PASS:/);
}

test('live AI does not run without explicit provider/model/credential inputs', () => blocked({}));
test('cloud AI requires a fresh test key, not existing provider environment keys', () => blocked({
  SIFT_LIVE_AI_PROVIDER: 'openai', SIFT_LIVE_AI_MODEL: 'fixture-model', OPENAI_API_KEY: 'fixture-secret',
}));
test('live Ollama rejects remote endpoints without explicit consent', () => blocked({
  SIFT_LIVE_AI_PROVIDER: 'ollama', SIFT_LIVE_AI_MODEL: 'fixture-model', SIFT_LIVE_AI_ENDPOINT: 'https://untrusted.example',
}));
test('live Ollama rejects URL credentials even with remote consent', () => blocked({
  SIFT_LIVE_AI_PROVIDER: 'ollama', SIFT_LIVE_AI_MODEL: 'fixture-model',
  SIFT_LIVE_AI_ENDPOINT: 'https://user:fixture-secret@untrusted.example', SIFT_LIVE_AI_ALLOW_REMOTE: 'true',
}));
