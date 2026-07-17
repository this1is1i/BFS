import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const markerStart = source.indexOf(marker);
  assert.notEqual(markerStart, -1, `missing function ${name}`);
  const start = source.slice(Math.max(0, markerStart - 6), markerStart) === 'async '
    ? markerStart - 6
    : markerStart;
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = bodyStart; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

const names = [
  'inferEmbeddingMeta',
  'embeddingsCompatible',
  'safeExternalUrl',
  'escapeAttribute',
  'buildProgressSnapshot',
  'createHttpError',
  'isRetryableError',
  'getRuntimeProtocolError',
  'withRetry',
  'stableClusterId',
  'projectVectorForClustering',
  'parseRecommendations',
  'dedupeBookmarks',
  'seededRandom',
  'euclideanSq',
  'averageDistToCluster',
  'kMeans',
  'shouldRetryLocalEmbedder',
];
const context = { URL, setTimeout };
vm.createContext(context);
vm.runInContext(`${names.map(extractFunction).join('\n')}\nthis.api = { ${names.join(',')} };`, context);
const api = context.api;

assert.deepEqual(
  JSON.parse(JSON.stringify(api.inferEmbeddingMeta({ embedding: Array(384).fill(0) }))),
  { provider: 'local', model: 'Xenova/all-MiniLM-L6-v2', dimensions: 384 },
  'legacy local vectors should be identified by dimension',
);
assert.equal(api.shouldRetryLocalEmbedder(null, 1000), true);
assert.equal(api.shouldRetryLocalEmbedder({ retryAfter: 2000 }, 1000), false);
assert.equal(api.shouldRetryLocalEmbedder({ retryAfter: 2000 }, 2000), true,
  'local model initialization must recover after a transient failure');
assert.deepEqual(
  JSON.parse(JSON.stringify(api.inferEmbeddingMeta({ embedding: Array(1536).fill(0) }))),
  { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
  'legacy OpenAI vectors should be identified by dimension',
);
assert.equal(api.embeddingsCompatible(
  { provider: 'local', model: 'Xenova/all-MiniLM-L6-v2', dimensions: 384 },
  { embedding: Array(384).fill(0) },
), true);
assert.equal(api.embeddingsCompatible(
  { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
  { embedding: Array(384).fill(0) },
), false, 'mixed vector spaces must not be compared');

assert.equal(api.safeExternalUrl('javascript:alert(1)'), null);
assert.equal(api.safeExternalUrl('data:text/html,x'), null);
assert.equal(api.safeExternalUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
assert.equal(api.escapeAttribute('" onmouseover="x'), '&quot; onmouseover=&quot;x');

const snapshot = api.buildProgressSnapshot(
  ['b', 'c'], new Set(['a']), new Set(['c', 'd']),
  { completedCount: 2, totalCount: 6, alreadyDoneCount: 1, failedCount: 2 },
);
assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), {
  pendingUrls: ['b', 'c', 'a', 'd'],
  completedCount: 2,
  totalCount: 6,
  alreadyDoneCount: 1,
  failedCount: 2,
});

let attempts = 0;
const retryResult = await api.withRetry(async () => {
  attempts++;
  if (attempts < 3) throw new Error('temporary');
  return 'ok';
}, 3, 0);
assert.equal(retryResult, 'ok');
assert.equal(attempts, 3);

const authError = api.createHttpError('DeepSeek', 401, '{"error":"invalid key"}');
assert.equal(authError.status, 401);
assert.equal(authError.service, 'DeepSeek');
assert.equal(api.isRetryableError(authError), false,
  'invalid credentials must not be retried');
let authAttempts = 0;
await assert.rejects(api.withRetry(async () => {
  authAttempts++;
  throw authError;
}, 3, 0), /DeepSeek 401/);
assert.equal(authAttempts, 1, '401 failures must stop after the first request');
assert.equal(api.isRetryableError(api.createHttpError('DeepSeek', 503, 'busy')), true);

assert.match(api.getRuntimeProtocolError('file:'), /start\.bat/);
assert.match(api.getRuntimeProtocolError('file:'), /http:\/\/localhost:8080/);
assert.equal(api.getRuntimeProtocolError('http:'), null);
assert.equal(api.getRuntimeProtocolError('https:'), null);

assert.equal(api.stableClusterId(['b', 'a']), api.stableClusterId(['a', 'b']),
  'cluster identity must not depend on member order');
assert.equal(api.projectVectorForClustering(Array(1536).fill(0)).length, 128,
  'clustering should use a bounded projection');
const parsed = api.parseRecommendations(
  '[{"title":"A","reason":"R","url":"https://a.example/"},{"title":"X","reason":"bad","url":"https://x.example/"}]',
  new Set(['https://a.example/']),
);
assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [
  { title: 'A', reason: 'R', url: 'https://a.example/' },
]);
assert.deepEqual(JSON.parse(JSON.stringify(api.parseRecommendations(
  '说明 [忽略]\n```json\n[{"title":"A","reason":"R","url":"https://a.example/"}]\n```',
  new Set(['https://a.example/']),
))), [{ title: 'A', reason: 'R', url: 'https://a.example/' }]);
assert.deepEqual(JSON.parse(JSON.stringify(api.dedupeBookmarks([
  { url: 'https://a', title: 'first' },
  { url: 'https://a', title: 'duplicate' },
  { url: 'https://b', title: 'second' },
]))), [
  { url: 'https://a', title: 'first' },
  { url: 'https://b', title: 'second' },
]);
const deterministicData = [[0, 0], [0, 1], [10, 10], [10, 11], [20, 20], [20, 21]];
assert.deepEqual(
  JSON.parse(JSON.stringify(api.kMeans(deterministicData, 3, 10, 'same-input').clusters)),
  JSON.parse(JSON.stringify(api.kMeans(deterministicData, 3, 10, 'same-input').clusters)),
  'k-means assignments must be deterministic for identical input',
);

assert.doesNotMatch(
  source,
  /localStorage\.setItem\([^\n]+deepseekKey|localStorage\.setItem\([^\n]+JSON\.stringify\(config\)/,
  'API keys must not be persisted to localStorage',
);
assert.doesNotMatch(source, /Object\.assign\(config, saved\)/,
  'legacy persisted secrets must not be copied back into config');
assert.match(source, /localStorage\.setItem\('bfs_config', JSON\.stringify\(safeConfig\)\)/,
  'legacy config must be rewritten without secrets during load');
assert.match(source, /if \(!embeddingsCompatible\(queryEmbedding, entry\)\) continue;/,
  'vector search must reject incompatible vector spaces');
assert.match(source, /embedding:\s*embeddingResult\?\.vector/,
  'queue must store the vector and its metadata together');
assert.match(source, /const compatibleGroups = new Map\(\)/,
  'clustering must partition incompatible vector spaces');
assert.match(source, /const safeUrl = safeExternalUrl\(bm\.url\)/,
  'bookmark links must pass through the protocol allow-list');
assert.doesNotMatch(source, /href="\$\{escapeHtml\(bm\.url\)\}"/,
  'raw imported URLs must not be interpolated into href attributes');
assert.match(source, /const inFlightUrls = new Set\(\)/);
assert.match(source, /failedUrls\.add\(url\)/,
  'failed queue entries must remain recoverable');
assert.match(source, /fatalQueueError\s*=\s*e/,
  'authentication failures must stop the background queue');
assert.match(source, /finally \{\s*queueRunning = false;/,
  'queue lock must always be released');
assert.match(source, /async function loadProgress\(\)/,
  'progress must support storage fallback');
assert.match(source, /opfsWrite\(OPFS_PROGRESS_FILE/,
  'progress must be persisted to OPFS');
assert.doesNotMatch(source, /falling back to local/,
  'a configured OpenAI vector space must not silently mix in local vectors');
assert.doesNotMatch(source, /if \(localEmbedderFailed\) return null/,
  'a transient model failure must not permanently disable retries');
assert.match(source, /throw new Error\('缓存写入失败/,
  'failure of every cache backend must be observable');
assert.match(source, /summarySource:\s*'title-url-inference'/,
  'inferred summaries must disclose their source');
assert.match(source, /const sampleStep = Math\.max\(1, Math\.ceil\(n \/ 120\)\)/,
  'silhouette scoring must be sampled for large collections');

const inlineScript = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inlineScript, 'inline application script must exist');
new vm.Script(inlineScript, { filename: 'index.html:inline-script' });
assert.doesNotMatch(source, /import\('https:\/\//,
  'local embedding runtime must not depend on a CDN');
assert.ok(fs.statSync(new URL('../vendor/transformers.min.js', import.meta.url)).size > 100_000,
  'vendored Transformers.js runtime must be present');
assert.match(source, /mod\.env\.backends\.onnx\.wasm\.wasmPaths = '\.\/vendor\/'/,
  'ONNX runtime must load WASM from the local vendor directory');
for (const wasmName of [
  'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm', 'ort-wasm.wasm',
]) {
  assert.ok(fs.statSync(new URL(`../vendor/${wasmName}`, import.meta.url)).size > 1_000_000,
    `${wasmName} must be present`);
}

console.log('bfs-core: all assertions passed');
