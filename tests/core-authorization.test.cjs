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

test('Core separa la resolución genérica de identidad del motor de permisos y ámbitos', () => {
  assert.match(coreSource, /function resolveIdentity\(source, email, options\)/);
  const authorizationEngine = coreSource.slice(coreSource.indexOf('function _coreAuthText_'));
  assert.doesNotMatch(authorizationEngine, /correo_institucional/);
  assert.doesNotMatch(authorizationEngine, /userRoleId/);
  assert.doesNotMatch(authorizationEngine, /scopeEmail/);
  assert.match(authorizationEngine, /data\.personaId/);
  assert.match(authorizationEngine, /item\.modulo_id/);
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


test('resolveIdentity usa campos declarados y compara el correo sin distinguir mayúsculas', () => {
  let lookup = null;
  const sandbox = vm.createContext({
    findRecordsByFields: (source, filters, options) => {
      lookup = { source, filters, options };
      return {
        records: [
          { persona_id: 'PER_001', correo_institucional: 'ANA@SUNARP.GOB.PE' },
          { persona_id: '', correo_institucional: 'ana@sunarp.gob.pe' }
        ],
        total: 2
      };
    }
  });
  vm.runInContext(coreSource, sandbox);
  const result = sandbox.resolveIdentity(
    { spreadsheetId: 'DIRECTORY', sheetName: 'personas' },
    'ana@sunarp.gob.pe',
    {
      emailField: 'correo_institucional',
      idField: 'persona_id',
      requiredHeaders: ['nombres', 'apellidos'],
      projectionFields: ['nombres', 'apellidos']
    }
  );
  assert.equal(result.total, 1);
  assert.equal(result.records[0].persona_id, 'PER_001');
  assert.equal(lookup.filters.correo_institucional, 'ana@sunarp.gob.pe');
  assert.equal(lookup.options.matchCase, false);
  assert.ok(lookup.options.requiredHeaders.includes('persona_id'));
  assert.equal(
    lookup.options.projectionFields.join(','),
    'nombres,apellidos,correo_institucional,persona_id'
  );
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

test('el Gestor consume SUNARP Core versión 11 para la autorización optimizada', () => {
  const coreLibrary = appManifest.dependencies.libraries.find(item => item.userSymbol === 'SUNARPCore');
  assert.ok(coreLibrary, 'el manifiesto debe declarar SUNARPCore');
  assert.equal(String(coreLibrary.version), '11');
  assert.equal(coreLibrary.libraryId, '1mDzO7uTarQCKYpS5U7pMv5go0Wh76k3JoIh5GvxWPfU0zoUG7Jfp17tD');
});
