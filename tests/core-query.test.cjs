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
    { assignment_id: 'A', status: 'ACTIVE', site_id: 'S1', name: 'Ana', cargo_id: 'C1', estructura_local_id: 'R1', local_id: 'L1', persona_id: 'P1', allowed: true },
    { assignment_id: 'B', status: 'ACTIVE', site_id: 'S2', name: 'Bea', cargo_id: 'C2', estructura_local_id: 'R2', local_id: 'L2', persona_id: 'P2', allowed: false },
    { assignment_id: 'C', status: 'INACTIVE', site_id: 'S1', name: 'Cora', cargo_id: 'C3', estructura_local_id: 'R3', local_id: 'L3', persona_id: 'P3', allowed: true },
    { assignment_id: 'D', status: 'ACTIVE', site_id: 'S1', name: 'Dina', cargo_id: 'C2', estructura_local_id: 'R1', local_id: 'L1', persona_id: 'P4', allowed: true }
  ];
  const cache = new Map();
  let cacheReads = 0;
  const context = vm.createContext({
    console: { warn: () => {}, log: () => {} },
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

test('queryRecords pagina distinctBy con retención acotada cuando distinctBy coincide con sortBy', () => {
  const sandbox = createSandbox();
  const rows = [
    { assignment_id: 'A', status: 'ACTIVE', persona_id: 'P1', name: 'A', site_id: 'S1', allowed: true },
    { assignment_id: 'C', status: 'ACTIVE', persona_id: 'P1', name: 'C', site_id: 'S1', allowed: true },
    { assignment_id: 'B', status: 'ACTIVE', persona_id: 'P2', name: 'B', site_id: 'S1', allowed: true },
    { assignment_id: 'Z', status: 'ACTIVE', persona_id: 'P3', name: 'Z', site_id: 'S1', allowed: true },
    { assignment_id: 'D', status: 'ACTIVE', persona_id: 'P4', name: 'D', site_id: 'S1', allowed: true }
  ];
  sandbox.context.findRecordsByFields = () => ({ records: rows });
  let maxRetained = 0;
  const insert = sandbox.context._coreQueryInsertDistinctPageRecord_;
  sandbox.context._coreQueryInsertDistinctPageRecord_ = function(records, ...args) {
    const result = insert(records, ...args);
    maxRetained = Math.max(maxRetained, records.length);
    return result;
  };

  const result = sandbox.context.queryRecords(
    { spreadsheetId: 'S', sheetName: 'Assignments' },
    {
      idField: 'assignment_id',
      filters: { status: 'ACTIVE' },
      distinctBy: 'persona_id',
      sortBy: 'persona_id',
      sortDirection: 'asc',
      offset: 1,
      limit: 2,
      cacheSeconds: 0,
      candidateCacheSeconds: 0,
      authorization: sandbox.authorization()
    }
  );

  assert.equal(result.total, 4);
  assert.equal(result.records.length, 2);
  assert.deepEqual(Array.from(result.records, item => item.persona_id), ['P2', 'P3']);
  assert.equal(result.retainedForPage, 3);
  assert.equal(maxRetained, 3);
});

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
  assert.ok(Array.from(sandbox.cache.keys()).every(key => key.startsWith('query-candidates:v2:')));
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


test('queryRecords deniega una referencia obligatoria que no existe en su catálogo', () => {
  const sandbox = createSandbox();
  const scoped = sandbox.authorization('P1', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S1' }
  ]);
  scoped.structures = [];
  scoped.locals = [];
  scoped.scopeRecordLookups = [{
    recordField: 'site_id',
    values: {},
    required: true
  }];

  const result = sandbox.context.queryRecords(
    { spreadsheetId: 'S', sheetName: 'Assignments' },
    {
      idField: 'assignment_id',
      filters: { assignment_id: 'A' },
      authorization: scoped,
      cacheSeconds: 0
    }
  );

  assert.equal(result.total, 0);
  assert.deepEqual(Array.from(result.records), []);
});

test('queryRecords incorpora catálogos y relaciones de ámbito en la huella de caché', () => {
  const sandbox = createSandbox();
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const authorization = sandbox.authorization('P1', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S1' }
  ]);
  authorization.structures = [];
  authorization.locals = [];
  authorization.catalogVersion = 'CATALOG-1';
  authorization.scopeRecordLookups = [{
    recordField: 'site_id',
    values: { S1: { site_id: 'S1' } }
  }];
  const options = {
    idField: 'assignment_id',
    filters: { assignment_id: 'A' },
    cacheSeconds: 60,
    authorization
  };

  const first = sandbox.context.queryRecords(sourceRef, options);
  assert.equal(first.total, 1);
  assert.equal(first.cacheHit, false);

  const changedAuthorization = Object.assign({}, authorization, {
    scopeRecordLookups: [{
      recordField: 'site_id',
      values: { S1: { site_id: 'S2' } }
    }]
  });
  const second = sandbox.context.queryRecords(sourceRef, Object.assign({}, options, {
    authorization: changedAuthorization
  }));
  assert.equal(second.total, 0);
  assert.equal(second.cacheHit, false);
  assert.equal(second.candidateCacheHit, true);
});

test('queryRecords valida las relaciones declaradas antes de devolver un resultado cacheado', () => {
  const sandbox = createSandbox();
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const options = {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    authorization: sandbox.authorization()
  };
  sandbox.context.queryRecords(sourceRef, options);
  assert.throws(() => sandbox.context.queryRecords(sourceRef, Object.assign({}, options, {
    authorization: Object.assign({}, options.authorization, {
      scopeRecordLookups: [{ recordField: 'site_id', values: [] }]
    })
  })), /scopeRecordLookup/);
  assert.throws(() => sandbox.context.queryRecords(sourceRef, Object.assign({}, options, {
    authorization: Object.assign({}, options.authorization, {
      scopeRecordById: []
    })
  })), /scopeRecordById/);
});

test('queryRecords retiene solo offset + limit al ordenar páginas no distintas', () => {
  const sandbox = createSandbox();
  const rows = Array.from({ length: 120 }, (_, index) => ({
    assignment_id: 'A' + String(index).padStart(3, '0'),
    status: 'ACTIVE',
    site_id: 'S1',
    name: 'Nombre ' + String(index).padStart(3, '0'),
    allowed: true
  }));
  sandbox.context.findRecordsByFields = () => ({ records: rows });
  let maximumRetained = 0;
  const insert = sandbox.context._coreQueryInsertPageRecord_;
  sandbox.context._coreQueryInsertPageRecord_ = function(records, ...args) {
    const result = insert(records, ...args);
    maximumRetained = Math.max(maximumRetained, records.length);
    return result;
  };

  const result = sandbox.context.queryRecords(
    { spreadsheetId: 'S', sheetName: 'Assignments' },
    {
      idField: 'assignment_id',
      filters: { status: 'ACTIVE' },
      sortBy: 'name',
      offset: 10,
      limit: 5,
      cacheSeconds: 0,
      candidateCacheSeconds: 0,
      authorization: sandbox.authorization()
    }
  );
  assert.equal(result.total, 120);
  assert.equal(result.records.length, 5);
  assert.equal(result.records[0].assignment_id, 'A010');
  assert.equal(result.records[4].assignment_id, 'A014');
  assert.equal(maximumRetained, 15);
});

test('queryRecords reutiliza candidatos entre páginas con la misma proyección y prioriza el filtro de ámbito', () => {
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
    cacheSeconds: 60,
    distinctBy: 'site_id',
    sortBy: 'site_id'
  };
  const first = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    offset: 0,
    limit: 1
  }));
  const second = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    offset: 1,
    limit: 1
  }));
  assert.equal(first.total, 1);
  assert.equal(second.total, 1);
  assert.equal(second.candidateCacheHit, true);
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

test('queryRecords reutiliza proyecciones suficientes y recarga cuando falta un campo requerido', () => {
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
    cacheSeconds: 0,
    candidateCacheSeconds: 60
  };

  const first = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    distinctBy: 'site_id',
    sortBy: 'site_id',
    authorization: sandbox.authorization()
  }));
  assert.equal(first.total, 2);
  assert.equal(first.candidateCacheHit, false);
  assert.equal(sourceReads, 1);

  const scopedAuthorization = sandbox.authorization('P2', ['DIRECTORY_READ'], [
    { tipo_ambito_id: 'SEDE', referencia_id: 'S2' }
  ]);
  scopedAuthorization.structures = [];
  scopedAuthorization.locals = [];
  const second = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    distinctBy: 'status',
    sortBy: 'status',
    authorization: scopedAuthorization
  }));
  assert.equal(second.candidateCacheHit, true);
  assert.equal(second.total, 0);
  assert.equal(sourceReads, 1);

  const third = sandbox.context.queryRecords(sourceRef, Object.assign({}, base, {
    distinctBy: 'name',
    sortBy: 'name',
    authorization: sandbox.authorization()
  }));
  assert.equal(third.candidateCacheHit, false);
  assert.equal(sourceReads, 2);
});

test('queryRecords calcula facetas y conteos únicamente sobre registros autorizados', () => {
  const sandbox = createSandbox();
  const result = sandbox.context.queryRecords({ spreadsheetId: 'S', sheetName: 'Assignments' }, {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    distinctFields: ['cargo_id', 'estructura_local_id', 'local_id'],
    distinctCountFields: ['persona_id'],
    authorization: sandbox.authorization(),
    cacheSeconds: 0
  });
  assert.deepEqual(Array.from(result.distinctValues.cargo_id), ['C1', 'C2']);
  assert.deepEqual(Array.from(result.distinctValues.estructura_local_id), ['R1']);
  assert.deepEqual(Array.from(result.distinctValues.local_id), ['L1']);
  assert.equal(result.distinctCounts.persona_id, 2);
  assert.equal(result.total, 2);
});

test('la nueva generación de la fuente invalida candidatos y resultados derivados', () => {
  const sandbox = createSandbox();
  let sourceReads = 0;
  let generation = 'GEN-1';
  sandbox.context._coreGetSourceGeneration_ = () => generation;
  const original = sandbox.context.findRecordsByFields;
  sandbox.context.findRecordsByFields = (...args) => {
    sourceReads++;
    return original(...args);
  };
  const sourceRef = { spreadsheetId: 'S', sheetName: 'Assignments' };
  const options = {
    idField: 'assignment_id',
    filters: { status: 'ACTIVE' },
    authorization: sandbox.authorization(),
    cacheSeconds: 60
  };
  sandbox.context.queryRecords(sourceRef, options);
  generation = 'GEN-2';
  const refreshed = sandbox.context.queryRecords(sourceRef, options);
  assert.equal(refreshed.cacheHit, false);
  assert.equal(sourceReads, 2);
});


test('queryRecords proyecta columnas de evaluación y solo hidrata la página autorizada', () => {
  const sandbox = createSandbox();
  const rows = [
    { assignment_id: 'A', status: 'ACTIVE', site_id: 'S1', name: 'Ana', allowed: true, fullPayload: 'A_FULL' },
    { assignment_id: 'B', status: 'ACTIVE', site_id: 'S1', name: 'Bea', allowed: true, fullPayload: 'B_FULL' },
    { assignment_id: 'C', status: 'ACTIVE', site_id: 'S1', name: 'Cora', allowed: true, fullPayload: 'C_FULL' }
  ];
  let projectedFields = [];
  let hydratedIds = [];
  sandbox.context._coreOpenSource_ = () => ({ fake: true });
  sandbox.context._coreQueryLoadCandidateRows_ = (_source, _groups, _required, fields) => {
    projectedFields = fields;
    return {
      context: { fake: true },
      candidates: rows.map((record, index) => ({ rowNumber: index + 2, record }))
    };
  };
  sandbox.context._coreQueryHydratePage_ = (_source, selected) => {
    hydratedIds = selected.map(item => item.record.assignment_id);
    return selected.map(item => Object.assign({}, item.record));
  };
  const result = sandbox.context.queryRecords(
    { spreadsheetId: 'S', sheetName: 'Assignments' },
    {
      idField: 'assignment_id',
      filters: { status: 'ACTIVE' },
      anyOf: [{ site_id: 'S1' }],
      sortBy: 'name',
      offset: 1,
      limit: 1,
      cacheSeconds: 0,
      candidateCacheSeconds: 0,
      authorization: sandbox.authorization()
    }
  );
  assert.equal(hydratedIds.join(','), 'B');
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].fullPayload, 'B_FULL');
  for (const field of ['status', 'site_id', 'name', 'assignment_id']) {
    assert.ok(projectedFields.includes(field));
  }
  assert.equal(result.projectedFieldCount, projectedFields.length);
  assert.equal(result.hydratedRowCount, 1);
  assert.equal(result.version, 2);
});


test('queryRecords carga asignaciones sin exigir columnas organizacionales aportadas por los lookups', () => {
  const sandbox = createSandbox();
  const headers = [
    'asignacion_id', 'persona_id', 'cargo_id', 'condicion_cargo',
    'anexo', 'estructura_local_id', 'local_id', 'observaciones',
    'active', 'order'
  ];
  const values = [
    ['ASG_1', 'PER_1', 'CAR_1', 'Titular', '101', 'REL_1', 'LOC_1', '', true, 1],
    ['ASG_2', 'PER_2', 'CAR_2', 'Suplente', '102', 'REL_2', 'LOC_2', '', false, 2],
    ['ASG_3', 'PER_3', 'CAR_1', 'Titular', '103', 'REL_1', 'LOC_1', '', true, 3]
  ];
  const rangeReads = [];
  let finderMatchCase = null;
  const sheet = {
    getLastRow: () => 4,
    getLastColumn: () => headers.length,
    getRange(startRow, startColumn, numRows, numColumns) {
      rangeReads.push({ startRow, startColumn, numRows, numColumns });
      const selected = values.slice(startRow - 2, startRow - 2 + numRows)
        .map(row => row.slice(startColumn - 1, startColumn - 1 + numColumns));
      return {
        getDisplayValues: () => startRow === 1
          ? [headers.slice(startColumn - 1, startColumn - 1 + numColumns)]
          : selected.map(row => row.map(value =>
              typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value)
            )),
        getValues: () => selected,
        createTextFinder(pattern) {
          let useRegex = false;
          let matchCase = true;
          return {
            useRegularExpression(value) { useRegex = value; return this; },
            matchEntireCell() { return this; },
            matchCase(value) { matchCase = value; finderMatchCase = value; return this; },
            findAll() {
              const flags = matchCase ? '' : 'i';
              const regex = new RegExp(pattern, flags);
              const found = [];
              selected.forEach((row, offset) => {
                const actual = typeof row[0] === 'boolean'
                  ? (row[0] ? 'TRUE' : 'FALSE')
                  : String(row[0]);
                const matches = useRegex
                  ? regex.test(actual)
                  : (matchCase ? actual === pattern : actual.toLowerCase() === pattern.toLowerCase());
                if (matches) found.push({ getRow: () => startRow + offset });
              });
              return found;
            }
          };
        }
      };
    }
  };
  sandbox.context._coreOpenSource_ = () => ({
    config: { headerRow: 1, sheetName: 'asignaciones' },
    sheet
  });

  const loaded = sandbox.context._coreQueryLoadCandidateRows_(
    { spreadsheetId: 'S', sheetName: 'asignaciones' },
    [{ active: true }],
    ['asignacion_id', 'active'],
    ['asignacion_id', 'active', 'estructura_local_id', 'local_id', 'order'],
    'asignacion_id',
    ['estructura_org_id', 'estructura_id', 'sede_id', 'local_id']
  );

  assert.equal(finderMatchCase, false);
  assert.deepEqual(
    Array.from(loaded.candidates, item => item.record.asignacion_id),
    ['ASG_1', 'ASG_3']
  );
  assert.ok(loaded.projectedFields.includes('local_id'));
  assert.ok(!loaded.projectedFields.includes('estructura_org_id'));
  assert.ok(!loaded.projectedFields.includes('estructura_id'));
  assert.ok(!loaded.projectedFields.includes('sede_id'));
  assert.ok(loaded.candidates.every(item =>
    Object.keys(item.record).every(field => headers.includes(field))
  ));
  const projectedReads = rangeReads.filter(read =>
    read.startRow > 1 && read.numColumns > 0
  );
  assert.ok(projectedReads.every(read => read.numColumns < headers.length));
});


test('queryRecords rechaza la hidratación cuando cambió una columna usada para filtrar o autorizar', () => {
  const sandbox = createSandbox();
  const headers = ['asignacion_id', 'active', 'estructura_local_id', 'local_id', 'anexo'];
  let currentValues = ['ASG_001', true, 'REL_001', 'LOC_001', 1001];
  const sheet = {
    getLastColumn: () => headers.length,
    getRange: () => ({ getDisplayValues: () => [headers] })
  };
  sandbox.context._coreOpenSource_ = () => ({
    config: { headerRow: 1 },
    sheet
  });
  sandbox.context._coreReadCandidateRows_ = () => new Map([[2, currentValues]]);
  sandbox.context._coreRowToRecord_ = (headerRow, values) => Object.fromEntries(
    headerRow.map((field, index) => [field, values[index]])
  );
  const candidate = {
    rowNumber: 2,
    record: {
      asignacion_id: 'ASG_001',
      active: true,
      estructura_local_id: 'REL_001',
      local_id: 'LOC_001'
    }
  };

  const originalPage = sandbox.context._coreQueryHydratePage_(
    { spreadsheetId: 'S', sheetName: 'asignaciones' },
    [candidate]
  );
  assert.equal(originalPage[0].anexo, 1001);

  currentValues = ['ASG_001', true, 'REL_001', 'LOC_999', 1001];
  assert.throws(
    () => sandbox.context._coreQueryHydratePage_(
      { spreadsheetId: 'S', sheetName: 'asignaciones' },
      [candidate]
    ),
    /fuente cambió durante la consulta/
  );

  currentValues = ['ASG_999', true, 'REL_001', 'LOC_001', 1001];
  assert.throws(
    () => sandbox.context._coreQueryHydratePage_(
      { spreadsheetId: 'S', sheetName: 'asignaciones' },
      [candidate]
    ),
    /fuente cambió durante la consulta/
  );
});


test('queryRecords intersecta filters con anyOf cuando repiten un campo', () => {
  const sandbox = createSandbox();
  const result = sandbox.context.queryRecords(
    { spreadsheetId: 'S', sheetName: 'Assignments' },
    {
      idField: 'assignment_id',
      filters: { status: 'ACTIVE' },
      anyOf: [{ status: ['ACTIVE', 'INACTIVE'] }],
      sortBy: 'assignment_id',
      cacheSeconds: 0,
      candidateCacheSeconds: 0,
      authorization: sandbox.authorization()
    }
  );

  assert.equal(result.total, 2);
  assert.deepEqual(Array.from(result.records, item => item.assignment_id), ['A', 'D']);
});

test('queryRecords devuelve cero coincidencias si filters y anyOf son incompatibles', () => {
  const sandbox = createSandbox();
  const result = sandbox.context.queryRecords(
    { spreadsheetId: 'S', sheetName: 'Assignments' },
    {
      idField: 'assignment_id',
      filters: { status: 'ACTIVE' },
      anyOf: [{ status: 'INACTIVE' }],
      cacheSeconds: 0,
      candidateCacheSeconds: 0,
      authorization: sandbox.authorization()
    }
  );

  assert.equal(result.total, 0);
  assert.deepEqual(Array.from(result.records), []);
});

test('queryRecords elige como columna conductora un filtro no vacío aunque el primero sea vacío', () => {
  const sandbox = createSandbox();
  const searchFields = [];
  const directLocalRecord = {
    assignment_id: 'LOCAL_1',
    status: 'ACTIVE',
    estructura_local_id: '',
    local_id: 'L1',
    persona_id: 'P5',
    allowed: true
  };
  sandbox.context.findRecordsByFields = (_source, filters, options) => {
    searchFields.push(options.searchField);
    const matches = Object.keys(filters).every(field => {
      const expected = Array.isArray(filters[field]) ? filters[field] : [filters[field]];
      return expected.some(value =>
        String(directLocalRecord[field] === undefined ? '' : directLocalRecord[field]) === String(value)
      );
    });
    return { records: matches ? [directLocalRecord] : [] };
  };

  const result = sandbox.context.queryRecords(
    { spreadsheetId: 'S', sheetName: 'Assignments' },
    {
      idField: 'assignment_id',
      filters: { status: 'ACTIVE' },
      anyOf: [{ estructura_local_id: '', local_id: 'L1' }],
      cacheSeconds: 0,
      candidateCacheSeconds: 0,
      authorization: sandbox.authorization()
    }
  );

  assert.deepEqual(searchFields, ['local_id']);
  assert.deepEqual(Array.from(result.records, item => item.assignment_id), ['LOCAL_1']);
});

test('queryRecords rechaza grupos que solo pueden localizar celdas vacías', () => {
  const sandbox = createSandbox();
  assert.throws(() => sandbox.context.queryRecords(
    { spreadsheetId: 'S', sheetName: 'Assignments' },
    {
      idField: 'assignment_id',
      filters: { estructura_local_id: '' },
      cacheSeconds: 0,
      candidateCacheSeconds: 0,
      authorization: sandbox.authorization()
    }
  ), /columna conductora con valores no vacíos/);
});
