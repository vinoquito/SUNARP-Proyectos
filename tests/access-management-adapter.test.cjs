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
  assert.throws(() => missing._accessGetAuthContext_(), /no tiene un correo institucional registrado en el directorio/i);

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

test('AUDITORIA_VER es independiente y no concede administración de accesos', () => {
  const base = makeSecurityData();
  const data = makeSecurityData({
    permisos: base.permisos.concat([{
      permiso_id: 'PERM_AUDIT',
      codigo: 'AUDITORIA_VER',
      modulo_id: 'MOD_ACCESOS',
      operacion: 'VER',
      descripcion: 'Consultar auditoría',
      active: true
    }]),
    usuarioRol: [{
      persona_id: 'PER_117',
      modulo_id: 'MOD_ACCESOS',
      rol_id: 'ROL_EDITOR',
      active: true
    }],
    rolPermiso: base.rolPermiso.concat([
      ...base.rolPermiso
        .filter(item => item.rol_id === 'ROL_ADMIN')
        .map(item => ({ rol_id: 'ROL_EDITOR', permiso_id: item.permiso_id, active: true })),
      { rol_id: 'ROL_EDITOR', permiso_id: 'PERM_AUDIT', active: true }
    ]),
    ambitosAcceso: [{
      persona_id: 'PER_117',
      modulo_id: 'MOD_ACCESOS',
      tipo_ambito: 'SEDE',
      referencia_id: 'SEDE_CENTRAL',
      incluir_descendientes: 'NO',
      active: true
    }]
  });

  const sandbox = createAdapterSandbox(data);
  const auth = sandbox._accessGetAuthContext_();

  assert.equal(sandbox._accessIsGlobalAdministrator_(auth), false);
  assert.equal(sandbox._accessRequirePermission_('AUDITORIA_VER').personaId, 'PER_117');
  assert.throws(
    () => sandbox._accessRequirePermission_('USUARIOS_ADMINISTRAR'),
    /requiere ROL_ADMIN y ámbito TOTAL/i
  );

  const view = sandbox.getAccessManagementData();
  assert.equal(view.capabilities.audit, true);
  assert.equal(view.capabilities.users, false);
  assert.equal(view.users.length, 0);
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
  assert.match(directorySource, /const moduleId = 'MOD_INFO_PERSONAL';[\s\S]*?requirePermission_\([\s\S]*?permissionCode \|\| 'INFORMACION_PERSONAL_VER',[\s\S]*?moduleId/s);
  assert.match(directorySource, /_accessRecordIsAllowed_\(authorization\.auth, 'MOD_INFO_PERSONAL',\s*\{\s*estructura_id:[^}]*local_id:/s);
  assert.match(directorySource, /{ sede_id: _directoryKey_\(local\.sede_id\), local_id: _directoryKey_\(local\.id\) }/);
});

test('la interfaz administra roles y ámbitos mediante persona_id y modulo_id', () => {
  assert.match(accessUiSource, /capabilities\.userRoles/);
  assert.match(accessUiSource, /rpc\('saveAccessUserConfiguration',\s*\{/s);
  assert.match(accessUiSource, /ambitos:\s*\(item\.ambitos \|\| \[\]\)\.map/);
  assert.match(accessUiSource, /value:\s*'LOCAL'/);
  assert.match(appSource, /_accessIsGlobalAdministrator_\(auth\)\s*\|\|\s*hasPermission_\(auth, 'AUDITORIA_VER'\)/);
  assert.doesNotMatch(accessUiSource, /row\.estado|item\.estado|correo_original|estructura_org_id/);
});

test('Agregar acceso incorpora directamente el ámbito seleccionado sin acción intermedia', () => {
  assert.doesNotMatch(accessUiSource, /Agregar ámbito|function addScope\(\)/);
  assert.match(accessUiSource, /Selecciona un ámbito \(opcional\)/);
  assert.match(accessUiSource, /let collectScopes = \(\) =>/);
  assert.match(accessUiSource, /collectScopes = function \(\)/);
  assert.match(accessUiSource, /nextScopes\.push\(\{[\s\S]*?tipo_ambito: type,[\s\S]*?referencia_id: referenceId/);
  assert.match(accessUiSource, /const scopeResult = collectScopes\(\);/);
  assert.match(accessUiSource, /ambitos: scopeResult\.scopes/);
  assert.match(accessUiSource, /editorHost\.replaceChildren\(\);[\s\S]*?refreshModulePicker\(\);[\s\S]*?renderTable\(\);/);

  const confirmStart = accessUiSource.indexOf('const confirmButton = createButton(');
  const confirmEnd = accessUiSource.indexOf('actions.append(cancelButton, confirmButton)', confirmStart);
  const confirmHandler = accessUiSource.slice(confirmStart, confirmEnd);
  assert.ok(confirmStart >= 0 && confirmEnd > confirmStart);
  assert.doesNotMatch(
    confirmHandler,
    /(?:scopeType|selectedReferenceId|descendants|scopeContextHost)/,
    'el manejador no debe acceder a variables locales del bloque canManageScopes'
  );
});

test('la cascada de ámbitos parte del local y recorre solo la jerarquía vinculada', () => {
  const start = accessUiSource.indexOf('function structureHierarchyForLocal(localId)');
  const end = accessUiSource.indexOf('function structureTypeName(structure)', start);
  assert.ok(start >= 0 && end > start, 'debe existir el resolver de jerarquía por local');

  const helpers = accessUiSource.slice(start, end);
  const sandbox = vm.createContext({
    catalogs: {
      estructuraOrg: [
        { id: 'U1', name: 'Unidad 1', parent_id: '', order: 1 },
        { id: 'S1', name: 'Subunidad 1', parent_id: 'U1', order: 1 },
        { id: 'A1', name: 'Área 1', parent_id: 'S1', order: 1 },
        { id: 'U2', name: 'Unidad 2', parent_id: '', order: 2 },
        { id: 'OUT', name: 'Unidad de otro local', parent_id: '' }
      ],
      estructuraLocal: [
        { id: 'REL1', estructura_id: 'U1', local_id: 'LOC1' },
        { id: 'REL2', estructura_id: 'S1', local_id: 'LOC1' },
        { id: 'REL3', estructura_id: 'A1', local_id: 'LOC1' },
        { id: 'REL4', estructura_id: 'U2', local_id: 'LOC1' },
        { id: 'REL5', estructura_id: 'OUT', local_id: 'LOC2' }
      ]
    }
  });

  vm.runInContext(
    helpers + '\nthis.structureHierarchyForLocal = structureHierarchyForLocal;',
    sandbox
  );

  const hierarchy = sandbox.structureHierarchyForLocal('LOC1');
  assert.deepEqual(Array.from(hierarchy.roots, item => item.id), ['U1', 'U2']);
  assert.deepEqual(
    Array.from(hierarchy.structures.filter(item => item.parent_id === 'U1'), item => item.id),
    ['S1']
  );
  assert.deepEqual(
    Array.from(hierarchy.structures.filter(item => item.parent_id === 'S1'), item => item.id),
    ['A1']
  );

  const otherLocal = sandbox.structureHierarchyForLocal('LOC2');
  assert.deepEqual(Array.from(otherLocal.roots, item => item.id), ['OUT']);

  assert.match(accessUiSource, /type === 'ESTRUCTURA_ORG' \|\| type === 'LOCAL'/);
  assert.match(accessUiSource, /String\(item\.parent_id \|\| ''\) === String\(selectedId\)/);
  assert.match(accessUiSource, /selectedReferenceId = type === 'LOCAL' \? localId : ''/);
  assert.match(accessUiSource, /sedeName\(item\.sede_id\) \+ ' — ' \+ item\.name/);
  assert.doesNotMatch(accessUiSource, /function structuresForSede\(sedeId\)/);
});


test('los identificadores de roles y permisos se normalizan y autogeneran', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const generated = vm.runInContext(`({
    token: _accessIdentifierToken_('Gestión de usuarios'),
    roleId: _accessGenerateUniqueIdentifier_('ROL_', 'Gestión de usuarios', [], 'rol_id', 50),
    collisionId: _accessGenerateUniqueIdentifier_('ROL_', 'Editor', [{ rol_id: 'ROL_EDITOR' }], 'rol_id', 50),
    permissionCode: _accessBuildPermissionCode_('INFORMACION_PERSONAL', 'VER')
  })`, sandbox);

  assert.equal(generated.token, 'GESTION_DE_USUARIOS');
  assert.equal(generated.roleId, 'ROL_GESTION_DE_USUARIOS');
  assert.equal(generated.collisionId, 'ROL_EDITOR_2');
  assert.equal(generated.permissionCode, 'INFORMACION_PERSONAL_VER');
  assert.match(accessSource, /const ACCESS_PERMISSION_OPERATIONS = Object\.freeze\(\[/);
});

test('el listado de usuarios se consulta solo con filtro de sede o rol', () => {
  assert.match(accessSource, /users:\s*\[\]/);
  assert.match(accessSource, /function getAccessUsers\(filters\)/);
  assert.match(accessSource, /if \(!sedeId && !roleId\) return \{ items: \[\], total: 0 \}/);
  assert.match(accessUiSource, /createField\('Sede', siteSelect\)/);
  assert.match(accessUiSource, /createField\('Rol', roleSelect\)/);
  assert.match(accessUiSource, /rpc\('getAccessUsers'/);
  assert.match(accessUiSource, /searchPlaceholder: 'Buscar por nombre o correo institucional/);
  assert.match(accessUiSource, /state\.table\.setData\(state\.data\.users\)/);
});

test('los formularios de rol y permiso no permiten ingresar IDs, códigos ni estados manualmente', () => {
  const roleStart = accessUiSource.indexOf('function openRoleModal(row)');
  const roleEnd = accessUiSource.indexOf('function renderPermissions(host)', roleStart);
  const roleForm = accessUiSource.slice(roleStart, roleEnd);
  assert.match(roleForm, /previewIdentifier\('ROL_'/);
  assert.doesNotMatch(roleForm, /createField\('Estado'/);

  const permissionStart = accessUiSource.indexOf('function openPermissionModal(row)');
  const permissionEnd = accessUiSource.indexOf('function renderAssignments(host)', permissionStart);
  const permissionForm = accessUiSource.slice(permissionStart, permissionEnd);
  assert.match(permissionForm, /previewPermissionCode\(/);
  assert.match(permissionForm, /createSelect\(\s*operationOptions/);
  assert.doesNotMatch(permissionForm, /createField\('Estado'/);
  assert.match(permissionForm, /readOnly: true/);
});

test('la administración incluye filtro de módulo, catálogo de operaciones y selección masiva por bloque', () => {
  assert.match(accessUiSource, /key: 'modulo_id',[\s\S]*?label: 'Módulo'/);
  assert.match(accessUiSource, /function renderOperations\(host\)/);
  assert.match(accessUiSource, /operations: renderOperations/);
  assert.match(accessUiSource, /Seleccionar todo el bloque/);
  assert.match(accessUiSource, /groupToggle\.indeterminate/);
  assert.match(accessUiSource, /groupToggle\.checked = checkboxes\.length > 0/);
});

test('las actualizaciones se ejecutan por pestaña y usan el loader translúcido', () => {
  assert.match(accessUiSource, /function refreshCurrentTabData\(showNotification\)/);
  assert.match(accessUiSource, /getAccessManagementTabData', 'roles'/);
  assert.match(accessUiSource, /getAccessManagementTabData', 'permissions'/);
  assert.match(accessUiSource, /getAccessManagementTabData', 'assignments'/);
  assert.match(accessUiSource, /state\.table\.refresh\(\)/);
  assert.match(accessUiSource, /backdrop: 'translucent'/);
  assert.doesNotMatch(accessUiSource, /accessRefreshButton/);
});
