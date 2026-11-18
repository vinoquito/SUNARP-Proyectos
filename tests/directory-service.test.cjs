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
    'normalizeBoolean: _directoryNormalizeBoolean_' +
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
