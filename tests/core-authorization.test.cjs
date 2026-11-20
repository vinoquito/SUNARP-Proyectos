const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const corePath = path.join(root, 'Backend/SUNARP Core/CoreAuthorization.js');
const testsPath = path.join(root, 'Backend/SUNARP Core/CoreAuthorizationTests.js');

const coreSource = fs.readFileSync(corePath, 'utf8');
const testsSource = fs.readFileSync(testsPath, 'utf8');
const appManifestPath = path.join(root, 'Backend/Gestor de intranet SUNARP/appsscript.json');
const appManifest = JSON.parse(fs.readFileSync(appManifestPath, 'utf8'));


test('SUNARP Core y su suite de autorización tienen sintaxis válida', () => {
  assert.doesNotThrow(() => new vm.Script(coreSource));
  assert.doesNotThrow(() => new vm.Script(testsSource));
});

test('el contrato único de autorización supera todas las pruebas unitarias', () => {
  const sandbox = vm.createContext({
    console: {
      log: () => {}
    }
  });

  vm.runInContext(
    coreSource + '\n' + testsSource,
    sandbox,
    { filename: 'SUNARP-Core-Authorization' }
  );

  const result = sandbox.runAuthorizationSelfTests_();

  assert.equal(result.success, true);
  assert.ok(result.total >= 39);
  assert.equal(result.results.length, result.total);
  assert.ok(result.results.every(item => item.startsWith('OK: ')));
});

test('la autorización no contiene resolución de identidad por correo ni rol directo en Usuarios', () => {
  assert.doesNotMatch(coreSource, /correo_institucional/);
  assert.doesNotMatch(coreSource, /userRoleId/);
  assert.doesNotMatch(coreSource, /scopeEmail/);
  assert.match(coreSource, /data\.personaId/);
  assert.match(coreSource, /item\.modulo_id/);
});

test('las comprobaciones de permisos y ámbitos exigen modulo_id', () => {
  assert.match(
    coreSource,
    /function authorizationHasPermission\(context, permissionCode, moduloId\)/
  );
  assert.match(
    coreSource,
    /function authorizationIsRecordInScope\(\s*context,\s*moduloId/
  );
});


test('CoreAuthorization consume tipo_ambito_id y mantiene compatibilidad con datos históricos', () => {
  const sandbox = vm.createContext({ console: { log: () => {} } });
  vm.runInContext(coreSource, sandbox);
  assert.equal(sandbox._coreAuthScopeType_({ tipo_ambito_id: 'SEDE' }), 'SEDE');
  assert.equal(sandbox._coreAuthScopeType_({ tipo_ambito_id: 'ESTRUCTURA_ORG' }), 'ESTRUCTURA_ORG');
  assert.equal(sandbox._coreAuthScopeType_({ tipo_ambito: 'TOTAL' }), 'TOTAL');
});


test('Core deniega TOTAL cuando está combinado con ámbitos específicos', () => {
  const sandbox = vm.createContext({ console: { log: () => {}, warn: () => {} } });
  vm.runInContext(coreSource, sandbox);
  const soleTotal = {
    authenticated: true,
    personaId: 'PER_1',
    moduleAccess: [{
      modulo_id: 'MOD_1',
      scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: '' }]
    }]
  };
  const mixed = {
    authenticated: true,
    personaId: 'PER_1',
    moduleAccess: [{
      modulo_id: 'MOD_1',
      scopes: [
        { tipo_ambito_id: 'TOTAL', referencia_id: '' },
        { tipo_ambito_id: 'SEDE', referencia_id: 'SEDE_1' }
      ]
    }]
  };
  const malformedTotal = {
    authenticated: true,
    personaId: 'PER_1',
    moduleAccess: [{
      modulo_id: 'MOD_1',
      scopes: [{ tipo_ambito_id: 'TOTAL', referencia_id: 'SEDE_1' }]
    }]
  };
  assert.equal(sandbox.authorizationIsRecordInScope(soleTotal, 'MOD_1', {}, []), true);
  assert.equal(sandbox.authorizationIsRecordInScope(mixed, 'MOD_1', {}, []), false);
  assert.equal(sandbox.authorizationIsRecordInScope(malformedTotal, 'MOD_1', {}, []), false);
});

test('el Gestor consume SUNARP Core versión 9 para la autorización optimizada', () => {
  const coreLibrary = appManifest.dependencies.libraries.find(item => item.userSymbol === 'SUNARPCore');
  assert.ok(coreLibrary, 'el manifiesto debe declarar SUNARPCore');
  assert.equal(String(coreLibrary.version), '9');
  assert.equal(coreLibrary.libraryId, '1mDzO7uTarQCKYpS5U7pMv5go0Wh76k3JoIh5GvxWPfU0zoUG7Jfp17tD');
});
