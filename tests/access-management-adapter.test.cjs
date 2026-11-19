const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const corePath = path.join(root, 'Backend/SUNARP Core/CoreAuthorization.js');
const accessPath = path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementService.js');
const directoryPath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryService.js');
const appPath = path.join(root, 'Backend/Gestor de intranet SUNARP/Código.js');
const accessUiPath = path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementScripts.html');
const directoryUiPath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryScripts.html');

const coreSource = fs.readFileSync(corePath, 'utf8');
const accessSource = fs.readFileSync(accessPath, 'utf8');
const directorySource = fs.readFileSync(directoryPath, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');
const accessUiSource = fs.readFileSync(accessUiPath, 'utf8');
const directoryUiSource = fs.readFileSync(directoryUiPath, 'utf8');

function extractInlineScripts(html) {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]);
}

function makeSecurityData(overrides = {}) {
  const modules = [
    { modulo_id: 'MOD_ACCESOS', codigo: 'ACCESOS', nombre: 'Administración de accesos', descripcion: '', active: true },
    { modulo_id: 'MOD_INFO_PERSONAL', codigo: 'INFORMACION_PERSONAL', nombre: 'Información de personal', descripcion: '', active: true }
  ];
  const roles = [
    { rol_id: 'ROL_ADMIN', nombre: 'Administrador', descripcion: '', active: true },
    { rol_id: 'ROL_EDITOR', nombre: 'Editor', descripcion: '', active: true }
  ];
  const adminCodes = [
    'USUARIOS_ADMINISTRAR',
    'ROLES_ADMINISTRAR',
    'PERMISOS_ADMINISTRAR',
    'AMBITOS_ACCESO_ADMINISTRAR'
  ];
  const permissions = adminCodes.map((code, index) => ({
    permiso_id: 'PERM_A' + (index + 1),
    codigo: code,
    modulo_id: 'MOD_ACCESOS',
    operacion: 'ADMINISTRAR',
    descripcion: code,
    active: true
  })).concat([{
    permiso_id: 'PERM_INFO_001',
    codigo: 'INFORMACION_PERSONAL_VER',
    modulo_id: 'MOD_INFO_PERSONAL',
    operacion: 'VER',
    descripcion: 'Ver información de personal',
    active: true
  }]);
  const rolePermissions = adminCodes.map((code, index) => ({
    rol_id: 'ROL_ADMIN',
    permiso_id: 'PERM_A' + (index + 1),
    active: true
  })).concat([{
    rol_id: 'ROL_EDITOR',
    permiso_id: 'PERM_INFO_001',
    active: true
  }]);

  const base = {
    personas: [{
      persona_id: 'PER_117',
      nombres: 'Persona',
      apellidos: 'Prueba',
      correo_institucional: 'prueba@sunarp.gob.pe'
    }],
    usuarios: [{ persona_id: 'PER_117', active: true }],
    modulos: modules,
    roles,
    usuarioRol: [
      { persona_id: 'PER_117', modulo_id: 'MOD_ACCESOS', rol_id: 'ROL_ADMIN', active: true },
      { persona_id: 'PER_117', modulo_id: 'MOD_INFO_PERSONAL', rol_id: 'ROL_EDITOR', active: true }
    ],
    permisos: permissions,
    rolPermiso: rolePermissions,
    ambitosAcceso: [
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_ACCESOS',
        tipo_ambito: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: 'NO',
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INFO_PERSONAL',
        tipo_ambito: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: 'NO',
        active: true
      }
    ]
  };
  return Object.assign(base, overrides);
}

function createAdapterSandbox(data, email = 'prueba@sunarp.gob.pe') {
  const sandbox = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: () => {} },
    getIntranetDataSource: (sourceKey, sheetName, headerRow) => ({ sourceKey, sheetName, headerRow })
  });

  sandbox.SUNARPCore = {
    getCurrentUserEmail: () => email,
    resolveAuthorizationContext: value => sandbox.resolveAuthorizationContext(value),
    authorizationHasPermission: (...args) => sandbox.authorizationHasPermission(...args),
    authorizationIsRecordInScope: (...args) => sandbox.authorizationIsRecordInScope(...args)
  };

  vm.runInContext(
    coreSource + '\n' + accessSource,
    sandbox,
    { filename: 'SUNARP-Core-and-AccessManagementService' }
  );
  sandbox._accessLoadSecurityData_ = () => data;
  sandbox._accessWriteAudit_ = () => null;
  return sandbox;
}

test('los servicios y scripts de interfaz tienen sintaxis válida', () => {
  for (const [label, source] of [
    ['SUNARP Core', coreSource],
    ['AccessManagementService', accessSource],
    ['DirectoryService', directorySource],
    ['Código.js', appSource]
  ]) {
    assert.doesNotThrow(() => new vm.Script(source), label);
  }
  for (const [label, html] of [
    ['AccessManagementScripts', accessUiSource],
    ['DirectoryScripts', directoryUiSource]
  ]) {
    const scripts = extractInlineScripts(html);
    assert.ok(scripts.length > 0, label + ' debe contener JavaScript');
    scripts.forEach(script => assert.doesNotThrow(() => new vm.Script(script), label));
  }
});

test('la identidad de sesión se resuelve en personas y Core recibe persona_id', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const auth = sandbox._accessGetAuthContext_();
  assert.equal(auth.authenticated, true);
  assert.equal(auth.personaId, 'PER_117');
  assert.equal(auth.user.persona_id, 'PER_117');
  assert.equal(auth.user.active, true);
  assert.equal(Object.hasOwn(auth.user, 'correo_institucional'), false);
  assert.equal(Object.hasOwn(auth.user, 'rol_id'), false);
  assert.equal(auth.email, 'prueba@sunarp.gob.pe');
});

test('rechaza correos no registrados y correos duplicados en personas', () => {
  const missing = createAdapterSandbox(makeSecurityData(), 'noexiste@sunarp.gob.pe');
  assert.throws(() => missing._accessGetAuthContext_(), /no está registrado en personas/i);

  const duplicateData = makeSecurityData();
  duplicateData.personas.push({
    persona_id: 'PER_118',
    nombres: 'Otra',
    apellidos: 'Persona',
    correo_institucional: 'prueba@sunarp.gob.pe'
  });
  const duplicate = createAdapterSandbox(duplicateData);
  assert.throws(() => duplicate._accessGetAuthContext_(), /asociado a más de una persona/i);
});

test('el administrador global exige ROL_ADMIN, TOTAL y los cuatro permisos en ACCESOS', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const auth = sandbox._accessGetAuthContext_();
  assert.equal(sandbox._accessIsGlobalAdministrator_(auth), true);
  assert.equal(sandbox._accessHasPermission_(auth, 'INFORMACION_PERSONAL_VER', 'MOD_INFO_PERSONAL'), true);

  const noTotalData = makeSecurityData({
    ambitosAcceso: [{
      persona_id: 'PER_117',
      modulo_id: 'MOD_ACCESOS',
      tipo_ambito: 'SEDE',
      referencia_id: 'SEDE_CENTRAL',
      incluir_descendientes: 'NO',
      active: true
    }]
  });
  const noTotalSandbox = createAdapterSandbox(noTotalData);
  assert.equal(noTotalSandbox._accessIsGlobalAdministrator_(noTotalSandbox._accessGetAuthContext_()), false);

  const incompletePermissions = makeSecurityData({
    rolPermiso: makeSecurityData().rolPermiso.filter(item => item.permiso_id !== 'PERM_A4')
  });
  const incompleteSandbox = createAdapterSandbox(incompletePermissions);
  assert.equal(incompleteSandbox._accessIsGlobalAdministrator_(incompleteSandbox._accessGetAuthContext_()), false);
});

test('ROL_ADMIN asignado únicamente a Información de personal no administra ACCESOS', () => {
  const data = makeSecurityData({
    usuarioRol: [{
      persona_id: 'PER_117',
      modulo_id: 'MOD_INFO_PERSONAL',
      rol_id: 'ROL_ADMIN',
      active: true
    }]
  });
  const sandbox = createAdapterSandbox(data);
  const auth = sandbox._accessGetAuthContext_();
  assert.equal(sandbox._accessIsGlobalAdministrator_(auth), false);
  assert.equal(sandbox._accessHasPermission_(auth, 'USUARIOS_ADMINISTRAR', 'MOD_ACCESOS'), false);
});

test('los permisos administrativos de otro módulo no completan los requisitos de ACCESOS', () => {
  const data = makeSecurityData();
  data.permisos.forEach(permission => {
    if (permission.codigo.endsWith('_ADMINISTRAR')) {
      permission.modulo_id = 'MOD_INFO_PERSONAL';
    }
  });
  const sandbox = createAdapterSandbox(data);
  const auth = sandbox._accessGetAuthContext_();
  assert.equal(sandbox._accessIsGlobalAdministrator_(auth), false);
  assert.equal(sandbox._accessHasPermission_(auth, 'USUARIOS_ADMINISTRAR', 'MOD_ACCESOS'), false);
});

test('el contador de administradores globales ignora cuentas, roles o ámbitos incompletos', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const data = makeSecurityData();
  assert.equal(sandbox._accessCountAdministrators_(data), 1);

  const noTotal = makeSecurityData({
    ambitosAcceso: data.ambitosAcceso.filter(scope => scope.modulo_id !== 'MOD_ACCESOS')
  });
  assert.equal(sandbox._accessCountAdministrators_(noTotal), 0);

  const inactiveUser = makeSecurityData({
    usuarios: [{ persona_id: 'PER_117', active: false }]
  });
  assert.equal(sandbox._accessCountAdministrators_(inactiveUser), 0);

  const nonAdminRole = makeSecurityData({
    usuarioRol: data.usuarioRol.map(item => item.modulo_id === 'MOD_ACCESOS'
      ? Object.assign({}, item, { rol_id: 'ROL_EDITOR' })
      : item
    )
  });
  assert.equal(sandbox._accessCountAdministrators_(nonAdminRole), 0);
});

test('la validación del snapshot rechaza dos roles activos de la misma persona y módulo', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const data = makeSecurityData();
  data.usuarioRol.push({
    persona_id: 'PER_117',
    modulo_id: 'MOD_ACCESOS',
    rol_id: 'ROL_EDITOR',
    active: true
  });
  assert.throws(() => sandbox._accessValidateSnapshot_(data), /más de un rol activo/i);
});

test('el contrato del Gestor no busca usuarios por correo ni lee rol_id desde Usuarios', () => {
  assert.match(accessSource, /person\.correo_institucional/);
  assert.match(accessSource, /resolveAuthorizationContext\(\s*\{\s*personaId,/);
  assert.match(accessSource, /userRoles:\s*data\.usuarioRol/);
  assert.doesNotMatch(accessSource, /user\.rol_id/);
  assert.doesNotMatch(accessSource, /users:\s*Object\.freeze\(\[[^\]]*correo_institucional/);
  assert.doesNotMatch(accessSource, /scopeEmail|scopeEmailField/);
});

test('Directorio exige modulo_id explícito y pasa local_id para ámbitos LOCAL', () => {
  assert.match(directorySource, /requirePermission_\(\s*permissionCode[^;]+MOD_INFO_PERSONAL/s);
  assert.match(directorySource, /_accessRecordIsAllowed_\(authorization\.auth, 'MOD_INFO_PERSONAL',\s*\{\s*estructura_id:[^}]*local_id:/s);
  assert.match(directorySource, /{ sede_id: _directoryKey_\(local\.sede_id\), local_id: _directoryKey_\(local\.id\) }/);
});

test('la interfaz administra roles y ámbitos mediante persona_id y modulo_id', () => {
  assert.match(accessUiSource, /id:\s*'userRoles'/);
  assert.match(accessUiSource, /rpc\('saveAccessUserRole',\s*\{\s*persona_id:/s);
  assert.match(accessUiSource, /rpc\('saveAccessScopes',\s*\{\s*persona_id:[\s\S]*?modulo_id:/s);
  assert.match(accessUiSource, /value:\s*'LOCAL'/);
  assert.doesNotMatch(accessUiSource, /row\.estado|item\.estado|correo_original|estructura_org_id/);
});
