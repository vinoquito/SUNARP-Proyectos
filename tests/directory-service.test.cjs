const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryService.js');
const frontendPath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryScripts.html');
const coreTestsPath = path.join(root, 'Backend/SUNARP Core/DataCoreTests.js');
const coreRepositoryPath = path.join(root, 'Backend/SUNARP Core/DataRepository.js');
const uiDataTablePath = path.join(root, 'Backend/SUNARP UI/UIDataTableScripts.html');

const serviceSource = fs.readFileSync(servicePath, 'utf8');
const frontendSource = fs.readFileSync(frontendPath, 'utf8');
const coreTestsSource = fs.readFileSync(coreTestsPath, 'utf8');
const coreRepositorySource = fs.readFileSync(coreRepositoryPath, 'utf8');
const uiDataTableSource = fs.readFileSync(uiDataTablePath, 'utf8');

const scriptStart = frontendSource.split('<script>')[1];
assert.ok(scriptStart, 'DirectoryScripts.html debe contener el bloque JavaScript principal');
const frontendScript = scriptStart.split('</script>')[0];

const sandbox = vm.createContext({});
vm.runInContext(
  serviceSource + String.fromCharCode(10) + 'this.directoryTestApi = {' +
    'normalizeDocument: _directoryNormalizeDocument_,' +
    'normalizeDate: _directoryNormalizeDateInput_,' +
    'assertDocumentAvailable: _directoryAssertDocumentAvailable_,' +
    'generateId: _directoryGenerateId_,' +
    'getNextOrder: _directoryGetNextOrder_,' +
    'normalizeInteger: _directoryNormalizeInteger_,' +
    'normalizeBoolean: _directoryNormalizeBoolean_,' +
    'resolveAssignmentLocation: _directoryResolveAssignmentLocation_,' +
    'validateSnapshot: _directoryValidateSnapshot_,' +
    'assignmentSchema: _directoryGetAssignmentSchema_,' +
    'enrichAssignment: _directoryEnrichAssignment_,' +
    'buildView: _directoryBuildView_,' +
    'createPersonalDataMap: _directoryCreatePersonalDataMap_,' +
    'resolveDocumentTypesSource: _directoryResolveDocumentTypesSource_,' +
    'buildFilterContract: _directoryBuildFilterContract_,' +
    'buildAssignmentQuery: _directoryBuildAssignmentQuery_,' +
    'executeAssignmentQuery: _directoryExecuteAssignmentQuery_' +
  '};',
  sandbox,
  { filename: 'DirectoryService.js' }
);

const api = sandbox.directoryTestApi;

test('el servicio, el frontend y las pruebas Core tienen sintaxis válida', () => {
  assert.doesNotThrow(() => new vm.Script(serviceSource));
  assert.doesNotThrow(() => new vm.Script(frontendScript));
  assert.doesNotThrow(() => new vm.Script(coreTestsSource));
  assert.doesNotThrow(() => new vm.Script(coreRepositorySource));
});


test('SUNARP Core ofrece lectura limitada desde el final de una fuente', () => {
  const start = coreRepositorySource.indexOf('function listTailRecords(source, options) {');
  const end = coreRepositorySource.indexOf('function getRecordById(', start);
  const implementation = coreRepositorySource.slice(start, end);
  assert.ok(implementation.includes('sheet.getRange('));
  assert.ok(implementation.includes('startRow, 1, numberOfRows, lastColumn'));
  assert.ok(implementation.includes('const startRow = Math.max(dataStartRow, endRow - limit + 1)'));
  assert.ok(!implementation.includes('getDataRange'));
});
test('SUNARP Core limita la lectura agrupada al rango realmente ocupado de cada pestaña', () => {
  const start = coreRepositorySource.indexOf('function listRecordsFromSources(requests) {');
  const end = coreRepositorySource.indexOf('function ', start + 20);
  const implementation = coreRepositorySource.slice(start, end);
  assert.match(implementation, /const lastRow = sheet\.getLastRow\(\)/);
  assert.match(implementation, /const lastColumn = sheet\.getLastColumn\(\)/);
  assert.match(implementation, /sheet\.getRange\(1, 1, lastRow, lastColumn\)\.getValues\(\)/);
  assert.doesNotMatch(implementation, /sheet\.getDataRange\(\)/);
});

test('SUNARP Core no contiene definiciones globales duplicadas en DataRepository', () => {
  const declarations = [...coreRepositorySource.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)]
    .map(match => match[1]);
  const counts = new Map();
  declarations.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
  assert.deepEqual(duplicates, []);
  assert.match(coreRepositorySource, /ignoreWhitespace/);
});

test('las lecturas del Directorio no ejecutan validación integral de todas las asignaciones', () => {
  for (const name of [
    'getDirectoryInitialData',
    'listDirectoryPeople',
    'listDirectoryAssignments',
    'getDirectoryPersonById'
  ]) {
    const start = serviceSource.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Debe existir ' + name);
    const next = serviceSource.indexOf('\nfunction ', start + 10);
    const implementation = serviceSource.slice(start, next < 0 ? serviceSource.length : next);
    assert.match(implementation, /validateSnapshot:\s*false/);
  }

  const saveStart = serviceSource.indexOf('function saveDirectoryAssignment(');
  const saveEnd = serviceSource.indexOf('function setDirectoryAssignmentActive(', saveStart);
  const saveImplementation = serviceSource.slice(saveStart, saveEnd);
  assert.doesNotMatch(saveImplementation, /validateSnapshot:\\s*false/);
});

test('el catálogo de tipos de documento se resuelve exclusivamente desde Global parameters', () => {
  const requested = [];
  sandbox.getIntranetDataSource = (sourceKey, sheetName, headerRow) => {
    requested.push({ sourceKey, sheetName, headerRow });
    return { sourceKey, sheetName, headerRow };
  };
  sandbox.SUNARPCore = {
    getSourceInfoCached: source => ({
      headers: ['id', 'name']
    })
  };

  const source = api.resolveDocumentTypesSource();

  assert.deepEqual(requested, [{
    sourceKey: 'MASTER_DATA',
    sheetName: 'tipo_documento_identidad',
    headerRow: 1
  }]);
  assert.equal(source.sourceKey, 'MASTER_DATA');
  assert.equal(source.sheetName, 'tipo_documento_identidad');
});

test('acepta fechas ISO válidas y campos de fecha vacíos', () => {
  assert.equal(api.normalizeDate('2026-02-28', 'Fecha'), '2026-02-28');
  assert.equal(api.normalizeDate('', 'Fecha'), '');
});

test('rechaza fechas inexistentes y formatos ambiguos', () => {
  assert.throws(() => api.normalizeDate('2026-02-30', 'Fecha'), /calendario/i);
  assert.throws(() => api.normalizeDate('28/02/2026', 'Fecha'), /AAAA-MM-DD/i);
});

test('normaliza tipo y número documental eliminando espacios y convirtiendo a mayúsculas', () => {
  assert.equal(api.normalizeDocument(' d n i ', 'Tipo'), 'DNI');
  assert.equal(api.normalizeDocument(' 12 345 678 ', 'Número'), '12345678');
});

test('rechaza valores documentales que exceden el máximo de 30 caracteres', () => {
  assert.throws(() => api.normalizeDocument('D'.repeat(31), 'Tipo'), /30 caracteres/);
});

test('rechaza un documento duplicado aunque el registro existente tenga espacios', () => {
  assert.throws(
    () => api.assertDocumentAvailable(
      'DNI',
      '12345678',
      [{ servidor_id: 'PER_001', tipo_documento: 'dni', numero_documento: '12 345 678' }],
      'PER_002'
    ),
    /documento ya está registrado/i
  );
});

test('permite el mismo número cuando el tipo documental es distinto', () => {
  assert.doesNotThrow(() => api.assertDocumentAvailable(
    'CE',
    '12345678',
    [{ servidor_id: 'PER_001', tipo_documento: 'DNI', numero_documento: '12345678' }],
    'PER_002'
  ));
});

test('permite conservar el documento de la misma persona durante una edición', () => {
  assert.doesNotThrow(() => api.assertDocumentAvailable(
    'DNI',
    '12345678',
    [{ servidor_id: 'PER_001', tipo_documento: 'DNI', numero_documento: '12345678' }],
    'PER_001'
  ));
});

test('genera el siguiente identificador sin reutilizar los existentes', () => {
  assert.equal(
    api.generateId(
      [{ persona_id: 'PER_001' }, { persona_id: 'PER_009' }, { persona_id: 'otro' }],
      { field: 'persona_id', prefix: 'PER_', digits: 3 }
    ),
    'PER_010'
  );
});

test('calcula el siguiente orden dentro de la misma relación estructura-local', () => {
  assert.equal(
    api.getNextOrder([
      { estructura_local_id: 'REL_1', order: 2 },
      { estructura_local_id: 'REL_1', order: 7 },
      { estructura_local_id: 'REL_2', order: 20 }
    ], 'REL_1'),
    8
  );
});

test('normaliza estados booleanos y rechaza valores ambiguos', () => {
  assert.equal(api.normalizeBoolean('true'), true);
  assert.equal(api.normalizeBoolean('0'), false);
  assert.throws(() => api.normalizeBoolean('desconocido'), /verdadero o falso/i);
});

test('admite anexo vacío y valida anexos enteros', () => {
  assert.equal(api.normalizeInteger('', 'Anexo', true), '');
  assert.equal(api.normalizeInteger('1234', 'Anexo', true), 1234);
  assert.throws(() => api.normalizeInteger('12A', 'Anexo', true), /número entero/i);
});


test('la creación de personas no está expuesta como operación independiente', () => {
  assert.ok(serviceSource.includes('function _saveDirectoryPerson_('));
  assert.equal(serviceSource.includes('function saveDirectoryPerson('), false);
});

test('la edición coordinada impide usar una asignación perteneciente a otra persona', () => {
  assert.match(serviceSource, /La asignación seleccionada no pertenece a la persona indicada/);
});

test('la eliminación de persona comprueba la ficha en el snapshot de datos personales', () => {
  assert.match(serviceSource, /const personalData = _directoryFindPersonalDataById_\(id\)/);
  assert.doesNotMatch(serviceSource, /_directoryLoadPersonalDataLinks_/);
});


function createDirectorySandbox() {
  const context = vm.createContext({});
  vm.runInContext(serviceSource, context, { filename: 'DirectoryService.js' });
  context._directoryAssertAllowedFields_ = () => true;
  context._directoryLoadContext_ = () => ({ datosPersonales: [] });
  context._directoryAssertDocumentAvailable_ = (type, number) => ({
    tipo_documento: String(type).toUpperCase(),
    numero_documento: String(number)
  });
  context._directoryInvalidateCache_ = () => {};
  context._directorySource_ = name => name;
  context.SUNARPCore = {
    findRecordsByFields: (source, filters) => {
      const snapshot = context._directoryLoadContext_() || {};
      const field = Object.keys(filters)[0];
      const rows = field === 'persona_id'
        ? (snapshot.personas || [])
        : field === 'servidor_id'
          ? (snapshot.datosPersonales || [])
          : [];
      const records = rows.filter(item => String(item[field] || '') === String(filters[field] || ''));
      return { records, total: records.length };
    },
    searchRecordsByFields: (source, query, fields) => {
      const snapshot = context._directoryLoadContext_() || {};
      const expected = String(query || '').toLowerCase();
      const records = (snapshot.personas || []).filter(item =>
        fields.some(field => String(item[field] || '').toLowerCase().includes(expected))
      );
      return { records, total: records.length };
    },
    listRecordsFromSourcesCached: () => ({
      people: (context._directoryLoadContext_().personas || [])
    })
  };
  return context;
}

test('el alta coordinada crea persona, ficha y primera asignación en ese orden', () => {
  const context = createDirectorySandbox();
  const calls = [];
  context._saveDirectoryPerson_ = payload => {
    calls.push('persona');
    return { person: { persona_id: 'PER_001' } };
  };
  context._saveDirectoryPersonalData_ = payload => {
    calls.push('ficha');
    return { personalData: { servidor_id: payload.servidor_id } };
  };
  context.saveDirectoryAssignment = payload => {
    calls.push('asignacion');
    return { assignment: { asignacion_id: 'ASG_001' } };
  };

  const result = context.saveDirectoryEntry({
    nombres: 'Ana',
    apellidos: 'Pérez',
    tipo_documento: 'DNI',
    numero_documento: '12345678',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_001'
  });

  assert.deepEqual(calls, ['persona', 'ficha', 'asignacion']);
  assert.equal(result.person.persona_id, 'PER_001');
  assert.equal(result.personalData.servidor_id, 'PER_001');
  assert.equal(result.assignment.asignacion_id, 'ASG_001');
});

test('si falla la primera asignación, el alta coordinada compensa persona y ficha', () => {
  const context = createDirectorySandbox();
  const deleted = [];
  context._saveDirectoryPerson_ = () => ({ person: { persona_id: 'PER_002' } });
  context._saveDirectoryPersonalData_ = () => ({ personalData: { servidor_id: 'PER_002' } });
  context.saveDirectoryAssignment = () => { throw new Error('fallo de asignación'); };
  context.SUNARPCore = {
    deleteRecord: (source, field, id) => {
      deleted.push([source, field, id]);
      return { success: true };
    }
  };

  assert.throws(() => context.saveDirectoryEntry({
    nombres: 'Luis',
    apellidos: 'Díaz',
    tipo_documento: 'DNI',
    numero_documento: '87654321',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_001'
  }), /fallo de asignación/);

  assert.deepEqual(deleted, [
    ['servidores datos personales', 'servidor_id', 'PER_002'],
    ['personas', 'persona_id', 'PER_002']
  ]);
});

test('una asignación adicional no crea ni modifica persona o ficha personal', () => {
  const context = createDirectorySandbox();
  let personWrites = 0;
  let personalWrites = 0;
  let assignmentPayload;
  context._saveDirectoryPerson_ = () => { personWrites++; };
  context.saveDirectoryPersonalData = () => { personalWrites++; };
  context.saveDirectoryAssignment = payload => {
    assignmentPayload = payload;
    return { assignment: { asignacion_id: 'ASG_009' } };
  };

  const result = context.saveDirectoryEntry({
    persona_id: 'PER_009',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_001'
  });

  assert.equal(personWrites, 0);
  assert.equal(personalWrites, 0);
  assert.equal(assignmentPayload.persona_id, 'PER_009');
  assert.equal(result.assignment.asignacion_id, 'ASG_009');
});


test('la edición rechaza una asignación que pertenece a otra persona antes de escribir', () => {
  const context = createDirectorySandbox();
  let writes = 0;
  context._directoryLoadContext_ = () => ({
    personas: [{ persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez' }],
    datosPersonales: [],
    asignaciones: [{ asignacion_id: 'ASG_002', persona_id: 'PER_002' }]
  });
  context._directoryAssertDocumentAvailable_ = () => ({
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  });
  context._saveDirectoryPerson_ = () => { writes++; };
  context.saveDirectoryPersonalData = () => { writes++; };
  context.saveDirectoryAssignment = () => { writes++; };

  assert.throws(() => context.saveDirectoryEntry({
    persona_id: 'PER_001',
    asignacion_id: 'ASG_002',
    nombres: 'Ana',
    apellidos: 'Pérez',
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  }), /no pertenece a la persona indicada/i);
  assert.equal(writes, 0);
});

test('el guardado directo de ficha personal aplica la unicidad documental normalizada', () => {
  const start = serviceSource.indexOf('function _saveDirectoryPersonalData_(');
  const end = serviceSource.indexOf('function saveDirectoryEntry(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('_directoryAssertDocumentAvailable_('));
});


test('el formulario permite registrar y actualizar observaciones de cada asignación', () => {
  assert.ok(frontendSource.includes('directoryFormObservaciones'));
  assert.ok(frontendSource.includes("observaciones: document.getElementById('directoryFormObservaciones')"));
});


function assignmentContext() {
  return {
    personas: [{ persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez' }],
    datosPersonales: [],
    asignaciones: [],
    cargos: [{ id: 'CAR_001', name: 'Analista' }],
    sedes: [{ id: 'SEDE_1', name: 'Lima' }],
    locales: [{ id: 'LOC_1', name: 'Local Lima', sede_id: 'SEDE_1', tipo_local_id: 'TL_1' }],
    estructuraOrg: [{ id: 'EST_1', name: 'Oficina', parent_id: '', sede_id: 'SEDE_1', tipo_estructura_id: 'TE_1' }],
    estructuraLocal: [{ id: 'REL_1', estructura_id: 'EST_1', local_id: 'LOC_1' }],
    tiposLocal: [{ id: 'TL_1', name: 'Sede' }],
    tiposEstructura: [{ id: 'TE_1', name: 'Oficina' }]
  };
}

function createDirectoryQueryAuthorization(context, scopes) {
  return {
    auth: {
      authenticated: true,
      personaId: 'PER_ADMIN',
      moduleAccess: [{
        modulo_id: 'MOD_INFO_PERSONAL',
        permissionCodes: ['INFORMACION_PERSONAL_VER'],
        scopes
      }]
    },
    moduleId: 'MOD_INFO_PERSONAL',
    structures: context.estructuraOrg,
    locals: context.locales
  };
}

test('la consulta del Directorio traduce SEDE en relaciones y adscripciones directas al local', () => {
  sandbox.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  sandbox.SUNARPCore = {};
  const context = assignmentContext();
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1', incluir_descendientes: false }
  ]);
  const descriptor = api.buildAssignmentQuery(context, authorization, { active: 'all' });
  const groups = JSON.parse(JSON.stringify(descriptor.queryOptions.anyOf));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { estructura_local_id: ['REL_1'] });
  assert.deepEqual(groups[1], { local_id: ['LOC_1'], estructura_local_id: '' });
  assert.equal(
    descriptor.queryOptions.authorization.scopeRecordLookups[0].values.REL_1.estructura_id,
    'EST_1'
  );
  assert.equal(descriptor.queryOptions.authorization.scopeRecordLookups[0].requireEqualFields[0], 'local_id');
  assert.ok(descriptor.queryOptions.authorization.catalogSources.some(item =>
    item.sourceKey === 'SECURITY' && item.sheetName === 'EstructuraOrg'
  ));
});

test('la consulta de ESTRUCTURA_ORG incluye descendientes pero no asignaciones directas a locales', () => {
  sandbox.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  sandbox.SUNARPCore = {};
  const context = assignmentContext();
  context.estructuraOrg.push({
    id: 'EST_CHILD', name: 'Unidad hija', parent_id: 'EST_1',
    sede_id: 'SEDE_1', tipo_estructura_id: 'TE_1'
  });
  context.estructuraLocal.push({
    id: 'REL_CHILD', estructura_id: 'EST_CHILD', local_id: 'LOC_1'
  });
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'ESTRUCTURA_ORG', referencia_id: 'EST_1', incluir_descendientes: true }
  ]);
  const descriptor = api.buildAssignmentQuery(context, authorization, { active: 'all' });
  const groups = JSON.parse(JSON.stringify(descriptor.queryOptions.anyOf));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], { estructura_local_id: ['REL_1', 'REL_CHILD'] });
});

test('la consulta de LOCAL solo incluye asignaciones directas sin estructura orgánica', () => {
  sandbox.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  sandbox.SUNARPCore = {};
  const context = assignmentContext();
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'LOCAL', referencia_id: 'LOC_1', incluir_descendientes: false }
  ]);
  const descriptor = api.buildAssignmentQuery(context, authorization, { active: 'all' });
  const groups = JSON.parse(JSON.stringify(descriptor.queryOptions.anyOf));
  assert.deepEqual(groups, [{ local_id: ['LOC_1'], estructura_local_id: '' }]);
});

test('listDirectoryAssignments pagina mediante Core y no carga asignaciones completas', () => {
  const context = assignmentContext();
  const pagePerson = { persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez' };
  context.personas = [];
  context.asignaciones = [];
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1', incluir_descendientes: false }
  ]);
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext._directoryAuthorizationContext_ = () => authorization;
  vmContext._directoryLoadContext_ = options => {
    assert.equal(options.includeAssignments, false);
    return context;
  };
  vmContext.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  let query;
  vmContext.SUNARPCore = {
    queryRecords: (source, options) => {
      query = { source, options };
      return {
        records: [{
          asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001',
          estructura_local_id: 'REL_1', local_id: '', active: true, order: 1
        }],
        total: 21,
        offset: options.offset,
        limit: options.limit,
        hasMore: true
      };
    },
    findRecordsByFields: (source, filters) => {
      const ids = Array.isArray(filters.persona_id) ? Array.from(filters.persona_id) : [filters.persona_id];
      const records = ids.includes('PER_001') ? [pagePerson] : [];
      return { records, total: records.length };
    }
  };
  const result = vmContext.listDirectoryAssignments({ page: 2, pageSize: 10 });
  assert.equal(query.options.offset, 10);
  assert.equal(query.options.limit, 10);
  assert.equal(query.options.idField, 'asignacion_id');
  assert.equal(result.total, 21);
  assert.equal(result.offset, 10);
  assert.equal(result.records[0].asignacion_id, 'ASG_001');
  assert.equal(result.records[0].sede_id, 'SEDE_1');
});

test('getDirectoryInitialData carga solo catálogos y una página, reutilizando consultas distintas de Core', () => {
  const context = assignmentContext();
  const pagePerson = { persona_id: 'PER_001', nombres: 'Ana', apellidos: 'Pérez' };
  context.personas = [];
  context.asignaciones = [];
  context.documentTypes = [];
  const authorization = createDirectoryQueryAuthorization(context, [
    { tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false }
  ]);
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  vmContext._directoryAuthorizationContext_ = () => authorization;
  vmContext._directoryLoadContext_ = options => {
    assert.equal(options.includeAssignments, false);
    assert.equal(options.includePeople, false);
    assert.equal(options.includePersonalData, false);
    return context;
  };
  vmContext._accessRecordIsAllowed_ = () => true;
  vmContext.getIntranetDataSource = (sourceKey, sheetName, headerRow) => ({
    sourceKey, sheetName, headerRow, spreadsheetId: 'SPREADSHEET_' + sourceKey
  });
  const queryCalls = [];
  vmContext.SUNARPCore = {
    queryRecords: (source, options) => {
      queryCalls.push(options);
      if (options.distinctBy === 'cargo_id') {
        return { records: [{ cargo_id: 'CAR_001' }], total: 1 };
      }
      if (options.distinctBy === 'estructura_local_id') {
        return { records: [{ estructura_local_id: 'REL_1' }], total: 1 };
      }
      if (options.distinctBy === 'local_id') {
        return { records: [{ local_id: 'LOC_1' }], total: 1 };
      }
      if (options.distinctBy === 'persona_id') {
        return { records: [{ persona_id: 'PER_001' }], total: 1 };
      }
      return {
        records: [{
          asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001',
          estructura_local_id: 'REL_1', local_id: '', active: true, order: 1
        }],
        total: 1
      };
    },
    findRecordsByFields: () => ({ records: [pagePerson], total: 1 })
  };

  const result = vmContext.getDirectoryInitialData();
  assert.equal(queryCalls.length, 5);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].nombres, 'Ana');
  assert.equal(result.records[0].apellidos, 'Pérez');
  assert.equal(result.records[0].cargo_name, 'Analista');
  assert.equal(result.summary.people, 1);
  assert.equal(result.summary.assignments, 1);
  assert.deepEqual(Array.from(result.catalogs.filterContract.selectable.cargoIds), ['CAR_001']);
});

test('la validación de contexto parcial conserva las relaciones sin exigir cargar todas las personas', () => {
  const context = assignmentContext();
  context.personas = [];
  context.datosPersonales = [];
  context.asignaciones = [{
    asignacion_id: 'ASG_001',
    persona_id: 'PER_001',
    cargo_id: 'CAR_001',
    estructura_local_id: 'REL_1',
    local_id: ''
  }];
  assert.doesNotThrow(() =>
    api.validateSnapshot(context, {
      includePeople: false,
      includePersonalData: false
    })
  );
});

test('acepta una asignación vinculada únicamente a estructura_local_id y no completa local_id', () => {
  const context = assignmentContext();
  const assignment = { estructura_local_id: 'REL_1', local_id: '' };
  const resolved = api.resolveAssignmentLocation(assignment, context, true);
  assert.equal(resolved.estructura_id, 'EST_1');
  assert.equal(resolved.sede_id, 'SEDE_1');
  assert.equal(resolved.local.name, 'Local Lima');
  assert.equal(assignment.local_id, '');
});

test('acepta una asignación vinculada únicamente a local_id', () => {
  const context = assignmentContext();
  const resolved = api.resolveAssignmentLocation(
    { estructura_local_id: '', local_id: 'LOC_1' }, context, true
  );
  assert.equal(resolved.estructura_id, '');
  assert.equal(resolved.sede_id, 'SEDE_1');
  assert.equal(resolved.local.name, 'Local Lima');
});

test('acepta ambos identificadores cuando corresponden a la misma relación', () => {
  const context = assignmentContext();
  const resolved = api.resolveAssignmentLocation(
    { estructura_local_id: 'REL_1', local_id: 'LOC_1' }, context, true
  );
  assert.equal(resolved.estructura_id, 'EST_1');
  assert.equal(resolved.sede_id, 'SEDE_1');
});

test('rechaza ambos identificadores vacíos', () => {
  assert.throws(() => api.resolveAssignmentLocation(
    { estructura_local_id: '', local_id: '' }, assignmentContext(), true
  ), /debe estar vinculada/i);
});

test('rechaza local y relación incoherentes', () => {
  const context = assignmentContext();
  context.locales.push({ id: 'LOC_2', name: 'Otro local', sede_id: 'SEDE_1' });
  assert.throws(() => api.resolveAssignmentLocation(
    { estructura_local_id: 'REL_1', local_id: 'LOC_2' }, context, true
  ), /no corresponde/i);
});

test('rechaza referencias de relación o local inexistentes', () => {
  const context = assignmentContext();
  assert.throws(() => api.resolveAssignmentLocation(
    { estructura_local_id: 'REL_X', local_id: '' }, context, true
  ), /relación estructura_local no existe/i);
  assert.throws(() => api.resolveAssignmentLocation(
    { estructura_local_id: '', local_id: 'LOC_X' }, context, true
  ), /local no existe/i);
});

test('la validación integral del snapshot admite los tres tipos de adscripción', () => {
  const context = assignmentContext();
  context.asignaciones = [
    { asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: 'REL_1', local_id: '' },
    { asignacion_id: 'ASG_002', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: '', local_id: 'LOC_1' },
    { asignacion_id: 'ASG_003', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: 'REL_1', local_id: 'LOC_1' }
  ];
  assert.doesNotThrow(() => api.validateSnapshot(context));
});

test('el esquema no exige individualmente estructura_local_id ni local_id', () => {
  const schema = api.assignmentSchema();
  assert.equal(schema.estructura_local_id.required, undefined);
  assert.equal(schema.local_id.required, undefined);
});


test('el enriquecimiento conserva la modalidad local-only y expone su sede y local', () => {
  const context = assignmentContext();
  const assignment = {
    asignacion_id: 'ASG_010', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 1
  };
  const enriched = api.enrichAssignment(
    assignment, context, new Map(), new Map([['PER_001', context.personas[0]]])
  );
  assert.equal(enriched.estructura_id, '');
  assert.equal(enriched.sede_id, 'SEDE_1');
  assert.equal(enriched.local_name, 'Local Lima');
  assert.equal(enriched.display_location, 'Local Lima');
  assert.equal(enriched.local_id, 'LOC_1');
});

test('el orden se calcula por la combinación exacta de relación y local', () => {
  const records = [
    { estructura_local_id: 'REL_1', local_id: '', order: 3 },
    { estructura_local_id: '', local_id: 'LOC_1', order: 5 },
    { estructura_local_id: 'REL_1', local_id: 'LOC_1', order: 7 },
    { estructura_local_id: '', local_id: 'LOC_2', order: 20 }
  ];
  assert.equal(api.getNextOrder(records, 'REL_1', ''), 4);
  assert.equal(api.getNextOrder(records, '', 'LOC_1'), 6);
  assert.equal(api.getNextOrder(records, 'REL_1', 'LOC_1'), 8);
});


test('las asignaciones local-only aparecen en la vista autorizada', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_020', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 1
  }];
  sandbox._accessRecordIsAllowed_ = () => true;
  const view = api.buildView(context, { auth: {}, structures: [] });
  assert.equal(view.assignments.length, 1);
  assert.equal(view.assignments[0].local_name, 'Local Lima');
  assert.equal(view.assignments[0].estructura_id, '');
});

test('el Directorio autoriza cada asignación antes de construir su registro enriquecido', () => {
  const context = assignmentContext();
  context.locales.push({ id: 'LOC_2', name: 'Local alterno', sede_id: 'SEDE_1' });
  context.estructuraOrg.push({ id: 'EST_2', name: 'Otra oficina', parent_id: '', sede_id: 'SEDE_1' });
  context.estructuraLocal.push({ id: 'REL_2', estructura_id: 'EST_2', local_id: 'LOC_2' });
  context.asignaciones = [
    { asignacion_id: 'ASG_001', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: 'REL_1', local_id: '', active: true, order: 1 },
    { asignacion_id: 'ASG_002', persona_id: 'PER_001', cargo_id: 'CAR_001', estructura_local_id: 'REL_2', local_id: '', active: true, order: 2 }
  ];
  let enrichments = 0;
  sandbox._directoryEnrichAssignment_ = (...args) => {
    enrichments++;
    return api.enrichAssignment(...args);
  };
  sandbox._accessRecordIsAllowed_ = (auth, moduleId, record) =>
    !record.estructura_id || record.estructura_id === 'EST_1';

  const view = api.buildView(context, { auth: {}, structures: [] });
  assert.equal(view.assignments.length, 1);
  assert.equal(view.assignments[0].asignacion_id, 'ASG_001');
  assert.equal(enrichments, 1);
});

test('el cambio de estado funciona para una asignación vinculada directamente a un local', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_021', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 1
  }];
  let statusCall;
  sandbox._directoryAuthorizationContext_ = () => ({ auth: {}, structures: [] });
  sandbox._directoryLoadContext_ = () => context;
  sandbox._directorySource_ = name => name;
  sandbox._directoryInvalidateCache_ = () => {};
  sandbox._accessRecordIsAllowed_ = () => true;
  sandbox._accessRunAudited_ = (auth, event, callback) => callback().value;
  sandbox.SUNARPCore = {
    findRecordsByFields: () => ({ records: context.personas, total: context.personas.length }),
    setRecordStatus: (...args) => { statusCall = args; return { success: true }; }
  };
  const result = sandbox.setDirectoryAssignmentActive('ASG_021', false);
  assert.deepEqual(statusCall.slice(1), ['asignacion_id', 'ASG_021', 'active', false]);
  assert.equal(result.assignment.active, false);
});

test('la eliminación funciona para una asignación vinculada directamente a un local', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_022', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 1
  }];
  let deleteCall;
  sandbox._directoryAuthorizationContext_ = () => ({ auth: {}, structures: [] });
  sandbox._directoryLoadContext_ = () => context;
  sandbox._directorySource_ = name => name;
  sandbox._directoryInvalidateCache_ = () => {};
  sandbox._accessRecordIsAllowed_ = () => true;
  sandbox._accessRunAudited_ = (auth, event, callback) => callback().value;
  sandbox.SUNARPCore = {
    findRecordsByFields: () => ({ records: context.personas, total: context.personas.length }),
    deleteRecord: (...args) => { deleteCall = args; return { success: true }; }
  };
  const result = sandbox.deleteDirectoryAssignment('ASG_022');
  assert.deepEqual(deleteCall.slice(1), ['asignacion_id', 'ASG_022']);
  assert.equal(result.asignacion_id, 'ASG_022');
});


function createAssignmentWriteSandbox(context) {
  const vmContext = vm.createContext({});
  vm.runInContext(serviceSource, vmContext, { filename: 'DirectoryService.js' });
  const writes = [];
  vmContext._directoryAuthorizationContext_ = () => ({ auth: {}, structures: [] });
  vmContext._directoryLoadContext_ = () => context;
  vmContext._directorySource_ = name => name;
  vmContext._directoryInvalidateCache_ = () => {};
  vmContext._accessRecordIsAllowed_ = () => true;
  vmContext._accessRunAudited_ = (auth, event, callback) => callback().value;
  vmContext.SUNARPCore = {
    findRecordsByFields: () => ({
      records: (context.personas || []).slice(),
      total: (context.personas || []).length
    }),
    assertValidRecord: () => true,
    insertRecord: (source, record) => {
      writes.push({ operation: 'insert', source, record: Object.assign({}, record) });
      return { success: true, record };
    },
    updateRecord: (source, field, id, patch) => {
      writes.push({ operation: 'update', source, field, id, patch: Object.assign({}, patch) });
      return { success: true, record: Object.assign({}, patch, { [field]: id }) };
    }
  };
  return { context: vmContext, writes };
}

test('el guardado persiste exactamente los tres modelos de adscripción', () => {
  const cases = [
    { estructura_local_id: 'REL_1', local_id: '' },
    { estructura_local_id: '', local_id: 'LOC_1' },
    { estructura_local_id: 'REL_1', local_id: 'LOC_1' }
  ];
  cases.forEach((location, index) => {
    const fixture = createAssignmentWriteSandbox(assignmentContext());
    fixture.context.saveDirectoryAssignment(Object.assign({
      persona_id: 'PER_001', cargo_id: 'CAR_001', active: true
    }, location));
    const saved = fixture.writes[0].record;
    assert.equal(saved.estructura_local_id, location.estructura_local_id);
    assert.equal(saved.local_id, location.local_id);
  });
});

test('el guardado rechaza una asignación sin adscripción antes de escribir', () => {
  const fixture = createAssignmentWriteSandbox(assignmentContext());
  assert.throws(() => fixture.context.saveDirectoryAssignment({
    persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: ''
  }), /debe estar vinculada/i);
  assert.equal(fixture.writes.length, 0);
});

test('la edición parcial conserva la adscripción local-only existente', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_030', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: '', local_id: 'LOC_1', active: true, order: 4
  }];
  const fixture = createAssignmentWriteSandbox(context);
  fixture.context.saveDirectoryAssignment({
    asignacion_id: 'ASG_030', observaciones: 'Actualizada'
  });
  const patch = fixture.writes[0].patch;
  assert.equal(patch.estructura_local_id, '');
  assert.equal(patch.local_id, 'LOC_1');
  assert.equal(patch.observaciones, 'Actualizada');
});

test('la edición permite pasar de ambos identificadores a local-only vaciando la relación', () => {
  const context = assignmentContext();
  context.asignaciones = [{
    asignacion_id: 'ASG_031', persona_id: 'PER_001', cargo_id: 'CAR_001',
    estructura_local_id: 'REL_1', local_id: 'LOC_1', active: true, order: 4
  }];
  const fixture = createAssignmentWriteSandbox(context);
  fixture.context.saveDirectoryAssignment({
    asignacion_id: 'ASG_031', estructura_local_id: ''
  });
  assert.equal(fixture.writes[0].patch.estructura_local_id, '');
  assert.equal(fixture.writes[0].patch.local_id, 'LOC_1');
});


test('el Directorio utiliza exclusivamente la caché central de SUNARP Core', () => {
  assert.match(serviceSource, /listRecordsFromSourcesCached\(requests, DIRECTORY_DATA_CACHE_TTL\)/);
  assert.doesNotMatch(serviceSource, /function _directoryWriteCachedContext_/);
  assert.doesNotMatch(serviceSource, /function _directoryReadCachedContext_/);
  assert.doesNotMatch(serviceSource, /DIRECTORY_CACHE_PART_SUFFIX/);
  assert.match(serviceSource, /sources\.map\(source => SUNARPCore\.invalidateSourceCache\(source\)\)/);
  assert.match(serviceSource, /function clearDirectoryCache\(\)/);
});

test('la carga inicial y las páginas del Directorio consultan asignaciones mediante Core', () => {
  const initialStart = serviceSource.indexOf('function getDirectoryInitialData() {');
  const initialEnd = serviceSource.indexOf('function listDirectoryPeople(', initialStart);
  const initial = serviceSource.slice(initialStart, initialEnd);
  const listStart = serviceSource.indexOf('function listDirectoryAssignments(', initialStart);
  const listEnd = serviceSource.indexOf('function ', listStart + 10);
  const listing = serviceSource.slice(listStart, listEnd);
  assert.match(initial, /records:\s*initialPage\.records/);
  assert.match(initial, /includeAssignments:\s*false/);
  assert.match(initial, /_directoryExecuteAssignmentQuery_/);
  assert.match(listing, /includeAssignments:\s*false/);
  assert.match(listing, /_directoryExecuteAssignmentQuery_/);
  assert.match(serviceSource, /function _directoryBuildAssignmentQuery_/);
  assert.match(serviceSource, /SUNARPCore\.queryRecords/);
  assert.match(serviceSource, /selectedSiteId/);
  assert.match(serviceSource, /options\.cargoId/);
  assert.match(serviceSource, /selectedStructureId/);
  assert.match(listing, /pageSize > 100/);
  assert.doesNotMatch(listing, /view\.assignments/);
});

test('la carga inicial no recupera asignaciones ni datos personales completos', () => {
  const initialDataStart = serviceSource.indexOf('function getDirectoryInitialData() {');
  const initialDataEnd = serviceSource.indexOf('function listDirectoryPeople(', initialDataStart);
  const initialDataSource = serviceSource.slice(initialDataStart, initialDataEnd);
  assert.match(initialDataSource, /includePersonalData:\s*false/);
  assert.match(initialDataSource, /includePeople:\s*false/);
  assert.match(initialDataSource, /includeAssignments:\s*false/);
  assert.doesNotMatch(initialDataSource, /context\.datosPersonales|context\.personas|tipo_documento|numero_documento|fecha_nacimiento/);
  assert.match(serviceSource, /function getDirectoryPersonById\([\s\S]*?findRecordsByFields\([\s\S]*?servidor_id/s);
  assert.match(frontendScript, /callServer\('getDirectoryPersonById', record\.persona_id\)/);
});

test('la autorización y el enriquecimiento reutilizan la adscripción resuelta una sola vez', () => {
  const start = serviceSource.indexOf('function _directoryBuildView_(');
  const end = serviceSource.indexOf('function _directorySortAssignments_(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('_directoryResolveAssignmentLocation_(item, context, false)'));
  assert.ok(implementation.includes('estructura_id: location.estructura_id'));
  assert.ok(implementation.includes('sede_id: location.sede_id'));
  assert.ok(implementation.includes('record,'));
  assert.ok(implementation.includes('peopleMap, location'));
});

test('el ordenamiento resuelve una sola vez la adscripción de cada registro', () => {
  const start = serviceSource.indexOf('function _directorySortAssignments_(');
  const end = serviceSource.indexOf('function _directoryGetPersonSchema_(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('const sortable = records.map'));
  assert.ok(implementation.includes('return sortable.map'));
  assert.equal(implementation.split('_directoryResolveAssignmentLocation_(').length - 1, 1);
});


test('la interfaz conserva la instantánea anterior cuando falla una actualización', () => {
  const loadStart = frontendSource.indexOf('async function load(force = false)');
  const loadEnd = frontendSource.indexOf('/* =====================================================\n     15. NAVEGACIÓN', loadStart);
  const loadSource = frontendSource.slice(loadStart, loadEnd);
  assert.ok(loadSource.includes('const hadLoadedSnapshot = state.loaded'));
  assert.ok(loadSource.includes('state.loaded = hadLoadedSnapshot'));
  assert.ok(loadSource.includes('if (!hadLoadedSnapshot && container)'));
  assert.ok(loadSource.includes('Se conserva la última información cargada.'));
});

test('el contrato de filtros separa ámbitos fijos, opciones autorizadas y ancestros contextuales', () => {
  const authorization = {
    moduleId: 'MOD_INFO_PERSONAL',
    auth: { moduleAccess: [{
      modulo_id: 'MOD_INFO_PERSONAL',
      scopes: [
        { tipo_ambito_id: 'ESTRUCTURA_ORG', referencia_id: 'EST_1', incluir_descendientes: true },
        { tipo_ambito_id: 'LOCAL', referencia_id: 'LOC_9', incluir_descendientes: false }
      ]
    }] }
  };
  const structures = [
    { id: 'EST_ROOT', parent_id: '' },
    { id: 'EST_1', parent_id: 'EST_ROOT' },
    { id: 'EST_CHILD', parent_id: 'EST_1' }
  ];
  const contract = api.buildFilterContract(authorization, [
    { estructura_id: 'EST_CHILD', sede_id: 'SEDE_1', local_id: 'LOC_1', cargo_id: 'CAR_1' },
    { estructura_id: '', sede_id: 'SEDE_2', local_id: 'LOC_9', cargo_id: 'CAR_2' }
  ], structures);

  assert.equal(JSON.stringify(contract.scopes), JSON.stringify([
    { type: 'ESTRUCTURA_ORG', referenceId: 'EST_1', includeDescendants: true },
    { type: 'LOCAL', referenceId: 'LOC_9', includeDescendants: false }
  ]));
  assert.equal(JSON.stringify(contract.fixed.structureIds), JSON.stringify(['EST_1']));
  assert.equal(JSON.stringify(contract.fixed.localIds), JSON.stringify(['LOC_9']));
  assert.equal(JSON.stringify(contract.selectable.sedeIds), JSON.stringify(['SEDE_1', 'SEDE_2']));
  assert.equal(JSON.stringify(contract.selectable.cargoIds), JSON.stringify(['CAR_1', 'CAR_2']));
  assert.equal(JSON.stringify(contract.selectable.structureIds), JSON.stringify(['EST_CHILD']));
  assert.equal(JSON.stringify(contract.contextStructureIds), JSON.stringify(['EST_1', 'EST_ROOT']));
});

test('el contrato de filtros reconoce TOTAL sin convertirlo en una selección restrictiva', () => {
  const contract = api.buildFilterContract({
    moduleId: 'MOD_INFO_PERSONAL',
    auth: { moduleAccess: [{
      modulo_id: 'MOD_INFO_PERSONAL',
      scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '', incluir_descendientes: false }]
    }] }
  }, [{ sede_id: 'SEDE_1', cargo_id: 'CAR_1', estructura_id: 'EST_1', local_id: 'LOC_1' }], []);
  assert.equal(contract.fixed.total, true);
  assert.equal(JSON.stringify(contract.fixed.sedeIds), '[]');
  assert.equal(JSON.stringify(contract.selectable.sedeIds), JSON.stringify(['SEDE_1']));
});

test('el DataTable consume la primera página entregada por el bootstrap sin repetir la consulta inicial', () => {
  assert.match(frontendSource, /initialData:\s*state\.initialPage\s*\|\|\s*null/);
  assert.match(frontendSource, /state\.initialPage\s*=\s*result\.page/);
  assert.match(uiDataTableSource, /hasInitialServerData/);
  assert.match(uiDataTableSource, /mode === 'server' && !hasInitialServerData/);
});
