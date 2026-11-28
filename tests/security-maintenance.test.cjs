'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const accessSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementService.js'),
  'utf8'
);
const securitySource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/SecurityMaintenanceService.js'),
  'utf8'
);
const securityUiSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/SecurityMaintenanceScripts.html'),
  'utf8'
);
const accessUiSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementScripts.html'),
  'utf8'
);
const coreSource = fs.readFileSync(
  path.join(root, 'Backend/SUNARP Core/CoreAuthorization.js'),
  'utf8'
);
const navigationSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/Código.js'),
  'utf8'
);
const maintenanceViewSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/ViewMantenimientos.html'),
  'utf8'
);
const indexSource = fs.readFileSync(
  path.join(root, 'Backend/Gestor de intranet SUNARP/Index.html'),
  'utf8'
);

const scopeTypes = [
  { tipo_ambito_id: 'TOTAL', nombre: 'Total', descripcion: 'Global', entidad_referencia: 'NINGUNA', requiere_referencia: 'NO', permite_descendientes: 'NO', active: true },
  { tipo_ambito_id: 'SEDE', nombre: 'Sede', descripcion: 'Sede', entidad_referencia: 'SEDE', requiere_referencia: 'SI', permite_descendientes: 'NO', active: true },
  { tipo_ambito_id: 'ESTRUCTURA_ORG', nombre: 'Estructura orgánica', descripcion: 'Estructura', entidad_referencia: 'ESTRUCTURA_ORG', requiere_referencia: 'SI', permite_descendientes: 'SI', active: true },
  { tipo_ambito_id: 'LOCAL', nombre: 'Local', descripcion: 'Local', entidad_referencia: 'LOCAL', requiere_referencia: 'SI', permite_descendientes: 'NO', active: true }
];

function makeSandbox(options = {}) {
  const tables = {
    Roles: (options.Roles || [
      { rol_id: 'ROL_ADMIN', nombre: 'Administrador', descripcion: 'Administrador global', active: true },
      { rol_id: 'ROL_EDITOR', nombre: 'Editor', descripcion: 'Editor', active: true }
    ]).map(item => ({ ...item })),
    Modulos: (options.Modulos || [
      { modulo_id: 'MOD_ACCESOS', codigo: 'ACCESOS', nombre: 'Accesos', descripcion: '', active: true },
      { modulo_id: 'MOD_INFO_PERSONAL', codigo: 'INFORMACION_PERSONAL', nombre: 'Información de personal', descripcion: '', active: true }
    ]).map(item => ({ ...item })),
    TiposAmbito: (options.TiposAmbito || scopeTypes).map(item => ({ ...item })),
    Operaciones: (options.Operaciones || [
      { operacion_id: 'VER', nombre: 'Ver' },
      { operacion_id: 'CREAR', nombre: 'Crear' },
      { operacion_id: 'EDITAR', nombre: 'Editar' },
      { operacion_id: 'CAMBIAR_ESTADO', nombre: 'Cambiar estado' },
      { operacion_id: 'PUBLICAR', nombre: 'Publicar' },
      { operacion_id: 'ELIMINAR', nombre: 'Eliminar' },
      { operacion_id: 'ADMINISTRAR', nombre: 'Administrar' }
    ]).map(item => ({ ...item })),
    UsuarioRol: (options.UsuarioRol || []).map(item => ({ ...item })),
    RolPermiso: (options.RolPermiso || []).map(item => ({ ...item })),
    Permisos: (options.Permisos || []).map(item => ({ ...item })),
    AmbitosAcceso: (options.AmbitosAcceso || []).map(item => ({ ...item }))
  };
  const reads = [];
  const writes = [];
  const audit = [];
  const deniedAudit = [];
  let isAdmin = options.isAdmin !== false;
  const auth = { authenticated: true, personaId: 'PER_ADMIN', email: 'admin@sunarp.gob.pe', name: 'Administrador' };

  const source = (sheetName) => ({ sourceKey: 'SECURITY', sheetName });
  const clone = values => (values || []).map(item => ({ ...item }));
  const SUNARPCore = {
    getOrBuildCachedValue(key, sources, builder) {
      const value = builder();
      return { value, cacheHit: false, cacheStored: true };
    },
    listRecordsFromSourcesCached(requests) {
      reads.push(requests.map(item => item.source.sheetName));
      return requests.reduce((result, request) => {
        result[request.key] = clone(tables[request.source.sheetName]);
        return result;
      }, {});
    },
    insertRecord(target, record, config = {}) {
      const rows = tables[target.sheetName];
      if (rows.some(item => String(item[config.idField]) === String(record[config.idField]))) {
        throw new Error('Identificador duplicado.');
      }
      for (const field of config.uniqueFields || []) {
        if (rows.some(item => String(item[field]).toLowerCase() === String(record[field]).toLowerCase())) {
          throw new Error('Duplicidad en campo único: ' + field);
        }
      }
      rows.push({ ...record });
      writes.push({ action: 'insert', sheet: target.sheetName, record: { ...record } });
      return { success: true, message: 'insertado', record: { ...record } };
    },
    updateRecord(target, idField, id, updates, config = {}) {
      const rows = tables[target.sheetName];
      const index = rows.findIndex(item => String(item[idField]) === String(id));
      if (index < 0) throw new Error('No existe el registro.');
      const candidate = { ...rows[index], ...updates };
      for (const field of config.uniqueFields || []) {
        if (rows.some((item, i) => i !== index && String(item[field]).toLowerCase() === String(candidate[field]).toLowerCase())) {
          throw new Error('Duplicidad en campo único: ' + field);
        }
      }
      rows[index] = candidate;
      writes.push({ action: 'update', sheet: target.sheetName, record: { ...candidate } });
      return { success: true, record: { ...candidate } };
    },
    setRecordStatus(target, idField, id, statusField, value) {
      const row = tables[target.sheetName].find(item => String(item[idField]) === String(id));
      if (!row) throw new Error('No existe el registro.');
      row[statusField] = value;
      writes.push({ action: 'status', sheet: target.sheetName, record: { ...row } });
      return { success: true };
    },
    deleteRecord(target, idField, id) {
      const rows = tables[target.sheetName];
      const index = rows.findIndex(item => String(item[idField]) === String(id));
      if (index < 0) throw new Error('No existe el registro.');
      rows.splice(index, 1);
      writes.push({ action: 'delete', sheet: target.sheetName, id });
      return { success: true, message: 'eliminado' };
    }
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    getIntranetDataSource(sourceKey, sheetName, headerRow) {
      assert.equal(sourceKey, 'SECURITY');
      assert.equal(headerRow, 1);
      return source(sheetName);
    },
    SUNARPCore
  };
  vm.createContext(sandbox);
  vm.runInContext(accessSource, sandbox, { filename: 'AccessManagementService.js' });
  sandbox._accessGetAuthContext_ = () => auth;
  sandbox._accessIsGlobalAdministrator_ = () => isAdmin;
  sandbox._accessWriteAudit_ = (actor, event) => { deniedAudit.push({ ...event }); return true; };
  sandbox._accessRunAudited_ = (actor, event, callback) => {
    audit.push({ ...event });
    const outcome = callback();
    return outcome && Object.prototype.hasOwnProperty.call(outcome, 'value')
      ? outcome.value
      : outcome;
  };
  vm.runInContext(securitySource, sandbox, { filename: 'SecurityMaintenanceService.js' });
  return {
    sandbox, tables, reads, writes, audit, deniedAudit, auth,
    setAdmin(value) { isAdmin = value; }
  };
}

test('carga los cuatro catálogos desde SECURITY en una sola consulta agrupada y respeta sus encabezados', () => {
  const fixture = makeSandbox();
  const data = fixture.sandbox.getSecurityMaintenanceData();
  assert.equal(fixture.reads.length, 1);
  assert.equal(fixture.reads[0].join(','), 'Roles,Modulos,TiposAmbito,Operaciones');
  assert.deepEqual(Object.keys(data), ['roles', 'modules', 'scopeTypes', 'operations', 'capabilities']);
  assert.deepEqual(Object.keys(data.operations[0]), ['operacion_id', 'nombre']);
  assert.equal(data.operations.some(row => 'active' in row || 'descripcion' in row), false);
  assert.deepEqual(Object.keys(data.roles[0]), ['rol_id', 'nombre', 'descripcion', 'active']);
  assert.deepEqual(Object.keys(data.modules[0]), ['modulo_id', 'codigo', 'nombre', 'descripcion', 'active']);
  assert.deepEqual(Object.keys(data.scopeTypes[0]), [
    'tipo_ambito_id', 'nombre', 'descripcion', 'entidad_referencia',
    'requiere_referencia', 'permite_descendientes', 'active'
  ]);
});

test('ejecuta altas, ediciones y eliminaciones CRUD para Roles, Módulos, Tipos de ámbito y Operaciones', () => {
  const fixture = makeSandbox();
  const api = fixture.sandbox;

  const role = api.saveSecurityCatalogRecord({
    entity: 'roles', action: 'create', nombre: 'Supervisor regional', descripcion: 'Rol de prueba'
  });
  assert.equal(role.id, 'ROL_SUPERVISOR_REGIONAL');
  assert.equal(role.record.active, true);
  const editedRole = api.saveSecurityCatalogRecord({
    entity: 'roles', action: 'edit', id: role.id, nombre: 'Supervisor territorial', descripcion: 'Editado'
  });
  assert.equal(editedRole.record.rol_id, role.id);
  assert.equal(api.deleteSecurityCatalogRecord('roles', role.id).success, true);

  const module = api.saveSecurityCatalogRecord({
    entity: 'modules', action: 'create', codigo: 'PLANIFICACION', nombre: 'Planificación', descripcion: 'Módulo de prueba'
  });
  assert.equal(module.id, 'MOD_PLANIFICACION');
  assert.equal(module.record.codigo, 'PLANIFICACION');
  assert.equal(module.record.active, true);
  const editedModule = api.saveSecurityCatalogRecord({
    entity: 'modules', action: 'edit', id: module.id, codigo: 'PLANIFICACION', nombre: 'Planeamiento', descripcion: 'Editado'
  });
  assert.equal(editedModule.record.modulo_id, module.id);
  assert.equal(editedModule.record.codigo, 'PLANIFICACION');
  api.deleteSecurityCatalogRecord('modules', module.id);

  const scope = api.saveSecurityCatalogRecord({
    entity: 'scopeTypes', action: 'create', nombre: 'Regional', descripcion: 'Ámbito por sede',
    entidad_referencia: 'SEDE', permite_descendientes: false
  });
  assert.equal(scope.id, 'TIPO_AMBITO_REGIONAL');
  assert.equal(scope.record.entidad_referencia, 'SEDE');
  assert.equal(scope.record.requiere_referencia, 'SI');
  assert.equal(scope.record.permite_descendientes, 'NO');
  const editedScope = api.saveSecurityCatalogRecord({
    entity: 'scopeTypes', action: 'edit', id: scope.id, nombre: 'Regional editado', descripcion: 'Editado'
  });
  assert.equal(editedScope.record.tipo_ambito_id, scope.id);
  assert.equal(editedScope.record.entidad_referencia, 'SEDE');
  api.deleteSecurityCatalogRecord('scopeTypes', scope.id);

  const operation = api.saveSecurityCatalogRecord({
    entity: 'operations', action: 'create', nombre: 'Exportar'
  });
  assert.equal(operation.id, 'EXPORTAR');
  const editedOperation = api.saveSecurityCatalogRecord({
    entity: 'operations', action: 'edit', id: operation.id, nombre: 'Exportación'
  });
  assert.equal(editedOperation.record.operacion_id, operation.id);
  assert.deepEqual(Object.keys(editedOperation.record), ['operacion_id', 'nombre']);
  api.deleteSecurityCatalogRecord('operations', operation.id);

  assert.equal(fixture.writes.length, 12);
  assert.equal(fixture.audit.length, 12);
  assert.equal(fixture.tables.Roles.some(row => row.rol_id === 'ROL_ADMIN'), true);
});

test('rechaza nombres, códigos e identificadores duplicados y conserva IDs al editar', () => {
  const fixture = makeSandbox();
  const api = fixture.sandbox;
  assert.throws(() => api.saveSecurityCatalogRecord({
    entity: 'roles', action: 'create', nombre: 'editor'
  }), /nombre/i);
  assert.throws(() => api.saveSecurityCatalogRecord({
    entity: 'modules', action: 'create', codigo: 'ACCESOS', nombre: 'Otro módulo'
  }), /código/i);
  assert.throws(() => api.saveSecurityCatalogRecord({
    entity: 'operations', action: 'create', nombre: 'ver'
  }), /nombre/i);
  const role = api.saveSecurityCatalogRecord({ entity: 'roles', action: 'create', nombre: 'Coordinador' });
  assert.throws(() => api.saveSecurityCatalogRecord({
    entity: 'roles', action: 'edit', id: role.id, nombre: 'Editor'
  }), /nombre/i);
  assert.equal(fixture.writes.length, 1);
});

test('rechaza eliminar catálogos con referencias operativas aunque la relación esté inactiva', () => {
  const fixture = makeSandbox();
  const api = fixture.sandbox;
  const role = api.saveSecurityCatalogRecord({ entity: 'roles', action: 'create', nombre: 'Revisor' });
  fixture.tables.UsuarioRol.push({ persona_id: 'PER_X', modulo_id: 'MOD_INFO_PERSONAL', rol_id: role.id, active: false });
  assert.throws(() => api.deleteSecurityCatalogRecord('roles', role.id), /referencias/i);

  const module = api.saveSecurityCatalogRecord({ entity: 'modules', action: 'create', codigo: 'PRESUPUESTO', nombre: 'Presupuesto' });
  fixture.tables.Permisos.push({ permiso_id: 'P_X', codigo: 'PRESUPUESTO_VER', modulo_id: module.id, operacion_id: 'VER', active: false });
  assert.throws(() => api.deleteSecurityCatalogRecord('modules', module.id), /referencias/i);

  const scope = api.saveSecurityCatalogRecord({
    entity: 'scopeTypes', action: 'create', nombre: 'Por oficina', entidad_referencia: 'ESTRUCTURA_ORG'
  });
  fixture.tables.AmbitosAcceso.push({ persona_id: 'PER_X', modulo_id: 'MOD_INFO_PERSONAL', tipo_ambito_id: scope.id, referencia_id: 'ORG_X', active: false });
  assert.throws(() => api.deleteSecurityCatalogRecord('scopeTypes', scope.id), /referencias/i);

  const operation = api.saveSecurityCatalogRecord({ entity: 'operations', action: 'create', nombre: 'Consultar historial' });
  fixture.tables.Permisos.push({ permiso_id: 'P_Y', codigo: 'TEST', modulo_id: 'MOD_INFO_PERSONAL', operacion_id: operation.id, active: false });
  assert.throws(() => api.deleteSecurityCatalogRecord('operations', operation.id), /referencias/i);
});

test('protege los elementos esenciales y evita desactivar ROL_ADMIN o módulos y tipos críticos', () => {
  const fixture = makeSandbox();
  const api = fixture.sandbox;
  assert.throws(() => api.setSecurityCatalogStatus('roles', 'ROL_ADMIN', false), /esencial/i);
  assert.throws(() => api.deleteSecurityCatalogRecord('roles', 'ROL_ADMIN'), /esencial/i);
  assert.throws(() => api.setSecurityCatalogStatus('modules', 'MOD_ACCESOS', false), /esencial/i);
  assert.throws(() => api.deleteSecurityCatalogRecord('modules', 'MOD_ACCESOS'), /esencial/i);
  assert.throws(() => api.setSecurityCatalogStatus('scopeTypes', 'TOTAL', false), /esencial/i);
  assert.throws(() => api.deleteSecurityCatalogRecord('scopeTypes', 'TOTAL'), /esencial/i);
  assert.throws(() => api.deleteSecurityCatalogRecord('operations', 'ADMINISTRAR'), /esencial/i);
  assert.throws(() => api.setSecurityCatalogStatus('operations', 'VER', false), /no tiene columna active/i);
  assert.equal(fixture.writes.length, 0);
});

test('requiere administrador global para leer y mutar; no usa el permiso de Mantenimientos', () => {
  const fixture = makeSandbox({ isAdmin: false });
  const api = fixture.sandbox;
  assert.throws(() => api.getSecurityMaintenanceData(), /administrador global/i);
  assert.throws(() => api.saveSecurityCatalogRecord({
    entity: 'roles', action: 'create', nombre: 'No autorizado'
  }), /administrador global/i);
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.deniedAudit.length, 2);
});

test('solo admite tipos de ámbito adicionales con semánticas seguras conocidas', () => {
  const fixture = makeSandbox({
    TiposAmbito: scopeTypes.concat([{
      tipo_ambito_id: 'REGIONAL', nombre: 'Regional', descripcion: '',
      entidad_referencia: 'SEDE', requiere_referencia: 'SI',
      permite_descendientes: 'NO', active: true
    }])
  });
  assert.doesNotThrow(() => fixture.sandbox.getSecurityMaintenanceData());

  const invalid = makeSandbox({
    TiposAmbito: scopeTypes.concat([{
      tipo_ambito_id: 'PERSONA', nombre: 'Persona', descripcion: '',
      entidad_referencia: 'PERSONA', requiere_referencia: 'SI',
      permite_descendientes: 'NO', active: true
    }])
  });
  assert.throws(() => invalid.sandbox.getSecurityMaintenanceData(), /SUNARP Core/i);
});

test('Core resuelve IDs dinámicos solo cuando entidad_referencia pertenece a su evaluador', () => {
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(coreSource, sandbox, { filename: 'CoreAuthorization.js' });
  const context = sandbox.resolveAuthorizationContext({
    personaId: 'PER_TEST',
    users: [{ persona_id: 'PER_TEST', active: true }],
    modules: [{ modulo_id: 'MOD_TEST', codigo: 'TEST', active: true }],
    roles: [{ rol_id: 'ROL_TEST', active: true }],
    userRoles: [{ persona_id: 'PER_TEST', modulo_id: 'MOD_TEST', rol_id: 'ROL_TEST', active: true }],
    permissions: [],
    rolePermissions: [],
    scopes: [{
      persona_id: 'PER_TEST', modulo_id: 'MOD_TEST', tipo_ambito_id: 'REGIONAL',
      entidad_referencia: 'ESTRUCTURA_ORG', referencia_id: 'ORG_ROOT',
      incluir_descendientes: true, active: true
    }]
  });
  const structures = [
    { id: 'ORG_ROOT', parent_id: '', sede_id: 'SEDE_A', active: true },
    { id: 'ORG_CHILD', parent_id: 'ORG_ROOT', sede_id: 'SEDE_A', active: true }
  ];
  assert.equal(sandbox.authorizationIsRecordInScope(context, 'MOD_TEST', { estructura_id: 'ORG_CHILD' }, structures), true);

  const unknown = sandbox.resolveAuthorizationContext({
    personaId: 'PER_TEST',
    users: [{ persona_id: 'PER_TEST', active: true }],
    modules: [{ modulo_id: 'MOD_TEST', codigo: 'TEST', active: true }],
    roles: [{ rol_id: 'ROL_TEST', active: true }],
    userRoles: [{ persona_id: 'PER_TEST', modulo_id: 'MOD_TEST', rol_id: 'ROL_TEST', active: true }],
    permissions: [],
    rolePermissions: [],
    scopes: [{
      persona_id: 'PER_TEST', modulo_id: 'MOD_TEST', tipo_ambito_id: 'TOTAL',
      entidad_referencia: 'PERSONA', referencia_id: 'PER_OTHER', active: true
    }]
  });
  assert.equal(sandbox.authorizationIsRecordInScope(unknown, 'MOD_TEST', {}, []), false);
});

test('la extracción elimina interfaces administrativas antiguas, conserva referencias y registra la ruta global', () => {
  assert.doesNotMatch(accessSource, /function saveAccessRole\(|function setAccessRoleStatus\(/);
  assert.doesNotMatch(accessSource, /tab === 'roles'|tab === 'operations'|tab === 'scopetypes'/);
  assert.doesNotMatch(accessUiSource, /function renderRoles\(host\)|function renderOperations\(host\)|function renderScopeTypes\(host\)/);
  assert.doesNotMatch(accessUiSource, /id: 'roles'|id: 'operations'|id: 'scopeTypes'/);
  assert.match(accessUiSource, /activeRoles\(\)/);
  assert.match(accessUiSource, /state\.data\.operations = result\.operations/);
  assert.match(accessUiSource, /state\.data\.scopeTypes/);
  assert.match(accessUiSource, /roleOptions/);
  assert.match(accessSource, /function _accessLoadPermissionCatalogs_\(\)/);
  assert.match(securityUiSource, /rpc\('getSecurityMaintenanceData'\)/);
  assert.match(securityUiSource, /rpc\('saveSecurityCatalogRecord'/);
  assert.match(securityUiSource, /rpc\('deleteSecurityCatalogRecord'/);
  assert.match(securityUiSource, /sunarp:security-catalogs-changed/);
  assert.match(accessUiSource, /sunarp:security-catalogs-changed/);
  assert.match(maintenanceViewSource, /data-app-view="seguridad"/);
  assert.match(indexSource, /include\('SecurityMaintenanceScripts'\)/);
  assert.match(navigationSource, /route === 'seguridad'[\s\S]*?_accessIsGlobalAdministrator_\(auth\)/);
  assert.match(securitySource, /SUNARPCore\.getOrBuildCachedValue/);
  assert.match(securitySource, /SUNARPCore\.listRecordsFromSourcesCached/);
  assert.match(securitySource, /SUNARPCore\.insertRecord/);
  assert.match(securitySource, /SUNARPCore\.updateRecord/);
  assert.match(securitySource, /SUNARPCore\.deleteRecord/);
  assert.match(securitySource, /_accessRunAudited_/);
});

