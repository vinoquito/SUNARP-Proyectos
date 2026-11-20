const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Backend/SUNARP Core/DataQuery.js'), 'utf8');

function createSandbox() {
  const rows = [
    { assignment_id: 'A', status: 'ACTIVE', site_id: 'S1', name: 'Ana', allowed: true },
    { assignment_id: 'B', status: 'ACTIVE', site_id: 'S2', name: 'Bea', allowed: false },
    { assignment_id: 'C', status: 'INACTIVE', site_id: 'S1', name: 'Cora', allowed: true },
    { assignment_id: 'D', status: 'ACTIVE', site_id: 'S1', name: 'Dina', allowed: true }
  ];
  const cache = new Map();
  let cacheReads = 0;
  const context = vm.createContext({
    console: { warn: () => {} },
    Date,
    Map,
    Set,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA-256' },
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(String(value)).digest()),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    _coreNormalizeSearchText_: value => String(value === null || value === undefined ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
    _coreValuesEqual_: (a, b) => String(a === null || a === undefined ? '' : a).trim() === String(b === null || b === undefined ? '' : b).trim(),
    _coreCompareValues_: (a, b) => String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' }),
    _coreBuildSourceCacheKey_: () => 'source:fixture',
    _coreGetSourceGeneration_: () => 'GEN-1',
    getCachedValue: key => { cacheReads++; return cache.get(key) || null; },
    putCachedValue: (key, value) => { cache.set(key, value); return { success: true }; },
    authorizationHasPermission: (auth, code, moduleId) =>
      auth.moduleAccess.some(item => item.modulo_id === moduleId && item.permissionCodes.includes(code)),
    authorizationIsRecordInScope: (auth, moduleId, record) =>
      auth.moduleAccess.find(item => item.modulo_id === moduleId).scopes.some(scope =>
        scope.tipo_ambito_id === 'TOTAL' || (scope.tipo_ambito_id === 'SEDE' && scope.referencia_id === record.site_id)
      ) && record.allowed === true,
    findRecordsByFields: (_source, filters) => ({
      records: rows.filter(row => Object.keys(filters).every(field => {
        const expected = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
        return expected.some(value => String(row[field]) === String(value));
      }))
    })
  });
  vm.runInContext(source, context, { filename: 'DataQuery.js' });
  const authorization = (personaId = 'P1', permissionCodes = ['DIRECTORY_READ'], scopes = [{ tipo_ambito_id: 'TOTAL', referencia_id: '' }]) => ({
    context: {
      authenticated: true,
      personaId,
      moduleAccess: [{
        modulo_id: 'MOD_DIRECTORY',
        permissionCodes,
        scopes
      }]
    },
    moduleId: 'MOD_DIRECTORY',
    permissionCode: 'DIRECTORY_READ'
  });
  return { context, authorization, getCacheReads: () => cacheReads, cache };
}

test('queryRecords aplica AND, OR, autorización, orden y paginación antes de devolver datos', () => {
  const sandbox = createSandbox();
  const result = sandbox.context.queryRecords({ spreadsheetId: 'S', sheetName: 'Assignments' }, {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    anyOf: [{ site_id: 'S1' }, { site_id: 'S2' }],
    sortBy: 'name',
    sortDirection: 'asc',
    offset: 1,
    limit: 1,
    cacheSeconds: 0,
    authorization: sandbox.authorization()
  });
  assert.equal(result.total, 2);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].assignment_id, 'D');
  assert.equal(result.hasMore, false);
  assert.equal(result.cacheHit, false);
});

test('queryRecords comprueba permiso antes de consultar resultados cacheados', () => {
  const sandbox = createSandbox();
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const options = {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    authorization: sandbox.authorization()
  };
  const first = sandbox.context.queryRecords(sourceRef, options);
  assert.equal(first.cacheHit, false);
  const readsAfterFirst = sandbox.getCacheReads();
  assert.equal(sandbox.context.queryRecords(sourceRef, options).cacheHit, true);
  assert.ok(sandbox.getCacheReads() > readsAfterFirst);

  const unauthorized = sandbox.authorization('P1', [], [{ tipo_ambito_id: 'TOTAL' }]);
  assert.throws(
    () => sandbox.context.queryRecords(sourceRef, Object.assign({}, options, { authorization: unauthorized })),
    /no tienes permiso/
  );
});

test('queryRecords separa la caché por persona y contexto de ámbito', () => {
  const sandbox = createSandbox();
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const options = {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    authorization: sandbox.authorization('P1')
  };
  sandbox.context.queryRecords(sourceRef, options);
  const before = sandbox.cache.size;
  sandbox.context.queryRecords(sourceRef, Object.assign({}, options, {
    authorization: sandbox.authorization('P2')
  }));
  assert.equal(sandbox.cache.size, before + 1);
});

test('queryRecords exige catálogos para ámbitos no globales y no cachea sin versión de catálogo', () => {
  const sandbox = createSandbox();
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const scoped = sandbox.authorization('P1', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S1' }
  ]);
  assert.throws(() => sandbox.context.queryRecords(sourceRef, {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    authorization: scoped
  }), /faltan los catálogos/);

  scoped.structures = [];
  scoped.locals = [];
  const result = sandbox.context.queryRecords(sourceRef, {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    authorization: scoped
  });
  assert.equal(result.total, 2);
  assert.equal(sandbox.cache.size, 1);
  assert.ok(Array.from(sandbox.cache.keys()).every(key => key.startsWith('query-candidates:v1:')));
});

test('queryRecords valida paginación y búsqueda', () => {
  const sandbox = createSandbox();
  const base = {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    authorization: sandbox.authorization()
  };
  assert.throws(() => sandbox.context.queryRecords({}, Object.assign({}, base, { limit: 0 })), /limit/);
  assert.throws(() => sandbox.context.queryRecords({}, Object.assign({}, base, { search: 'ana' })), /searchFields/);
});

test('queryRecords aplica la autorización sobre la relación de ubicación declarada por el consumidor', () => {
  const sandbox = createSandbox();
  const scoped = sandbox.authorization('P1', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S2' }
  ]);
  scoped.structures = [];
  scoped.locals = [];
  scoped.scopeRecordById = {
    A: { site_id: 'S2' }
  };
  const result = sandbox.context.queryRecords({ spreadsheetId: 'S', sheetName: 'Assignments' }, {
    idField: 'assignment_id',
    filters: { assignment_id: 'A' },
    authorization: scoped,
    cacheSeconds: 0
  });
  assert.equal(result.total, 1);
  assert.equal(result.records[0].assignment_id, 'A');
});

test('queryRecords obtiene la versión de catálogos desde generaciones de sus fuentes', () => {
  const sandbox = createSandbox();
  const scoped = sandbox.authorization('P1', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S1' }
  ]);
  scoped.structures = [];
  scoped.locals = [];
  scoped.catalogSources = [
    { spreadsheetId: 'MASTER', sheetName: 'estructura_org' },
    { spreadsheetId: 'DIRECTORY', sheetName: 'estructura_local' }
  ];
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const options = {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    authorization: scoped
  };
  const first = sandbox.context.queryRecords(sourceRef, options);
  assert.equal(first.cacheHit, false);
  const second = sandbox.context.queryRecords(sourceRef, options);
  assert.equal(second.cacheHit, true);
});

test('queryRecords resuelve ámbitos mediante relaciones declaradas por campo', () => {
  const sandbox = createSandbox();
  const scoped = sandbox.authorization('P1', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S2' }
  ]);
  scoped.structures = [];
  scoped.locals = [];
  scoped.scopeRecordLookups = [{
    recordField: 'site_id',
    values: { S1: { site_id: 'S2' } }
  }];
  const result = sandbox.context.queryRecords({ spreadsheetId: 'S', sheetName: 'Assignments' }, {
    idField: 'assignment_id',
    filters: { assignment_id: 'A' },
    authorization: scoped,
    cacheSeconds: 0
  });
  assert.equal(result.total, 1);
  assert.equal(result.records[0].assignment_id, 'A');
});

test('queryRecords combina búsqueda textual con coincidencias de entidades relacionadas', () => {
  const sandbox = createSandbox();
  const result = sandbox.context.queryRecords({ spreadsheetId: 'S', sheetName: 'Assignments' }, {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    search: 'ana',
    searchFields: [],
    searchAny: [{ field: 'site_id', values: ['S1'] }],
    authorization: sandbox.authorization(),
    cacheSeconds: 0
  });
  assert.equal(result.total, 2);
  assert.equal(Array.from(result.records, item => item.assignment_id).sort().join(','), 'A,D');
});

test('queryRecords excluye registros cuyas relaciones declaradas contradicen el registro', () => {
  const sandbox = createSandbox();
  const scoped = sandbox.authorization('P1', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S1' }
  ]);
  scoped.structures = [];
  scoped.locals = [];
  scoped.scopeRecordLookups = [{
    recordField: 'site_id',
    values: { S2: { site_id: 'S1' } },
    requireEqualFields: ['site_id']
  }];
  const result = sandbox.context.queryRecords({ spreadsheetId: 'S', sheetName: 'Assignments' }, {
    idField: 'assignment_id',
    filters: { assignment_id: 'B' },
    authorization: scoped,
    cacheSeconds: 0
  });
  assert.equal(result.total, 0);
});

test('queryRecords reutiliza candidatos entre consultas distintas y prioriza el filtro de ámbito', () => {
  const sandbox = createSandbox();
  let sourceReads = 0;
  const searchFields = [];
  const original = sandbox.context.findRecordsByFields;
  sandbox.context.findRecordsByFields = (source, filters, options) => {
    sourceReads++;
    searchFields.push(options.searchField);
    return original(source, filters, options);
  };
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const base = {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    anyOf: [{ site_id: 'S1' }],
    authorization: sandbox.authorization(),
    cacheSeconds: 60
  };
  const first = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    distinctBy: 'site_id',
    sortBy: 'site_id'
  }));
  const second = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    distinctBy: 'name',
    sortBy: 'name'
  }));
  assert.equal(first.total, 1);
  assert.equal(second.total, 2);
  assert.equal(sourceReads, 1);
  assert.equal(searchFields[0], 'site_id');
});

test('la caché de candidatos nunca omite la autorización vigente de otro usuario', () => {
  const sandbox = createSandbox();
  let sourceReads = 0;
  const original = sandbox.context.findRecordsByFields;
  sandbox.context.findRecordsByFields = (...args) => {
    sourceReads++;
    return original(...args);
  };
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const base = {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    anyOf: [{ site_id: 'S1' }],
    cacheSeconds: 0,
    candidateCacheSeconds: 60
  };
  const first = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    authorization: sandbox.authorization()
  }));
  const scoped = sandbox.authorization('P2', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S2' }
  ]);
  scoped.structures = [];
  scoped.locals = [];
  const second = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    authorization: scoped
  }));
  assert.equal(first.total, 2);
  assert.equal(second.total, 0);
  assert.equal(sourceReads, 1);
});
