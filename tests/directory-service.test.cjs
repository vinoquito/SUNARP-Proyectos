const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryService.js');
const frontendPath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryScripts.html');
const coreTestsPath = path.join(root, 'Backend/SUNARP Core/DataCoreTests.js');

const serviceSource = fs.readFileSync(servicePath, 'utf8');
const frontendSource = fs.readFileSync(frontendPath, 'utf8');
const coreTestsSource = fs.readFileSync(coreTestsPath, 'utf8');

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
    'buildView: _directoryBuildView_', 'createPersonalDataMap: _directoryCreatePersonalDataMap_' +
  '};',
  sandbox,
  { filename: 'DirectoryService.js' }
);

const api = sandbox.directoryTestApi;

test('el servicio, el frontend y las pruebas Core tienen sintaxis válida', () => {
  assert.doesNotThrow(() => new vm.Script(serviceSource));
  assert.doesNotThrow(() => new vm.Script(frontendScript));
  assert.doesNotThrow(() => new vm.Script(coreTestsSource));
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
  assert.match(serviceSource, /\(context\.datosPersonales \|\| \[\]\)\.some/);
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


test('un fallo al invalidar caché no convierte una escritura exitosa en error', () => {
  const context = createDirectorySandbox();
  context.SUNARPCore = {
    removeCachedValue: () => { throw new Error('caché no disponible'); }
  };
  context.console = { warn: () => {} };
  assert.doesNotThrow(() => context._directoryInvalidateCache_());
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
  sandbox.SUNARPCore = { setRecordStatus: (...args) => { statusCall = args; return { success: true }; } };
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
  sandbox.SUNARPCore = { deleteRecord: (...args) => { deleteCall = args; return { success: true }; } };
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


test('el contexto del directorio se almacena comprimido en fragmentos y se reconstruye íntegro', () => {
  const zlib = require('node:zlib');
  const context = vm.createContext({});
  vm.runInContext(serviceSource, context, { filename: 'DirectoryService.js' });

  const cache = new Map();
  context.SUNARPCore = {
    putCachedValue: (key, value) => {
      const serialized = JSON.stringify({ format: 1, value });
      assert.ok(Buffer.byteLength(serialized, 'utf8') <= 95 * 1024);
      cache.set(key, JSON.parse(serialized).value);
      return { success: true, sizeBytes: Buffer.byteLength(serialized, 'utf8') };
    },
    getCachedValue: key => cache.has(key) ? cache.get(key) : null,
    removeCachedValue: key => cache.delete(key),
    removeCachedValues: keys => keys.forEach(key => cache.delete(key))
  };
  context.Utilities = {
    newBlob: data => {
      const bytes = Buffer.isBuffer(data) || data instanceof Uint8Array || Array.isArray(data)
        ? Buffer.from(data)
        : Buffer.from(String(data), 'utf8');
      return {
        getBytes: () => Array.from(bytes),
        getDataAsString: encoding => bytes.toString(encoding || 'utf8')
      };
    },
    gzip: blob => {
      const bytes = zlib.gzipSync(Buffer.from(blob.getBytes()));
      return { getBytes: () => Array.from(bytes) };
    },
    ungzip: blob => {
      const bytes = zlib.gunzipSync(Buffer.from(blob.getBytes()));
      return { getDataAsString: encoding => bytes.toString(encoding || 'utf8') };
    },
    base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    base64Decode: value => Array.from(Buffer.from(value, 'base64')),
    getUuid: () => 'test-cache-token'
  };

  // Datos suficientemente grandes y poco comprimibles para exigir varios fragmentos.
  let seed = 987654321;
  let payload = '';
  for (let index = 0; index < 190000; index++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    payload += String.fromCharCode(32 + (seed % 95));
  }
  const original = {
    personas: [{ persona_id: 'PER_001', nombres: payload }],
    datosPersonales: [{ servidor_id: 'PER_001', numero_documento: '12345678' }],
    asignaciones: [{ asignacion_id: 'ASG_001', local_id: '' }],
    catalogos: { sedes: [{ id: 'SEDE_1' }] }
  };

  const stored = context._directoryWriteCachedContext_(original);
  assert.ok(stored.parts > 1, 'el contenido grande debe dividirse en más de un fragmento');
  assert.ok(stored.encodedBytes > 80 * 1024);

  const restored = context._directoryReadCachedContext_();
  assert.equal(JSON.stringify(restored), JSON.stringify(original));
  assert.equal(restored.datosPersonales[0].numero_documento, '12345678');
});

test('la invalidación elimina el manifiesto y todos los fragmentos de caché', () => {
  const context = vm.createContext({});
  vm.runInContext(serviceSource, context, { filename: 'DirectoryService.js' });
  const removed = [];
  context.SUNARPCore = {
    getCachedValue: key => key.endsWith(':manifest')
      ? { version: 1, token: 'old-token', parts: 2 }
      : null,
    removeCachedValues: keys => removed.push(...keys)
  };

  context._directoryInvalidateCache_();

  assert.equal(removed.length, 3);
  assert.ok(removed.some(key => key.endsWith(':manifest')));
  assert.ok(removed.some(key => key.endsWith(':part:old-token:0')));
  assert.ok(removed.some(key => key.endsWith(':part:old-token:1')));
});



test('la carga inicial indexa fichas personales y evita una búsqueda lineal por asignación', () => {
  const records = [
    { servidor_id: 'PER_001', numero_documento: '12345678' },
    { servidor_id: 'PER_002', numero_documento: '87654321' }
  ];
  const index = api.createPersonalDataMap(records);
  assert.equal(index.get('PER_001'), records[0]);
  assert.equal(index.get('PER_002'), records[1]);
  assert.equal(index.has('PER_003'), false);

  const initialDataStart = serviceSource.indexOf('function getDirectoryInitialData() {');
  const initialDataEnd = serviceSource.indexOf('function listDirectoryPeople(', initialDataStart);
  const initialDataSource = serviceSource.slice(initialDataStart, initialDataEnd);
  assert.ok(initialDataSource.includes('_directoryCreatePersonalDataMap_(context.datosPersonales)'));
  assert.ok(!initialDataSource.includes('_directoryGetPersonalDataRecord_('));
});

test('el filtro de asignaciones reutiliza la adscripción ya enriquecida', () => {
  const start = serviceSource.indexOf('function _directoryBuildView_(');
  const end = serviceSource.indexOf('function _directorySortAssignments_(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('estructura_id: record.estructura_id'));
  assert.ok(implementation.includes('sede_id: record.sede_id'));
  assert.ok(!implementation.includes('_directoryResolveAssignmentLocation_(record'));
});

test('el ordenamiento resuelve una sola vez la adscripción de cada registro', () => {
  const start = serviceSource.indexOf('function _directorySortAssignments_(');
  const end = serviceSource.indexOf('function _directoryGetPersonSchema_(', start);
  const implementation = serviceSource.slice(start, end);
  assert.ok(implementation.includes('const sortable = records.map'));
  assert.ok(implementation.includes('return sortable.map'));
  assert.equal(implementation.split('_directoryResolveAssignmentLocation_(').length - 1, 1);
});
