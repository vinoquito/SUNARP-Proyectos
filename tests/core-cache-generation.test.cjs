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


test('si no puede publicar una nueva generación, Core intenta retirar la generación anterior', () => {
  const { sandbox } = createCacheSandbox();
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const generationKey = sandbox._coreBuildSourceCacheKey_(sourceRef, 'generation');
  sandbox.putCachedValue(generationKey, 'GEN_OLD', 300);
  assert.equal(sandbox.getCachedValue(generationKey), 'GEN_OLD');

  sandbox.putCachedValue = () => ({
    success: false,
    storage: 'not-cached',
    reason: 'simulated-cache-failure'
  });
  const result = sandbox._coreInvalidateSourceCache_(sourceRef);

  assert.equal(result.success, false);
  assert.equal(result.generation, null);
  assert.equal(sandbox.getCachedValue(generationKey), null);
});

test('las escrituras que no pueden invalidar caché propagan un error explícito de posible commit parcial', () => {
  const { sandbox } = createCacheSandbox();
  sandbox._coreInvalidateSourceCache_ = () => ({
    success: false,
    error: 'simulated-cache-failure'
  });

  assert.throws(
    () => sandbox._coreInvalidateSourceCacheOrThrow_({
      spreadsheetId: 'S',
      sheetName: 'Assignments'
    }),
    /la escritura en Sheets pudo haberse aplicado, pero falló la invalidación/
  );
});


test('una escritura Core exitosa ejecuta flush e invalidación exactamente una vez', () => {
  const { sandbox } = createCacheSandbox();
  let flushes = 0;
  sandbox.SpreadsheetApp = { flush: () => { flushes++; } };
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const before = sandbox._coreGetSourceGeneration_(sourceRef);

  const result = sandbox._coreRunSourceWrite_(sourceRef, markWriteStarted => {
    markWriteStarted();
    return { success: true };
  });
  const after = sandbox._coreGetSourceGeneration_(sourceRef);

  assert.equal(result.success, true);
  assert.equal(flushes, 1);
  assert.notEqual(after, before);
});

test('un error después del primer write también ejecuta flush e invalidación', () => {
  const { sandbox } = createCacheSandbox();
  let flushes = 0;
  sandbox.SpreadsheetApp = { flush: () => { flushes++; } };
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const before = sandbox._coreGetSourceGeneration_(sourceRef);

  assert.throws(() => sandbox._coreRunSourceWrite_(sourceRef, markWriteStarted => {
    markWriteStarted();
    throw new Error('fallo simulado después de modificar una celda');
  }), /falló después de iniciar una escritura/);

  const after = sandbox._coreGetSourceGeneration_(sourceRef);
  assert.equal(flushes, 1);
  assert.notEqual(after, before);
});

test('una validación fallida antes del primer write no ejecuta flush ni invalida', () => {
  const { sandbox } = createCacheSandbox();
  let flushes = 0;
  sandbox.SpreadsheetApp = { flush: () => { flushes++; } };
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const before = sandbox._coreGetSourceGeneration_(sourceRef);

  assert.throws(() => sandbox._coreRunSourceWrite_(sourceRef, () => {
    throw new Error('validación previa');
  }), /validación previa/);

  assert.equal(flushes, 0);
  assert.equal(sandbox._coreGetSourceGeneration_(sourceRef), before);
});
