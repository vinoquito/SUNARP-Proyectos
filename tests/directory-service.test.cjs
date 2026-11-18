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

const scriptMatch = frontendSource.match(/<script>([\\s\\S]*?)<\\/script>/i);
assert.ok(scriptMatch, 'DirectoryScripts.html debe contener el bloque JavaScript principal');

const sandbox = vm.createContext({});
vm.runInContext(
  serviceSource + '\\nthis.directoryTestApi = {' +
    'normalizeDocument: _directoryNormalizeDocument_,' +
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
  assert.doesNotThrow(() => new vm.Script(scriptMatch[1]));
  assert.doesNotThrow(() => new vm.Script(coreTestsSource));
});

test('normaliza tipo y número documental eliminando espacios y convirtiendo a mayúsculas', () => {
  assert.equal(api.normalizeDocument(' d n i ', 'Tipo'), 'DNI');
  assert.equal(api.normalizeDocument(' 12 345 678 ', 'Número'), '12345678');
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

test('la edición coordinada impide usar una asignación perteneciente a otra persona', () => {
  assert.match(serviceSource, /La asignación seleccionada no pertenece a la persona indicada/);
});

test('la eliminación de persona comprueba la ficha en el snapshot de datos personales', () => {
  assert.match(serviceSource, /\(context\.datosPersonales \|\| \[\]\)\.some/);
  assert.doesNotMatch(serviceSource, /_directoryLoadPersonalDataLinks_/);
});
