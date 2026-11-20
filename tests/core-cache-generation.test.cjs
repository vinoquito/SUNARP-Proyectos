const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Backend/SUNARP Core/DataCache.js'), 'utf8');

test('la generación de una fuente permanece estable hasta que se invalida', () => {
  const values = new Map();
  let uuid = 0;
  const sandbox = vm.createContext({
    console: { warn: () => {} },
    _CORE_CACHE_MAX_TTL_: 21600,
    _coreBuildSourceCacheKey_: (_source, kind) => 'cache:' + kind,
    getCachedValue: key => values.has(key) ? values.get(key) : null,
    putCachedValue: (key, value) => { values.set(key, value); return { success: true }; },
    removeCachedValues: keys => {
      keys.forEach(key => values.delete('SUNARP_CORE:' + key));
      return { success: true, removed: keys.length, removedChunks: 0 };
    },
    Utilities: { getUuid: () => 'generation-' + (++uuid) }
  });
  vm.runInContext(source, sandbox);
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
  const values = new Map();
  let uuid = 0;
  const sandbox = vm.createContext({
    console: { warn: () => {} },
    _CORE_CACHE_MAX_TTL_: 21600,
    _coreBuildSourceCacheKey_: (_source, kind) => 'cache:' + kind,
    getCachedValue: key => values.has(key) ? values.get(key) : null,
    putCachedValue: (key, value) => { values.set(key, value); return { success: true }; },
    removeCachedValues: () => ({ success: true }),
    Utilities: { getUuid: () => 'generation-' + (++uuid) }
  });
  vm.runInContext(source, sandbox);
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const first = sandbox._coreGetSourceGeneration_(sourceRef);
  values.delete('cache:generation');
  const afterEviction = sandbox._coreGetSourceGeneration_(sourceRef);
  assert.notEqual(afterEviction, first);
});
