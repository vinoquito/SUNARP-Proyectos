const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Backend/SUNARP Core/DataCache.js'), 'utf8');

function createCacheSandbox() {
  const values = new Map();
  let uuid = 0;
  const cache = {
    get: key => values.has(key) ? values.get(key) : null,
    put: (key, value) => { values.set(key, value); },
    putAll: entries => Object.keys(entries).forEach(key => values.set(key, entries[key])),
    getAll: keys => keys.reduce((result, key) => {
      if (values.has(key)) result[key] = values.get(key);
      return result;
    }, {}),
    remove: key => values.delete(key),
    removeAll: keys => keys.forEach(key => values.delete(key))
  };
  const sandbox = vm.createContext({
    console: { warn: () => {} },
    CacheService: { getScriptCache: () => cache },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA-256' },
      computeDigest: (_algorithm, value) => Array.from(String(value)).map(character => character.charCodeAt(0)),
      base64EncodeWebSafe: bytes => bytes.join('_'),
      newBlob: value => ({ getBytes: () => Array.from(String(value)).map(character => character.charCodeAt(0)) }),
      getUuid: () => 'generation-' + (++uuid)
    },
    _coreNormalizeSourceConfig_: source => ({
      spreadsheetId: source.spreadsheetId,
      sheetName: source.sheetName,
      headerRow: 1,
      label: source.sheetName,
      dependencies: source.dependencies || []
    })
  });
  vm.runInContext(source, sandbox, { filename: 'DataCache.js' });
  return { sandbox, values };
}

test('la generación de una fuente permanece estable hasta que se invalida', () => {
  const { sandbox } = createCacheSandbox();
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const first = sandbox._coreGetSourceGeneration_(sourceRef);
  const second = sandbox._coreGetSourceGeneration_(sourceRef);
  assert.equal(first, second);

  const invalidation = sandbox._coreInvalidateSourceCache_(sourceRef);
  const third = sandbox._coreGetSourceGeneration_(sourceRef);
  assert.equal(invalidation.success, true);
  assert.notEqual(third, first);
});

test('si CacheService pierde la generación, Core crea una nueva y no reutiliza la anterior', () => {
  const { sandbox, values } = createCacheSandbox();
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const first = sandbox._coreGetSourceGeneration_(sourceRef);
  values.clear();
  const afterEviction = sandbox._coreGetSourceGeneration_(sourceRef);
  assert.notEqual(afterEviction, first);
});

test('la invalidación del maestro cambia la generación efectiva de su réplica dependiente', () => {
  const { sandbox } = createCacheSandbox();
  const master = { spreadsheetId: 'MASTER', sheetName: 'estructura_org' };
  const replica = {
    spreadsheetId: 'DIRECTORY', sheetName: 'estructura_org',
    dependencies: [master]
  };
  const before = sandbox._coreGetSourceGeneration_(replica);
  const invalidation = sandbox._coreInvalidateSourceCache_(master);
  const after = sandbox._coreGetSourceGeneration_(replica);
  assert.equal(invalidation.success, true);
  assert.notEqual(after, before);
});

test('Core desactiva el uso de caché si detecta un ciclo de dependencias', () => {
  const { sandbox } = createCacheSandbox();
  const sourceA = { spreadsheetId: 'A', sheetName: 'A' };
  const sourceB = { spreadsheetId: 'B', sheetName: 'B', dependencies: [sourceA] };
  sourceA.dependencies = [sourceB];
  assert.equal(sandbox._coreGetSourceGeneration_(sourceA), null);
});


test('la caché fragmentada rechaza manifiestos sin checksum', () => {
  const { sandbox, values } = createCacheSandbox();
  const fullKey = sandbox._coreBuildCacheKey_('test:missing-checksum');
  const chunkKey = 'SUNARP_CORE:chunk:test:missing-checksum:0';
  values.set(chunkKey, 'abc');
  values.set(fullKey, JSON.stringify({
    format: 2,
    storage: 'gzip-chunks',
    chunkKeys: [chunkKey],
    payloadLength: 3
  }));
  sandbox._coreCacheDecodeGzip_ = () => JSON.stringify({ payload: 'decoded' });

  assert.equal(sandbox.getCachedValue('test:missing-checksum'), null);
  assert.equal(values.has(fullKey), false);
  assert.equal(values.has(chunkKey), false);
});

test('la caché fragmentada rechaza un checksum que no corresponde al payload', () => {
  const { sandbox, values } = createCacheSandbox();
  const fullKey = sandbox._coreBuildCacheKey_('test:wrong-checksum');
  const chunkKey = 'SUNARP_CORE:chunk:test:wrong-checksum:0';
  values.set(chunkKey, 'abd');
  values.set(fullKey, JSON.stringify({
    format: 2,
    storage: 'gzip-chunks',
    chunkKeys: [chunkKey],
    payloadLength: 3,
    checksum: sandbox._coreCacheDigest_('abc')
  }));
  sandbox._coreCacheDecodeGzip_ = () => JSON.stringify({ payload: 'decoded' });

  assert.equal(sandbox.getCachedValue('test:wrong-checksum'), null);
  assert.equal(values.has(fullKey), false);
  assert.equal(values.has(chunkKey), false);
});

test('la caché fragmentada acepta un payload con longitud y checksum válidos', () => {
  const { sandbox, values } = createCacheSandbox();
  const fullKey = sandbox._coreBuildCacheKey_('test:valid-checksum');
  const chunkKey = 'SUNARP_CORE:chunk:test:valid-checksum:0';
  const payload = 'abc';
  values.set(chunkKey, payload);
  values.set(fullKey, JSON.stringify({
    format: 2,
    storage: 'gzip-chunks',
    chunkKeys: [chunkKey],
    payloadLength: payload.length,
    checksum: sandbox._coreCacheDigest_(payload)
  }));
  sandbox._coreCacheDecodeGzip_ = () => JSON.stringify({ payload: 'decoded' });

  const recovered = sandbox.getCachedValue('test:valid-checksum');
  assert.equal(recovered && recovered.payload, 'decoded');
});
