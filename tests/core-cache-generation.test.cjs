const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Backend/SUNARP Core/DataCache.js'), 'utf8');

function createCacheSandbox() {
  const values = new Map();
  const counters = { getCalls: 0, getAllCalls: 0 };
  let uuid = 0;
  const cache = {
    get: key => {
      counters.getCalls++;
      return values.has(key) ? values.get(key) : null;
    },
    put: (key, value) => { values.set(key, value); },
    putAll: entries => Object.keys(entries).forEach(key => values.set(key, entries[key])),
    getAll: keys => {
      counters.getAllCalls++;
      return keys.reduce((result, key) => {
        if (values.has(key)) result[key] = values.get(key);
        return result;
      }, {});
    },
    remove: key => values.delete(key),
    removeAll: keys => keys.forEach(key => values.delete(key))
  };
  const sandbox = vm.createContext({
    console: { warn: () => {} },
    CacheService: { getScriptCache: () => cache },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA-256' },
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(String(value)).digest()),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64').split('+').join('-').split('/').join('_').replace(/=+$/g, ''),
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
  return { sandbox, values, counters };
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


test('runSourceWriteBatch mantiene el bloqueo central hasta flush e invalidación de todas las fuentes únicas', () => {
  const { sandbox } = createCacheSandbox();
  const events = [];
  sandbox._coreWithWriteLock_ = callback => {
    events.push('lock:start');
    try { return callback(); } finally { events.push('lock:end'); }
  };
  sandbox.SpreadsheetApp = { flush: () => events.push('flush') };
  const invalidate = sandbox._coreInvalidateSourceCacheOrThrow_;
  sandbox._coreInvalidateSourceCacheOrThrow_ = source => {
    events.push('invalidate:' + source.sheetName);
    return invalidate(source);
  };

  const result = sandbox.runSourceWriteBatch([
    { spreadsheetId: 'S', sheetName: 'Permissions' },
    { spreadsheetId: 'S', sheetName: 'Scopes' },
    { spreadsheetId: 'S', sheetName: 'Permissions', label: 'duplicate label' }
  ], markWriteStarted => {
    events.push('write');
    markWriteStarted();
    return { success: true };
  });

  assert.equal(result.success, true);
  assert.deepEqual(events, [
    'lock:start',
    'write',
    'flush',
    'invalidate:Permissions',
    'invalidate:Scopes',
    'lock:end'
  ]);
});

test('runSourceWriteBatch finaliza e invalida todas las fuentes si el callback falla después del primer write', () => {
  const { sandbox } = createCacheSandbox();
  const events = [];
  sandbox._coreWithWriteLock_ = callback => {
    events.push('lock:start');
    try { return callback(); } finally { events.push('lock:end'); }
  };
  sandbox.SpreadsheetApp = { flush: () => events.push('flush') };
  sandbox._coreInvalidateSourceCacheOrThrow_ = source => {
    events.push('invalidate:' + source.sheetName);
    return { success: true };
  };

  assert.throws(() => sandbox.runSourceWriteBatch([
    { spreadsheetId: 'S', sheetName: 'Permissions' },
    { spreadsheetId: 'S', sheetName: 'Scopes' }
  ], markWriteStarted => {
    markWriteStarted();
    events.push('first-write');
    throw new Error('partial failure');
  }), /el lote falló después de iniciar una escritura/);

  assert.deepEqual(events, [
    'lock:start',
    'first-write',
    'flush',
    'invalidate:Permissions',
    'invalidate:Scopes',
    'lock:end'
  ]);
});

test('runSourceWriteBatch no finaliza ni invalida cuando el callback falla antes del primer write', () => {
  const { sandbox } = createCacheSandbox();
  const events = [];
  sandbox._coreWithWriteLock_ = callback => {
    events.push('lock:start');
    try { return callback(); } finally { events.push('lock:end'); }
  };
  sandbox.SpreadsheetApp = { flush: () => events.push('flush') };
  sandbox._coreInvalidateSourceCacheOrThrow_ = source => events.push('invalidate:' + source.sheetName);

  assert.throws(() => sandbox.runSourceWriteBatch([
    { spreadsheetId: 'S', sheetName: 'Permissions' }
  ], () => {
    throw new Error('validation failure');
  }), /validation failure/);

  assert.deepEqual(events, ['lock:start', 'lock:end']);
});

test('runSourceWriteBatch continúa invalidando fuentes cuando falla una invalidación', () => {
  const { sandbox } = createCacheSandbox();
  const events = [];
  sandbox._coreWithWriteLock_ = callback => {
    try { return callback(); } finally { events.push('lock:end'); }
  };
  sandbox.SpreadsheetApp = { flush: () => events.push('flush') };
  sandbox._coreInvalidateSourceCacheOrThrow_ = source => {
    events.push('invalidate:' + source.sheetName);
    if (source.sheetName === 'Permissions') throw new Error('cache unavailable');
    return { success: true };
  };

  assert.throws(() => sandbox.runSourceWriteBatch([
    { spreadsheetId: 'S', sheetName: 'Permissions' },
    { spreadsheetId: 'S', sheetName: 'Scopes' }
  ], markWriteStarted => {
    markWriteStarted();
    return true;
  }), /no se pudo completar su finalización segura/);

  assert.deepEqual(events, [
    'flush',
    'invalidate:Permissions',
    'invalidate:Scopes',
    'lock:end'
  ]);
});


test('getOrBuildCachedValue agrupa las lecturas de generaciones en CacheService.getAll', () => {
  const { sandbox, counters } = createCacheSandbox();
  const sources = [
    { spreadsheetId: 'SECURITY', sheetName: 'Usuarios' },
    { spreadsheetId: 'SECURITY', sheetName: 'UsuarioRol' },
    { spreadsheetId: 'SECURITY', sheetName: 'AmbitosAcceso' }
  ];
  let builds = 0;
  const builder = () => ({ generation: ++builds });

  const first = sandbox.getOrBuildCachedValue('access-auth-context:test', sources, builder, 300);
  assert.equal(first.cacheHit, false);
  assert.equal(first.cacheStored, true);

  counters.getCalls = 0;
  counters.getAllCalls = 0;
  const second = sandbox.getOrBuildCachedValue('access-auth-context:test', sources, builder, 300);

  assert.equal(second.cacheHit, true);
  assert.equal(second.value.generation, 1);
  assert.equal(builds, 1);
  assert.equal(counters.getAllCalls, 1, 'Las generaciones de las tres fuentes se recuperan en un solo lote.');
  assert.equal(counters.getCalls, 1, 'La única lectura individual restante corresponde al valor derivado.');
  assert.ok(second.sourceGenerationMs >= 0);
});


test('la generación agrupada conserva dependencias y detecta la invalidación de un catálogo maestro', () => {
  const { sandbox } = createCacheSandbox();
  const master = { spreadsheetId: 'MASTER', sheetName: 'estructura_org' };
  const replica = {
    spreadsheetId: 'DIRECTORY',
    sheetName: 'estructura_org',
    dependencies: [master]
  };
  const security = { spreadsheetId: 'SECURITY', sheetName: 'EstructuraOrg' };
  let builds = 0;
  const sources = [replica, security];
  const builder = () => ({ build: ++builds });

  const first = sandbox.getOrBuildCachedValue('directory-auth-snapshot:test', sources, builder, 300);
  const second = sandbox.getOrBuildCachedValue('directory-auth-snapshot:test', sources, builder, 300);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(builds, 1);

  const invalidation = sandbox._coreInvalidateSourceCache_(master);
  assert.equal(invalidation.success, true);
  const third = sandbox.getOrBuildCachedValue('directory-auth-snapshot:test', sources, builder, 300);
  assert.equal(third.cacheHit, false);
  assert.equal(third.value.build, 2);
  assert.equal(builds, 2);
});


test('getOrBuildCachedValue reutiliza valores derivados y cambia la clave al invalidar cualquier fuente', () => {
  const { sandbox } = createCacheSandbox();
  const users = { spreadsheetId: 'SECURITY', sheetName: 'Usuarios' };
  const roles = { spreadsheetId: 'SECURITY', sheetName: 'UsuarioRol' };
  let builds = 0;
  const builder = () => ({ rows: [{ persona_id: 'PER_' + (++builds) }] });

  const first = sandbox.getOrBuildCachedValue('access-users:ROLE_A', [users, roles], builder, 300);
  const second = sandbox.getOrBuildCachedValue('access-users:ROLE_A', [users, roles], builder, 300);
  assert.equal(first.cacheHit, false);
  assert.equal(first.cacheStored, true);
  assert.equal(second.cacheHit, true);
  assert.equal(second.value.rows[0].persona_id, 'PER_1');
  assert.equal(builds, 1);

  sandbox._coreInvalidateSourceCache_(roles);
  const third = sandbox.getOrBuildCachedValue('access-users:ROLE_A', [users, roles], builder, 300);
  assert.equal(third.cacheHit, false);
  assert.equal(third.value.rows[0].persona_id, 'PER_2');
  assert.equal(builds, 2);
});

test('getOrBuildCachedValue rechaza publicar un resultado si una fuente cambia durante la construcción', () => {
  const { sandbox } = createCacheSandbox();
  const source = { spreadsheetId: 'SECURITY', sheetName: 'Usuarios' };
  assert.throws(() => sandbox.getOrBuildCachedValue(
    'access-users:all',
    [source],
    () => {
      sandbox._coreInvalidateSourceCache_(source);
      return [];
    },
    300
  ), /fuentes cambió durante la construcción/);
});

test('getOrBuildCachedValue ejecuta el builder sin caché cuando no puede obtener generaciones', () => {
  const { sandbox } = createCacheSandbox();
  sandbox._coreGetSourceGenerations_ = sources => sources.map(() => null);
  let builds = 0;
  const result = sandbox.getOrBuildCachedValue(
    'access-users:uncacheable',
    [{ spreadsheetId: 'SECURITY', sheetName: 'Usuarios' }],
    () => ++builds,
    300
  );
  assert.equal(result.value, 1);
  assert.equal(result.cacheHit, false);
  assert.equal(result.cacheStored, false);
  assert.equal(result.cacheReason, 'source-generation-unavailable');
  assert.equal(builds, 1);
});
