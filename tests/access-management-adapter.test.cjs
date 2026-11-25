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
const configPath = path.join(root, 'Backend/Gestor de intranet SUNARP/AppConfig.js');
const accessUiPath = path.join(root, 'Backend/Gestor de intranet SUNARP/AccessManagementScripts.html');
const directoryUiPath = path.join(root, 'Backend/Gestor de intranet SUNARP/DirectoryScripts.html');
const directoryViewPath = path.join(root, 'Backend/Gestor de intranet SUNARP/ViewDirectorios.html');
const dataTableUiPath = path.join(root, 'Backend/SUNARP UI/UIDataTableScripts.html');

const coreSource = fs.readFileSync(corePath, 'utf8');
const accessSource = fs.readFileSync(accessPath, 'utf8');
const directorySource = fs.readFileSync(directoryPath, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');
const configSource = fs.readFileSync(configPath, 'utf8');
const accessUiSource = fs.readFileSync(accessUiPath, 'utf8');
const viewPath = path.join(root, 'Backend/Gestor de intranet SUNARP/ViewAccesos.html');
const viewSource = fs.readFileSync(viewPath, 'utf8');
const directoryUiSource = fs.readFileSync(directoryUiPath, 'utf8');
const directoryViewSource = fs.readFileSync(directoryViewPath, 'utf8');
const dataTableUiSource = fs.readFileSync(dataTableUiPath, 'utf8');

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
    operacion_id: 'ADMINISTRAR',
    descripcion: code,
    active: true
  })).concat([{
    permiso_id: 'PERM_INFO_001',
    codigo: 'INFORMACION_PERSONAL_VER',
    modulo_id: 'MOD_INFO_PERSONAL',
    operacion_id: 'VER',
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
    securityOrg: [],
    sedes: [],
    locales: [],
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
    operaciones: [
      { operacion_id: 'VER', nombre: 'Ver' },
      { operacion_id: 'CREAR', nombre: 'Crear' },
      { operacion_id: 'EDITAR', nombre: 'Editar' },
      { operacion_id: 'CAMBIAR_ESTADO', nombre: 'Cambiar estado' },
      { operacion_id: 'PUBLICAR', nombre: 'Publicar' },
      { operacion_id: 'ELIMINAR', nombre: 'Eliminar' },
      { operacion_id: 'ADMINISTRAR', nombre: 'Administrar' }
    ],
    tiposAmbito: [
      { tipo_ambito_id: 'TOTAL', nombre: 'Total', descripcion: 'Todos los registros del módulo', entidad_referencia: 'NINGUNA', requiere_referencia: false, permite_descendientes: false, active: true },
      { tipo_ambito_id: 'SEDE', nombre: 'Sede', descripcion: 'Registros de una sede', entidad_referencia: 'SEDE', requiere_referencia: true, permite_descendientes: false, active: true },
      { tipo_ambito_id: 'ESTRUCTURA_ORG', nombre: 'Unidad orgánica', descripcion: 'Unidad orgánica y descendientes', entidad_referencia: 'ESTRUCTURA_ORG', requiere_referencia: true, permite_descendientes: true, active: true },
      { tipo_ambito_id: 'LOCAL', nombre: 'Local', descripcion: 'Registros adscritos directamente a un local', entidad_referencia: 'LOCAL', requiere_referencia: true, permite_descendientes: false, active: true }
    ],
    rolPermiso: rolePermissions,
    ambitosAcceso: [
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_ACCESOS',
        tipo_ambito_id: 'TOTAL',
        referencia_id: '',
        incluir_descendientes: 'NO',
        active: true
      },
      {
        persona_id: 'PER_117',
        modulo_id: 'MOD_INFO_PERSONAL',
        tipo_ambito_id: 'TOTAL',
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
    console: { log: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    getIntranetDataSource: (sourceKey, sheetName, headerRow) => ({ sourceKey, sheetName, headerRow })
  });

  const dataKeyBySheet = {
    personas: 'personas',
    Usuarios: 'usuarios',
    Modulos: 'modulos',
    Roles: 'roles',
    UsuarioRol: 'usuarioRol',
    Permisos: 'permisos',
    RolPermiso: 'rolPermiso',
    AmbitosAcceso: 'ambitosAcceso',
    Operaciones: 'operaciones',
    TiposAmbito: 'tiposAmbito',
    asignaciones: 'asignaciones',
    estructura_local: 'estructura_local',
    estructura_org: 'estructura_org',
    locales: 'locales',
    Sedes: 'sedes',
    EstructuraOrg: 'securityOrg',
    tipos_estructura: 'tipos_estructura',
    sede: 'sede'
  };
  sandbox.SUNARPCore = {
    getCurrentUserEmail: () => email,
    findRecordsByFields: (source, filters, options) => {
      const key = dataKeyBySheet[source.sheetName] || source.sheetName;
      const rows = (data[key] || []).filter(record => Object.keys(filters).every(field => {
        const actual = String(record[field] === undefined || record[field] === null ? '' : record[field]);
        const expectedValues = Array.isArray(filters[field]) ? filters[field].map(String) : [String(filters[field] === undefined || filters[field] === null ? '' : filters[field])];
        return expectedValues.some(expected => options && options.matchCase === false
          ? actual.toLowerCase() === expected.toLowerCase()
          : actual === expected);
      }));
      const projectionFields = options && Array.isArray(options.projectionFields)
        ? Array.from(new Set(Object.keys(filters).concat(options.projectionFields)))
        : null;
      const projectedRows = projectionFields
        ? rows.map(record => Object.fromEntries(projectionFields.map(field => [field, record[field]])))
        : rows;
      return { records: projectedRows, total: projectedRows.length };
    },
    searchRecordsByFields: (source, query, fields, options) => {
      const key = dataKeyBySheet[source.sheetName] || source.sheetName;
      const expected = String(query || '').toLowerCase();
      const rows = (data[key] || []).filter(record =>
        fields.some(field => String(record[field] === undefined || record[field] === null ? '' : record[field]).toLowerCase().includes(expected))
      );
      return { records: rows, total: rows.length };
    },
    queryRecords: (source, options) => {
      const key = dataKeyBySheet[source.sheetName] || source.sheetName;
      const filters = options.filters || {};
      let rows = (data[key] || []).filter(record => Object.keys(filters).every(field => {
        const actual = String(record[field] === undefined || record[field] === null ? '' : record[field]);
        const expected = Array.isArray(filters[field]) ? filters[field].map(String) : [String(filters[field])];
        return expected.includes(actual);
      }));
      const search = String(options.search || '').trim().toLowerCase();
      if (search) {
        const fields = options.searchFields || [];
        const any = options.searchAny || [];
        rows = rows.filter(record =>
          fields.some(field => String(record[field] === undefined || record[field] === null ? '' : record[field]).toLowerCase().includes(search)) ||
          any.some(match => (match.values || []).map(String).includes(String(record[match.field] || '')))
        );
      }
      const sortBy = options.sortBy || options.idField;
      rows.sort((left, right) =>
        String(left[sortBy] || '').localeCompare(String(right[sortBy] || ''), 'es') ||
        String(left[options.idField] || '').localeCompare(String(right[options.idField] || ''))
      );
      const total = rows.length;
      const offset = Number(options.offset) || 0;
      const limit = Number(options.limit) || 25;
      return {
        records: rows.slice(offset, offset + limit),
        total,
        offset,
        limit,
        hasMore: offset + limit < total
      };
    },
    resolveIdentity: (source, email, options) => {
      const result = sandbox.SUNARPCore.findRecordsByFields(
        source,
        { [options.emailField]: email },
        {
          searchField: options.emailField,
          matchCase: false,
          requiredHeaders: options.requiredHeaders,
          projectionFields: options.projectionFields
        }
      );
      const records = (result.records || []).filter(item =>
        String(item[options.emailField] || '').trim().toLowerCase() === String(email || '').trim().toLowerCase() &&
        String(item[options.idField] || '').trim()
      );
      return { records, total: records.length };
    },
    getOrBuildCachedValue: (_key, _sources, builder) => ({ value: builder(), cacheHit: false, cacheStored: false }),
    listRecordsFromSourcesCached: requests => requests.reduce((result, request) => {
      const key = dataKeyBySheet[request.source.sheetName] || request.source.sheetName;
      result[request.key] = data[key] || [];
      return result;
    }, {}),
    getSourceInfoCached: () => ({ headers: ['id', 'name'] }),
    resolveAuthorizationContext: value => sandbox.resolveAuthorizationContext(value),
    authorizationHasPermission: (...args) => sandbox.authorizationHasPermission(...args),
    authorizationIsRecordInScope: (...args) => sandbox.authorizationIsRecordInScope(...args)
  };

  vm.runInContext(
    coreSource + '\n' + accessSource + '\n' + directorySource,
    sandbox,
    { filename: 'SUNARP-Core-and-AccessManagementService' }
  );
  sandbox._accessLoadSecurityData_ = () => data;
  sandbox._accessWriteAudit_ = () => null;
  return sandbox;
}

test('AppConfig declara Global parameters como maestro de catálogos y conserva las réplicas', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(configSource, sandbox);
  const directoryStructure = sandbox.getIntranetDataSource('DIRECTORY', 'estructura_org', 1);
  const securityStructure = sandbox.getIntranetDataSource('SECURITY', 'EstructuraOrg', 1);
  const directoryPeople = sandbox.getIntranetDataSource('DIRECTORY', 'personas', 1);
  assert.equal(directoryStructure.dependencies.length, 1);
  assert.equal(directoryStructure.dependencies[0].spreadsheetId, '1oIAWBuSE0SiwINa0v0KybCYiwKZFootQXoccwKDVBIE');
  assert.equal(directoryStructure.dependencies[0].sheetName, 'estructura_org');
  assert.equal(securityStructure.dependencies[0].spreadsheetId, '1oIAWBuSE0SiwINa0v0KybCYiwKZFootQXoccwKDVBIE');
  assert.equal(securityStructure.dependencies[0].sheetName, 'estructura_org');
  assert.equal(directoryPeople.dependencies.length, 0);
});

test('la navegación del shell obtiene Menu mediante la caché central de SUNARP Core', () => {
  const start = appSource.indexOf('function getNavigationItems_() {');
  const implementation = appSource.slice(start);
  assert.match(implementation, /listRecordsFromSourcesCached/);
  assert.match(implementation, /getIntranetDataSource/);
  assert.match(implementation, /'APP_DATA'/);
  assert.doesNotMatch(implementation, /SpreadsheetApp\.openById/);
  assert.doesNotMatch(implementation, /getDataRange\(\)\.getDisplayValues/);
});

test('la actualización independiente de Tipos de ámbito compara el identificador normalizado', () => {
  const start = accessSource.indexOf('function getAccessManagementTabData(tabId) {');
  const end = accessSource.indexOf('function getAccessUsers(', start);
  const implementation = accessSource.slice(start, end);
  assert.match(implementation, /_accessText_\(tabId\)\.toLowerCase\(\)/);
  assert.match(implementation, /tab === 'scopetypes'/);
  assert.doesNotMatch(implementation, /tab === 'scopeTypes'/);
});

test('el historial sin filtros y por rango temporal usa la cola indexada con total exacto y orden por fecha', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  const indexedRecords = [
    { evento_id: 'EVT_004', fecha_hora: new Date('2026-11-20T12:00:00Z'), actor_correo: 'a@sunarp.gob.pe' },
    { evento_id: 'EVT_002', fecha_hora: new Date('2026-11-20T11:00:00Z'), actor_correo: 'b@sunarp.gob.pe' }
  ];
  let optionsSeen = null;
  sandbox.SUNARPCore.listTailRecords = (_source, options) => {
    optionsSeen = options;
    return { records: indexedRecords, total: 23, offset: options.offset, limit: options.limit };
  };
  sandbox.SUNARPCore.listRecordsFromSourcesCached = () => {
    throw new Error('No debe cargar Auditoria completa si Core ofrece cola indexada.');
  };

  const result = sandbox.getAccessAuditHistory({
    desde: '2026-11-20',
    hasta: '2026-11-20',
    page: 2,
    pageSize: 10
  });
  assert.equal(result.total, 23);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal(result.totalPages, 3);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].evento_id, 'EVT_004');
  assert.equal(optionsSeen.idField, 'evento_id');
  assert.equal(optionsSeen.dateField, 'fecha_hora');
  assert.equal(optionsSeen.sortBy, 'fecha_hora');
  assert.equal(optionsSeen.offset, 10);
  assert.equal(optionsSeen.limit, 10);
  assert.equal(optionsSeen.fromDate.getDate(), 20);
  assert.equal(optionsSeen.fromDate.getHours(), 0);
  assert.equal(optionsSeen.toDate.getDate(), 20);
  assert.equal(optionsSeen.toDate.getHours(), 23);
});

test('el historial indexado conserva total y página vacía cuando el offset supera los eventos', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  sandbox.SUNARPCore.listTailRecords = (_source, options) => ({
    records: [], total: 4, offset: options.offset, limit: options.limit
  });
  const result = sandbox.getAccessAuditHistory({ page: 3, pageSize: 2 });
  assert.equal(result.total, 4);
  assert.equal(result.totalPages, 2);
  assert.equal(result.items.length, 0);
  assert.equal(result.page, 3);
});

test('los filtros combinados de auditoría retienen solo la página cronológica y cuentan todos los candidatos válidos', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  const rows = [
    { evento_id: 'EVT_001', fecha_hora: new Date('2026-11-20T09:00:00Z'), actor_correo: 'ana@sunarp.gob.pe', modulo: 'ACCESOS', accion: 'CREAR', resultado: 'OK' },
    { evento_id: 'EVT_002', fecha_hora: new Date('2026-11-20T11:00:00Z'), actor_correo: 'ana@sunarp.gob.pe', modulo: 'ACCESOS', accion: 'CREAR', resultado: 'OK' },
    { evento_id: 'EVT_003', fecha_hora: new Date('2026-11-20T10:00:00Z'), actor_correo: 'ana@sunarp.gob.pe', modulo: 'ACCESOS', accion: 'CREAR', resultado: 'OK' },
    { evento_id: 'EVT_004', fecha_hora: new Date('2026-11-20T12:00:00Z'), actor_correo: 'otra@sunarp.gob.pe', modulo: 'ACCESOS', accion: 'CREAR', resultado: 'OK' }
  ];
  sandbox.SUNARPCore.searchRecordsByFields = () => ({ records: rows, total: rows.length });
  const result = sandbox.getAccessAuditHistory({
    actor: 'ana@sunarp.gob.pe',
    desde: '2026-11-20',
    hasta: '2026-11-20',
    page: 2,
    pageSize: 1
  });
  assert.equal(result.total, 3);
  assert.equal(result.totalPages, 3);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].evento_id, 'EVT_003');
});

test('las pestañas de permisos y asignaciones agrupan sus catálogos en una lectura Core por pestaña', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  const originalList = sandbox.SUNARPCore.listRecordsFromSourcesCached;
  const calls = [];
  sandbox.SUNARPCore.listRecordsFromSourcesCached = (requests, ttl) => {
    calls.push({
      keys: requests.map(request => request.key),
      ttl
    });
    return originalList(requests, ttl);
  };

  const permissions = sandbox.getAccessManagementTabData('permissions');
  assert.equal(permissions.modules.length, 2);
  assert.ok(permissions.operations.length > 0);
  assert.ok(permissions.permissions.length > 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0].keys).sort(), ['modules', 'operations', 'permissions'].sort());
  assert.equal(calls[0].ttl, 60);

  calls.length = 0;
  const assignments = sandbox.getAccessManagementTabData('assignments');
  assert.equal(assignments.roles.length, 2);
  assert.ok(assignments.permissions.length > 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0].keys).sort(), [
    'modules', 'operations', 'permissions', 'rolePermissions', 'roles'
  ].sort());
  assert.equal(calls[0].ttl, 60);
});

test('getAccessUsers reutiliza un índice compartido entre páginas, sedes y roles', () => {
  const data = makeSecurityData();
  const accounts = [];
  const userRoles = [];
  const people = [];
  for (let index = 30; index >= 1; index--) {
    const personaId = 'PER_' + String(index).padStart(3, '0');
    accounts.push({ persona_id: personaId, active: true });
    userRoles.push({ persona_id: personaId, modulo_id: 'MOD_INFO_PERSONAL', rol_id: 'ROL_EDITOR', active: true });
    people.push({
      persona_id: personaId, nombres: 'Persona',
      apellidos: String(index).padStart(3, '0'),
      correo_institucional: 'persona' + index + '@sunarp.gob.pe'
    });
  }
  Object.assign(data, {
    usuarios: accounts, usuarioRol: userRoles, personas: people,
    asignaciones: [], estructura_local: [], estructura_org: [], locales: [], sede: []
  });
  const sandbox = createAdapterSandbox(data);
  sandbox._accessRequirePermission_ = () => ({ authenticated: true, modules: data.modulos });
  const materialized = new Map();
  let materializationCount = 0;
  let indexSources = null;
  sandbox.SUNARPCore.getOrBuildCachedValue = (key, sources, builder, ttl) => {
    assert.equal(key, 'access-users-index-v4');
    assert.equal(ttl, 60);
    indexSources = sources.map(source => source.sheetName);
    if (materialized.has(key)) return { value: materialized.get(key), cacheHit: true, cacheStored: true };
    materializationCount++;
    const value = builder();
    materialized.set(key, value);
    return { value, cacheHit: false, cacheStored: true };
  };

  const result = sandbox.getAccessUsers({ rol_id: 'ROL_EDITOR', page: 2, pageSize: 10 });
  assert.equal(result.total, 30);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal(result.totalPages, 3);
  assert.equal(result.items.length, 10);
  assert.equal(result.items[0].persona_id, 'PER_011');
  assert.equal(result.items[0].nombre_completo, 'Persona 011');
  assert.equal(result.items[9].persona_id, 'PER_020');

  const filtered = sandbox.getAccessUsers({
    rol_id: 'ROL_EDITOR', search: 'Persona 01', page: 1, pageSize: 10
  });
  assert.equal(filtered.total, 10);
  assert.equal(filtered.items[0].persona_id, 'PER_010');
  assert.equal(materializationCount, 1, 'Cambiar sede, rol, página o búsqueda no reconstruye el índice.');
  assert.deepEqual(Array.from(indexSources).sort(), [
    'Usuarios', 'UsuarioRol', 'Modulos', 'Roles', 'AmbitosAcceso',
    'Sedes', 'EstructuraOrg', 'locales'
  ].sort());
});
test('la autorización ordinaria no expone getters de snapshots completos y la integridad global es explícita', () => {
  const authStart = accessSource.indexOf('function _accessGetAuthContext_() {');
  const authEnd = accessSource.indexOf('function getAuthContext_()', authStart);
  const authImplementation = accessSource.slice(authStart, authEnd);
  assert.ok(authStart >= 0 && authEnd > authStart);
  assert.doesNotMatch(authImplementation, /_accessLoadSecurityData_/);
  assert.doesNotMatch(authImplementation, /securityData|userAccountsCatalog/);

  const integrityStart = accessSource.indexOf('function validateAccessManagementIntegrity() {');
  const integrityEnd = accessSource.indexOf('function _accessFindPersonById_(', integrityStart);
  const integrityImplementation = accessSource.slice(integrityStart, integrityEnd);
  assert.ok(integrityStart >= 0 && integrityEnd > integrityStart);
  assert.ok(integrityImplementation.includes("_accessRequirePermission_('USUARIOS_ADMINISTRAR')"));
  assert.ok(integrityImplementation.includes('_accessLoadSecurityData_()'));
  assert.ok(integrityImplementation.includes('counts'));
});

test('el historial por entidad ordena cronológicamente, conserva el total y admite páginas vacías', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  const rows = [
    { evento_id: 'EVT_001', fecha_hora: new Date('2026-11-20T09:00:00Z'), tipo_entidad: 'USUARIO', registro_id: 'PER_001', modulo: 'ACCESOS' },
    { evento_id: 'EVT_002', fecha_hora: new Date('2026-11-20T12:00:00Z'), tipo_entidad: 'USUARIO_ROL', registro_id: 'PER_001', modulo: 'ACCESOS' },
    { evento_id: 'EVT_003', fecha_hora: new Date('2026-11-20T10:00:00Z'), tipo_entidad: 'AMBITO_ACCESO', registro_id: 'PER_001', modulo: 'ACCESOS' },
    { evento_id: 'EVT_004', fecha_hora: new Date('2026-11-20T11:00:00Z'), tipo_entidad: 'ROL', registro_id: 'ROL_01', modulo: 'ACCESOS' }
  ];
  sandbox.SUNARPCore.findRecordsByFields = () => ({ records: rows, total: rows.length });

  const page = sandbox.getAccessEntityHistory({
    tipo_entidad: 'USUARIO', registro_id: 'PER_001', page: 2, pageSize: 1
  });
  assert.equal(page.total, 3);
  assert.equal(page.totalPages, 3);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].evento_id, 'EVT_003');

  const empty = sandbox.getAccessEntityHistory({
    tipo_entidad: 'USUARIO', registro_id: 'PER_001', page: 4, pageSize: 1
  });
  assert.equal(empty.total, 3);
  assert.equal(empty.totalPages, 3);
  assert.equal(empty.items.length, 0);
});

test('el historial conserva compatibilidad con SUNARP Core v9 mientras admite lectura de cola', () => {
  const start = accessSource.indexOf('function getAccessAuditHistory(filters) {');
  const end = accessSource.indexOf('function _accessParseAuditData_(', start);
  const implementation = accessSource.slice(start, end);
  assert.ok(implementation.includes("typeof SUNARPCore.listTailRecords === 'function'"));
  assert.ok(implementation.includes('listRecordsFromSourcesCached'));
  assert.ok(implementation.includes('listTailRecords'));
});

test('getAccessUsers filtra por ámbitos efectivos y no por adscripciones funcionales', () => {
  const data = makeSecurityData();
  data.personas.push(
    { persona_id: 'PER_118', nombres: 'Ana', apellidos: 'Zeta', correo_institucional: 'ana.zeta@sunarp.gob.pe' },
    { persona_id: 'PER_119', nombres: 'Luis', apellidos: 'Mala', correo_institucional: 'luis.mala@sunarp.gob.pe' },
    { persona_id: 'PER_120', nombres: 'Rosa', apellidos: 'Cruce', correo_institucional: 'rosa.cruce@sunarp.gob.pe' },
    { persona_id: 'PER_121', nombres: 'Mario', apellidos: 'Cruce', correo_institucional: 'mario.cruce@sunarp.gob.pe' }
  );
  data.usuarios = [
    { persona_id: 'PER_117', active: true }, { persona_id: 'PER_118', active: false },
    { persona_id: 'PER_119', active: true }, { persona_id: 'PER_120', active: true },
    { persona_id: 'PER_121', active: true }
  ];
  data.usuarioRol = [
    { persona_id: 'PER_117', modulo_id: 'MOD_ACCESOS', rol_id: 'ROL_ADMIN', active: true },
    { persona_id: 'PER_117', modulo_id: 'MOD_INFO_PERSONAL', rol_id: 'ROL_EDITOR', active: true },
    { persona_id: 'PER_118', modulo_id: 'MOD_INFO_PERSONAL', rol_id: 'ROL_EDITOR', active: true },
    { persona_id: 'PER_119', modulo_id: 'MOD_INFO_PERSONAL', rol_id: 'ROL_EDITOR', active: true },
    { persona_id: 'PER_120', modulo_id: 'MOD_INFO_PERSONAL', rol_id: 'ROL_EDITOR', active: true },
    { persona_id: 'PER_121', modulo_id: 'MOD_INFO_PERSONAL', rol_id: 'ROL_EDITOR', active: true }
  ];
  data.sedes = [
    { id: 'SEDE_1', name: 'Lima', active: true }, { id: 'SEDE_2', name: 'Piura', active: true },
    { id: 'SEDE_CENTRAL', name: 'Central', active: true }, { id: 'ZR_V', name: 'Zona V', active: true },
    { id: 'ZR_XII', name: 'Zona XII', active: true }
  ];
  data.securityOrg = [
    { id: 'EST_1', sede_id: 'SEDE_1', active: true },
    { id: 'EST_CENTRAL', sede_id: 'SEDE_CENTRAL', active: true },
    { id: 'EST_CENTRAL_2', sede_id: 'SEDE_CENTRAL', active: true }
  ];
  data.ambitosAcceso = data.ambitosAcceso.filter(scope => !(scope.persona_id === 'PER_117' && scope.modulo_id === 'MOD_INFO_PERSONAL'));
  data.ambitosAcceso.push({
    persona_id: 'PER_117', modulo_id: 'MOD_INFO_PERSONAL', tipo_ambito_id: 'SEDE',
    referencia_id: 'SEDE_1', incluir_descendientes: 'NO', active: true
  });
  data.ambitosAcceso.push({
    persona_id: 'PER_118', modulo_id: 'MOD_INFO_PERSONAL', tipo_ambito_id: 'SEDE',
    referencia_id: 'SEDE_1', incluir_descendientes: 'NO', active: true
  });
  data.asignaciones = [
    { asignacion_id: 'ASG_001', persona_id: 'PER_117', estructura_local_id: 'REL_1', local_id: 'LOC_1', active: true },
    { asignacion_id: 'ASG_002', persona_id: 'PER_118', estructura_local_id: '', local_id: 'LOC_1', active: true },
    { asignacion_id: 'ASG_003', persona_id: 'PER_119', estructura_local_id: 'REL_1', local_id: 'LOC_WRONG', active: true },
    { asignacion_id: 'ASG_004', persona_id: 'PER_120', estructura_local_id: 'REL_CROSS_1', local_id: 'LOC_X', active: true },
    { asignacion_id: 'ASG_005', persona_id: 'PER_121', estructura_local_id: 'REL_CROSS_2', local_id: 'LOC_Y', active: true }
  ];
  data.estructura_local = [
    { id: 'REL_1', estructura_id: 'EST_1', local_id: 'LOC_1' },
    { id: 'REL_CROSS_1', estructura_id: 'EST_CENTRAL', local_id: 'LOC_X' },
    { id: 'REL_CROSS_2', estructura_id: 'EST_CENTRAL_2', local_id: 'LOC_Y' }
  ];
  data.estructura_org = [
    { id: 'EST_1', sede_id: 'SEDE_1' },
    { id: 'EST_CENTRAL', sede_id: 'SEDE_CENTRAL' },
    { id: 'EST_CENTRAL_2', sede_id: 'SEDE_CENTRAL' }
  ];
  data.locales = [
    { id: 'LOC_1', sede_id: 'SEDE_1' },
    { id: 'LOC_WRONG', sede_id: 'SEDE_2' },
    { id: 'LOC_X', sede_id: 'ZR_V' },
    { id: 'LOC_Y', sede_id: 'ZR_XII' }
  ];
  data.sede = [
    { id: 'SEDE_1', name: 'Lima' }, { id: 'SEDE_2', name: 'Piura' },
    { id: 'SEDE_CENTRAL', name: 'Central' }, { id: 'ZR_V', name: 'Zona V' },
    { id: 'ZR_XII', name: 'Zona XII' }
  ];

  const sandbox = createAdapterSandbox(data);
  sandbox._accessRequirePermission_ = () => ({ authenticated: true, modules: data.modulos });
  const cache = new Map();
  let buildCount = 0;
  sandbox.SUNARPCore.getOrBuildCachedValue = (key, sources, builder, ttl) => {
    assert.equal(key, 'access-users-index-v4');
    assert.equal(sources.length, 8);
    assert.equal(ttl, 60);
    if (cache.has(key)) return { value: cache.get(key), cacheHit: true, cacheStored: true };
    buildCount++;
    const value = builder();
    cache.set(key, value);
    return { value, cacheHit: false, cacheStored: true };
  };
  let fullLoads = 0;
  const fullLoader = sandbox._accessLoadSecurityData_;
  sandbox._accessLoadSecurityData_ = () => { fullLoads++; return fullLoader(); };

  const bySite = sandbox.getAccessUsers({
    sede_id: 'SEDE_1', search: 'lima', page: 1, pageSize: 10
  });
  assert.equal(bySite.total, 2);
  assert.equal(bySite.items.length, 2);
  assert.deepEqual(Array.from(bySite.items, item => item.persona_id).sort(), ['PER_117', 'PER_118']);
  assert.equal(bySite.items[0].sede_nombre, 'Lima');
  assert.ok(!bySite.items.some(item => ['PER_119', 'PER_120', 'PER_121'].includes(item.persona_id)));
  assert.equal(bySite.integrity.activeScopes, 2);
  assert.equal(bySite.integrity.invalidScopes, 0);
  assert.equal(bySite.integrity.multiSiteAccounts, 0);

  const byRole = sandbox.getAccessUsers({ rol_id: 'ROL_ADMIN', page: 1, pageSize: 10 });
  assert.equal(byRole.total, 1);
  assert.equal(byRole.items[0].persona_id, 'PER_117');
  assert.equal(buildCount, 1, 'Cambiar de sede a rol reutiliza el mismo índice compartido.');
  assert.equal(fullLoads, 0, 'El índice no debe cargar el snapshot global de las tablas de seguridad.');
});
test('la búsqueda documental comprueba la cuenta por persona_id sin cargar el snapshot global', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  let fullLoads = 0;
  sandbox._accessLoadSecurityData_ = () => {
    fullLoads++;
    throw new Error('No debe cargarse el snapshot completo para esta consulta.');
  };
  let accountLookup = null;
  sandbox._accessRequirePermission_ = () => ({
    get userAccountsCatalog() {
      throw new Error('No debe consultarse userAccountsCatalog.');
    }
  });
  sandbox._accessLoadDocumentTypeRecords_ = () => [{ id: 'DNI', name: 'DNI' }];
  sandbox._accessFindPersonById_ = personaId => ({
    persona_id: personaId,
    nombres: 'Persona',
    apellidos: 'Prueba',
    correo_institucional: 'prueba@sunarp.gob.pe'
  });
  sandbox._accessFindSecurityRecords_ = (sheet, field, values) => {
    accountLookup = { sheet, field, values: Array.from(values) };
    return [{ persona_id: 'PER_117', active: true }];
  };
  let documentQuery = null;
  sandbox.SUNARPCore.findRecordsByFields = (source, filters, options) => {
    documentQuery = {
      sheet: source.sheetName,
      filters,
      projectionFields: options.projectionFields,
      ignoreWhitespace: options.ignoreWhitespace
    };
    return {
      records: [{ servidor_id: 'PER_117', tipo_documento: 'D N I', numero_documento: '12 345 678' }],
      total: 1
    };
  };

  const result = sandbox.searchAccessPersonByDocument({
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  });
  assert.equal(result.found, true);
  assert.equal(result.canEnableAccount, false);
  assert.equal(documentQuery.sheet, 'servidores datos personales');
  assert.equal(documentQuery.filters.numero_documento, '12345678');
  assert.deepEqual(Object.keys(documentQuery.filters), ['numero_documento']);
  assert.equal(documentQuery.ignoreWhitespace, true);
  assert.equal(
    documentQuery.projectionFields.join(','),
    'servidor_id,tipo_documento,numero_documento'
  );
  assert.deepEqual(accountLookup, {
    sheet: 'Usuarios',
    field: 'persona_id',
    values: ['PER_117']
  });
  assert.equal(result.person.numero_documento, '12345678');
  assert.equal(fullLoads, 0);
});


test('getAccessUsers incluye cuentas por ámbito organizacional aunque no tengan asignaciones en Directorios', () => {
  const data = makeSecurityData();
  data.personas.push({
    persona_id: 'PER_122', nombres: 'Nueva', apellidos: 'Editora',
    correo_institucional: 'nueva.editora@sunarp.gob.pe'
  });
  data.usuarios.push({ persona_id: 'PER_122', active: true });
  data.usuarioRol.push({
    persona_id: 'PER_122', modulo_id: 'MOD_INFO_PERSONAL',
    rol_id: 'ROL_EDITOR', active: true
  });
  data.ambitosAcceso = data.ambitosAcceso.filter(scope => !(scope.persona_id === 'PER_117' && scope.modulo_id === 'MOD_INFO_PERSONAL'));
  data.ambitosAcceso.push({
    persona_id: 'PER_122', modulo_id: 'MOD_INFO_PERSONAL',
    tipo_ambito_id: 'ESTRUCTURA_ORG', referencia_id: 'EST_COMUNICACIONES',
    incluir_descendientes: 'NO', active: true
  });
  data.sedes = [{ id: 'SEDE_CENTRAL', name: 'Sede Central', active: true }];
  data.securityOrg = [{
    id: 'EST_COMUNICACIONES', name: 'Unidad de Comunicaciones',
    sede_id: 'SEDE_CENTRAL', active: true
  }];
  data.asignaciones = Array.from({ length: 3792 }, (_, index) => ({
    asignacion_id: 'ASG_' + index,
    persona_id: 'PER_OTHER',
    estructura_local_id: 'REL_' + index,
    local_id: 'LOC_' + index,
    active: true
  }));

  const sandbox = createAdapterSandbox(data);
  sandbox._accessRequirePermission_ = () => ({
    authenticated: true,
    modules: data.modulos
  });
  let indexSources = [];
  let readRequests = [];
  let peopleQuery = null;
  const originalCache = sandbox.SUNARPCore.getOrBuildCachedValue;
  sandbox.SUNARPCore.getOrBuildCachedValue = (key, sources, builder, ttl) => {
    indexSources = sources.map(source => source.sheetName);
    return originalCache(key, sources, builder, ttl);
  };
  const originalList = sandbox.SUNARPCore.listRecordsFromSourcesCached;
  sandbox.SUNARPCore.listRecordsFromSourcesCached = (requests, ttl) => {
    readRequests = requests.map(request => request.source.sheetName);
    return originalList(requests, ttl);
  };
  const originalQuery = sandbox.SUNARPCore.queryRecords;
  sandbox.SUNARPCore.queryRecords = (source, options) => {
    peopleQuery = { sheet: source.sheetName, options };
    return originalQuery(source, options);
  };

  const result = sandbox.getAccessUsers({
    sede_id: 'SEDE_CENTRAL',
    rol_id: 'ROL_EDITOR',
    page: 1,
    pageSize: 10
  });
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].persona_id, 'PER_122');
  assert.equal(result.items[0].sede_nombre, 'Sede Central');
  assert.equal(peopleQuery.sheet, 'personas');
  assert.equal(peopleQuery.options.limit, 10);
  assert.equal(peopleQuery.options.offset, 0);
  assert.equal(peopleQuery.options.authorization.moduleId, 'MOD_ACCESOS');
  assert.ok(indexSources.includes('AmbitosAcceso'));
  assert.ok(indexSources.includes('EstructuraOrg'));
  assert.ok(!indexSources.includes('asignaciones'));
  assert.ok(!indexSources.includes('estructura_local'));
  assert.ok(!readRequests.includes('asignaciones'));
  assert.ok(!readRequests.includes('estructura_local'));
});


test('el diagnóstico de acceso mide identidad, relaciones de autorización, consultas y RPC', () => {
  assert.match(accessSource, /Authorization data stages/);
  assert.match(accessSource, /Authorization context build stages/);
  assert.match(accessSource, /currentUserLookupMs/);
  assert.match(accessSource, /authorizationResolutionMs/);
  assert.match(accessSource, /User configuration timing/);
  assert.match(accessSource, /Tab data timing/);
  assert.match(accessSource, /_getAccessManagementTabData_\(tabId\)/);
  assert.match(accessSource, /Save user timing/);
  assert.match(accessSource, /User record stages/);
  assert.match(accessSource, /documentLookupMs/);
  assert.match(accessUiSource, /roundTripMs/);
  assert.match(accessUiSource, /getAccessManagementTabData/);
  assert.match(accessUiSource, /\^saveAccess/);
});

test('crear usuario, asignar rol y ámbito, listar por sede y bloquear duplicidad documental', () => {
  const data = makeSecurityData();
  data.ambitosAcceso = data.ambitosAcceso.filter(scope =>
    !(scope.persona_id === 'PER_117' && scope.modulo_id === 'MOD_INFO_PERSONAL')
  );
  data.personas.push({
    persona_id: 'PER_122',
    nombres: 'Nueva',
    apellidos: 'Editora',
    correo_institucional: 'nueva.editora@sunarp.gob.pe'
  });
  data.sedes = [{ id: 'SEDE_CENTRAL', name: 'Sede Central', active: true }];
  data.securityOrg = [{
    id: 'EST_COMMS',
    name: 'Unidad de Comunicaciones',
    sede_id: 'SEDE_CENTRAL',
    active: true
  }];
  data['servidores datos personales'] = [{
    servidor_id: 'PER_122',
    tipo_documento: 'D N I',
    numero_documento: '12 345 678'
  }];

  const sandbox = createAdapterSandbox(data);
  sandbox._accessLoadDocumentTypeRecords_ = () => [{ id: 'DNI', name: 'DNI' }];
  sandbox._accessAddMetadata_ = (_sheet, record) => record;
  sandbox._accessRunAudited_ = (_auth, _event, execute) => execute().value;
  const documentLookups = [];
  const originalFind = sandbox.SUNARPCore.findRecordsByFields;
  sandbox.SUNARPCore.findRecordsByFields = (source, filters, options) => {
    if (source.sheetName === 'servidores datos personales') {
      documentLookups.push({ filters, options });
      assert.equal(options.ignoreWhitespace, true);
      const normalize = value => String(value || '').replace(/\s+/g, '').toUpperCase();
      const records = data['servidores datos personales'].filter(record =>
        normalize(record.numero_documento) === normalize(filters.numero_documento)
      );
      return { records, total: records.length };
    }
    return originalFind(source, filters, options);
  };
  sandbox.SUNARPCore.insertRecord = (source, record) => {
    assert.equal(source.sheetName, 'Usuarios');
    data.usuarios.push(record);
    return { success: true };
  };
  sandbox.SUNARPCore.syncRecordsByKey = (
    source, filters, keyFields, desiredRecords, activeField
  ) => {
    const key = source.sheetName === 'UsuarioRol' ? 'usuarioRol' : 'ambitosAcceso';
    const matches = record => Object.keys(filters).every(field =>
      String(record[field] || '') === String(filters[field] || '')
    );
    data[key] = (data[key] || []).filter(record => !matches(record));
    desiredRecords.forEach(record => data[key].push(Object.assign({}, filters, record, {
      [activeField]: true
    })));
    return { success: true, inserted: desiredRecords.length, updated: 0, deactivated: 0 };
  };

  const accountPayload = {
    action: 'create',
    persona_id: 'PER_122',
    active: true,
    tipo_documento: 'DNI',
    numero_documento: '12345678'
  };
  const created = sandbox.saveAccessUser(accountPayload);
  assert.equal(created.success, true);
  assert.equal(data.usuarios.filter(user => user.persona_id === 'PER_122').length, 1);

  const configured = sandbox.saveAccessUserConfiguration({
    persona_id: 'PER_122',
    accesos: [{
      modulo_id: 'MOD_INFO_PERSONAL',
      rol_id: 'ROL_EDITOR',
      ambitos: [{
        tipo_ambito_id: 'ESTRUCTURA_ORG',
        referencia_id: 'EST_COMMS',
        incluir_descendientes: 'NO'
      }]
    }]
  });
  assert.equal(configured.success, true);
  assert.equal(data.usuarioRol.some(row =>
    row.persona_id === 'PER_122' && row.modulo_id === 'MOD_INFO_PERSONAL' &&
    row.rol_id === 'ROL_EDITOR' && row.active === true
  ), true);
  assert.equal(data.ambitosAcceso.some(row =>
    row.persona_id === 'PER_122' && row.tipo_ambito_id === 'ESTRUCTURA_ORG' &&
    row.referencia_id === 'EST_COMMS' && row.active === true
  ), true);

  const listed = sandbox.getAccessUsers({
    sede_id: 'SEDE_CENTRAL',
    rol_id: 'ROL_EDITOR',
    page: 1,
    pageSize: 10
  });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].persona_id, 'PER_122');
  assert.equal(listed.items[0].sede_nombre, 'Sede Central');

  const edited = sandbox.saveAccessUserConfiguration({
    persona_id: 'PER_122',
    accesos: [{
      modulo_id: 'MOD_INFO_PERSONAL',
      rol_id: 'ROL_ADMIN',
      ambitos: [{
        tipo_ambito_id: 'SEDE',
        referencia_id: 'SEDE_CENTRAL',
        incluir_descendientes: 'NO'
      }]
    }]
  });
  assert.equal(edited.success, true);
  const oldRoleList = sandbox.getAccessUsers({
    sede_id: 'SEDE_CENTRAL', rol_id: 'ROL_EDITOR', page: 1, pageSize: 10
  });
  const updatedRoleList = sandbox.getAccessUsers({
    sede_id: 'SEDE_CENTRAL', rol_id: 'ROL_ADMIN', page: 1, pageSize: 10
  });
  assert.equal(oldRoleList.total, 0, 'La lista deja de incluir el rol anterior después de editar');
  assert.equal(updatedRoleList.total, 1, 'La lista refleja el nuevo rol y el ámbito de sede');
  assert.equal(updatedRoleList.items[0].persona_id, 'PER_122');

  assert.throws(
    () => sandbox.saveAccessUser(accountPayload),
    /ya tiene una cuenta registrada/i
  );
  assert.equal(data.usuarios.filter(user => user.persona_id === 'PER_122').length, 1);
  assert.equal(documentLookups.length, 2);
});

test('la selección de filtros invalida RPC anteriores y consulta inmediatamente', () => {
  const start = accessUiSource.indexOf('function loadFilteredUsers()');
  const end = accessUiSource.indexOf('siteSelect.addEventListener', start);
  const implementation = accessUiSource.slice(start, end);
  assert.ok(implementation.includes('requestNumber += 1'));
  assert.ok(implementation.includes('renderTable(host, tableConfig)'));
  assert.ok(implementation.includes('state.userFilters'));
});

test('la tabla de usuarios conserva filtros y ejecuta la consulta al cambiar sede o rol', () => {
  const start = accessUiSource.indexOf('function renderUsers(host) {');
  const end = accessUiSource.indexOf('function openUserModal(row) {', start);
  const implementation = accessUiSource.slice(start, end);
  assert.ok(implementation.includes('appliedSedeId = siteSelect.value'));
  assert.ok(implementation.includes('appliedRoleId = roleSelect.value'));
  assert.ok(implementation.includes("'Selecciona una sede'"));
  assert.ok(implementation.includes("'Selecciona un rol'"));
  assert.ok(implementation.includes("{ value: '__ALL__', label: 'Todas las sedes' }"));
  assert.ok(implementation.includes("{ value: '__ALL__', label: 'Todos los roles' }"));
  assert.ok(implementation.includes("siteSelect.addEventListener('change', loadFilteredUsers)"));
  assert.ok(implementation.includes("roleSelect.addEventListener('change', loadFilteredUsers)"));
  assert.doesNotMatch(implementation, /createButton\(\s*'Actualizar'/);
  assert.ok(implementation.includes('renderTable(host, tableConfig)'));
});

test('el despliegue de prueba del Gestor referencia la nueva versión de SUNARP Core', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'Backend/Gestor de intranet SUNARP/appsscript.json'),
    'utf8'
  ));
  const coreLibrary = manifest.dependencies.libraries.find(item => item.userSymbol === 'SUNARPCore');
  assert.ok(coreLibrary);
  assert.equal(coreLibrary.version, '16');
  assert.equal(coreLibrary.developmentMode, undefined);
});

test('la consulta de usuarios reutiliza la vista materializada, pagina en servidor y limita el payload', () => {
  const helperStart = accessSource.indexOf('function _accessBuildUserListingIndex_() {');
  const helperEnd = accessSource.indexOf('function getAccessUsers(filters) {', helperStart);
  const helper = accessSource.slice(helperStart, helperEnd);
  const start = accessSource.indexOf('function getAccessUsers(filters) {');
  const end = accessSource.indexOf('function _accessAuditTimestamp_(', start);
  const implementation = accessSource.slice(start, end);
  assert.ok(helper.includes('getOrBuildCachedValue'));
  assert.ok(helper.includes('access-users-index-v4'));
  assert.ok(helper.includes("_accessSecuritySource_('EstructuraOrg')"));
  assert.ok(helper.includes('ACCESS_MANAGEMENT_CONFIG.sheets.scopes'));
  assert.ok(helper.includes("_accessFindOrgCatalogByIds_('ESTRUCTURA_ORG'"));
  assert.ok(helper.includes("_accessFindOrgCatalogByIds_('LOCAL'"));
  assert.ok(helper.includes('orgLookupMs'));
  assert.doesNotMatch(helper, /asignaciones|estructura_local/);
  assert.ok(implementation.includes('SUNARPCore.queryRecords'));
  assert.ok(implementation.includes('filters: { persona_id: pageCandidateIds }'));
  assert.ok(implementation.includes('offset'));
  assert.ok(implementation.includes('limit: pageSize'));
  assert.ok(implementation.includes('searchRecordsByFields'));
  assert.ok(implementation.includes('peoplePage.records'));
  const uiStart = accessUiSource.indexOf('function renderUsers(host) {');
  const uiEnd = accessUiSource.indexOf('function openUserModal(row) {', uiStart);
  const uiImplementation = accessUiSource.slice(uiStart, uiEnd);
  assert.ok(uiImplementation.includes("mode: 'server'"));
  assert.ok(uiImplementation.includes('loadData: loadUserPage'));
});


test('la auditoría serializa fecha_hora como ISO string antes de cruzar al proyecto Core', () => {
  const start = accessSource.indexOf('function _accessWriteAudit_(actor, event) {');
  const end = accessSource.indexOf('function _accessRunAudited_(', start);
  const implementation = accessSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(implementation, /fecha_hora:\s*now\.toISOString\(\)/);
  assert.doesNotMatch(implementation, /fecha_hora:\s*now\s*,/);
  const serializedDate = new Date('2026-11-24T05:00:00.000Z').toISOString();
  assert.equal(typeof serializedDate, 'string');
  assert.equal(new Date(serializedDate).toISOString(), serializedDate);
});

test('la escritura de auditoría reutiliza metadatos de fuente desde Core', () => {
  const start = accessSource.indexOf('function _accessWriteAudit_(actor, event) {');
  const end = accessSource.indexOf('function _accessRunAudited_(', start);
  const implementation = accessSource.slice(start, end);
  assert.ok(implementation.includes('getSourceInfoCached'));
  assert.ok(!implementation.includes('getSourceInfo(source)'));
});

test('el historial filtrado por actor busca candidatos en Core y evita cargar toda Auditoria', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  let lookup = null;
  let fullReads = 0;
  sandbox.SUNARPCore.searchRecordsByFields = (source, query, fields, options) => {
    lookup = { sheet: source.sheetName, query, fields: Array.from(fields), matchCase: options.matchCase };
    return {
      records: [{
        evento_id: 'EVT_001',
        fecha_hora: new Date('2026-11-20T10:00:00Z'),
        actor_correo: 'ana@sunarp.gob.pe',
        actor_nombre: 'Ana',
        accion: 'ACTUALIZAR',
        modulo: 'ACCESOS',
        tipo_entidad: 'USUARIO',
        registro_id: 'PER_001',
        registro_nombre: 'Ana',
        resultado: 'OK',
        detalle: 'Actualización de cuenta',
        datos_antes: '',
        datos_despues: '',
        ambito_modulo: '',
        ambito_tipo: '',
        ambito_referencia_id: ''
      }],
      total: 1
    };
  };
  sandbox.SUNARPCore.listRecordsFromSourcesCached = () => {
    fullReads++;
    throw new Error('No debe cargarse la tabla completa para un filtro de actor.');
  };

  const result = sandbox.getAccessAuditHistory({ actor: 'ana@sunarp.gob.pe', page: 1, pageSize: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].actor_correo, 'ana@sunarp.gob.pe');
  assert.equal(lookup.sheet, 'Auditoria');
  assert.equal(lookup.query, 'ana@sunarp.gob.pe');
  assert.deepEqual(lookup.fields, ['actor_correo']);
  assert.equal(lookup.matchCase, false);
  assert.equal(fullReads, 0);
});

test('el historial general evita leer la tabla completa cuando no hay filtros', () => {
  const start = accessSource.indexOf('function getAccessAuditHistory(filters) {');
  const end = accessSource.indexOf('function _accessParseAuditData_(', start);
  const implementation = accessSource.slice(start, end);
  assert.ok(implementation.includes('listTailRecords'));
  assert.ok(implementation.includes("idField: 'evento_id'"));
  assert.ok(implementation.includes('if (!hasNonDateFilters && hasIndexedTail)'));
});
test('el historial por entidad consulta candidatos y pagina sobre un índice por generación', () => {
  const builderStart = accessSource.indexOf('function _accessBuildEntityHistoryIndex_(');
  const endpointStart = accessSource.indexOf('function getAccessEntityHistory(payload) {');
  const endpointEnd = accessSource.indexOf('function _accessChangeStatus_(', endpointStart);
  const builder = accessSource.slice(builderStart, endpointStart);
  const endpoint = accessSource.slice(endpointStart, endpointEnd);
  assert.ok(builderStart >= 0 && endpointStart > builderStart && endpointEnd > endpointStart);
  assert.ok(builder.includes('findRecordsByFields'));
  assert.ok(builder.includes('searchRecordsByFields'));
  assert.ok(builder.includes("_accessAuditContainsPermission_(event, recordId)"));
  assert.ok(!builder.includes('listRecordsFromSourcesCached'));
  assert.ok(endpoint.includes('getOrBuildCachedValue'));
  assert.ok(endpoint.includes('events.slice(offset, offset + pageSize)'));
});
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

test('la identidad de sesión se resuelve en personas con proyección mínima y Core recibe persona_id', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  let identityOptions = null;
  const resolve = sandbox.SUNARPCore.resolveIdentity;
  sandbox.SUNARPCore.resolveIdentity = (source, email, options) => {
    identityOptions = options;
    return resolve(source, email, options);
  };
  const auth = sandbox._accessGetAuthContext_();
  assert.equal(auth.authenticated, true);
  assert.equal(auth.personaId, 'PER_117');
  assert.equal(auth.user.persona_id, 'PER_117');
  assert.equal(auth.user.active, true);
  assert.equal(Object.hasOwn(auth.user, 'correo_institucional'), false);
  assert.equal(Object.hasOwn(auth.user, 'rol_id'), false);
  assert.equal(auth.email, 'prueba@sunarp.gob.pe');
  assert.equal(
    identityOptions.projectionFields.join(','),
    'persona_id,correo_institucional,nombres,apellidos'
  );
});


test('la autorización carga relaciones selectivas y difiere las nueve fuentes administrativas completas', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  let fullLoads = 0;
  const fullLoader = sandbox._accessLoadSecurityData_;
  sandbox._accessLoadSecurityData_ = () => {
    fullLoads++;
    const security = Object.assign({}, fullLoader());
    delete security.personas;
    return security;
  };
  const calls = [];
  const find = sandbox.SUNARPCore.findRecordsByFields;
  sandbox.SUNARPCore.findRecordsByFields = (source, filters, options) => {
    calls.push({ sheet: source.sheetName, filters, searchField: options.searchField });
    return find(source, filters, options);
  };

  const auth = sandbox._accessGetAuthContext_();
  assert.equal(auth.authenticated, true);
  assert.equal(fullLoads, 0);
  assert.deepEqual(
    calls.map(item => item.sheet).sort(),
    ['AmbitosAcceso', 'Permisos', 'Roles', 'RolPermiso', 'UsuarioRol', 'Usuarios', 'personas'].sort()
  );
  assert.equal(calls.find(item => item.sheet === 'personas').filters.correo_institucional, 'prueba@sunarp.gob.pe');
  assert.equal(calls.find(item => item.sheet === 'Usuarios').filters.persona_id, 'PER_117');
  assert.equal(Object.hasOwn(auth, 'personasCatalog'), false);

  assert.equal(Object.hasOwn(auth, 'securityData'), false);
  assert.equal(Object.hasOwn(auth, 'userAccountsCatalog'), false);
  assert.equal(fullLoads, 0);
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

test('editar una cuenta usa relaciones puntuales y no carga las nueve tablas de seguridad', () => {
  const data = makeSecurityData();
  data.personas.push({
    persona_id: 'PER_118',
    nombres: 'Ana',
    apellidos: 'Zeta',
    correo_institucional: 'ana.zeta@sunarp.gob.pe'
  });
  data.usuarios.push({ persona_id: 'PER_118', active: false });
  const sandbox = createAdapterSandbox(data);
  let fullLoads = 0;
  sandbox._accessLoadSecurityData_ = () => {
    fullLoads++;
    throw new Error('No debe cargarse el conjunto completo de tablas de seguridad.');
  };
  sandbox._accessAddMetadata_ = (sheet, record) => record;
  sandbox._accessRunAudited_ = (auth, event, execute) => execute().value;
  let updated = null;
  sandbox.SUNARPCore.updateRecord = (...args) => { updated = args; return { success: true }; };

  const auth = {
    personaId: 'PER_117',
    email: 'prueba@sunarp.gob.pe',
    get securityData() { throw new Error('No debe acceder a auth.securityData.'); }
  };
  const result = sandbox._accessRecordUser_(
    auth,
    { persona_id: 'PER_118', active: true },
    'edit'
  );

  assert.equal(result.success, true);
  assert.equal(updated[1], 'persona_id');
  assert.equal(updated[2], 'PER_118');
  assert.equal(fullLoads, 0);
});

test('asignar un rol consulta solo la cuenta, módulo, rol y relaciones necesarias', () => {
  const data = makeSecurityData();
  data.personas.push({
    persona_id: 'PER_118',
    nombres: 'Ana',
    apellidos: 'Zeta',
    correo_institucional: 'ana.zeta@sunarp.gob.pe'
  });
  data.usuarios.push({ persona_id: 'PER_118', active: true });
  const sandbox = createAdapterSandbox(data);
  let fullLoads = 0;
  sandbox._accessLoadSecurityData_ = () => {
    fullLoads++;
    throw new Error('No debe cargarse el conjunto completo de tablas de seguridad.');
  };
  sandbox._accessRunAudited_ = (auth, event, execute) => execute().value;
  sandbox._accessFindPersonById_ = personaId => ({
    persona_id: personaId, nombres: 'Ana', apellidos: 'Zeta'
  });
  let sync = null;
  sandbox.SUNARPCore.syncRecordsByKey = (...args) => {
    sync = args;
    return { success: true, inserted: 1, updated: 0, deactivated: 0, totalActive: 1 };
  };

  const auth = {
    personaId: 'PER_117',
    email: 'prueba@sunarp.gob.pe',
    get securityData() { throw new Error('No debe acceder a auth.securityData.'); }
  };
  sandbox._accessRequirePermission_ = () => auth;
  const result = sandbox.saveAccessUserRole(
    { persona_id: 'PER_118', modulo_id: 'MOD_INFO_PERSONAL', rol_id: 'ROL_EDITOR', active: true }
  );
  assert.equal(result.success, true);
  assert.equal(sync[1].persona_id, 'PER_118');
  assert.equal(sync[1].modulo_id, 'MOD_INFO_PERSONAL');
  assert.equal(fullLoads, 0);
});

test('las mutaciones administrativas ya no acceden al snapshot diferido auth.securityData', () => {
  for (const [startName, endName] of [
    ['function _accessRecordUser_(', 'function saveAccessUser('],
    ['function saveAccessUserRole(', 'function saveAccessRole('],
    ['function saveAccessRole(', 'function saveAccessPermission('],
    ['function saveAccessPermission(', 'function saveRolePermissions('],
    ['function saveRolePermissions(', 'function saveAccessScopes('],
    ['function saveAccessScopes(', 'function saveAccessUserConfiguration('],
    ['function saveAccessUserConfiguration(', 'function _accessLoadSecurityRecords_('],
    ['function _accessChangeStatus_(', 'function setAccessUserStatus(']
  ]) {
    const start = accessSource.indexOf(startName);
    const end = accessSource.indexOf(endName, start + 1);
    assert.ok(start >= 0 && end > start, startName + ' debe existir con límites válidos.');
    assert.doesNotMatch(accessSource.slice(start, end), /auth\.securityData/);
  }
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
      tipo_ambito_id: 'SEDE',
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
      operacion_id: 'VER',
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
      tipo_ambito_id: 'SEDE',
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

test('el editor puede consultar accesos existentes de una cuenta objetivo inactiva', () => {
  const base = makeSecurityData();
  const data = makeSecurityData({
    usuarios: [
      { persona_id: 'PER_117', active: true },
      { persona_id: 'PER_118', active: false }
    ],
    usuarioRol: base.usuarioRol.concat(base.usuarioRol.map(item => Object.assign({}, item, { persona_id: 'PER_118' }))),
    ambitosAcceso: base.ambitosAcceso.concat(base.ambitosAcceso.map(item => Object.assign({}, item, { persona_id: 'PER_118' })))
  });
  const sandbox = createAdapterSandbox(data);
  const configuration = sandbox.getAccessUserConfiguration('PER_118');
  assert.equal(configuration.userRoles.length, 2);
  assert.equal(configuration.scopes.length, 2);
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

test('el bootstrap difiere catálogos organizacionales y el editor los carga en una sola lectura cacheada por generación', () => {
  const data = makeSecurityData({
    sedes: [{ id: 'SITE_1', name: 'Lima', active: true }],
    securityOrg: [{ id: 'ORG_1', sede_id: 'SITE_1', name: 'Sede Central', active: true }],
    locales: [{ id: 'LOC_1', sede_id: 'SITE_1', name: 'Local Lima', active: true }],
    tipos_estructura: [{ id: 'TYPE_1', name: 'Oficina', active: true }],
    estructura_local: [{ id: 'REL_1', estructura_id: 'ORG_1', local_id: 'LOC_1', active: true }]
  });
  const sandbox = createAdapterSandbox(data);
  const reads = [];
  const originalList = sandbox.SUNARPCore.listRecordsFromSourcesCached;
  const cache = new Map();
  sandbox.SUNARPCore.getOrBuildCachedValue = (key, sources, builder, ttl) => {
    const cacheKey = String(key);
    if (cache.has(cacheKey)) return { value: cache.get(cacheKey), cacheHit: true, cacheStored: true };
    const value = builder();
    cache.set(cacheKey, value);
    return { value, cacheHit: false, cacheStored: true };
  };
  sandbox.SUNARPCore.listRecordsFromSourcesCached = (requests, ttl) => {
    reads.push(requests.map(request => request.source.sourceKey + ':' + request.source.sheetName));
    return originalList(requests, ttl);
  };
  const view = sandbox.getAccessManagementData();
  assert.equal(view.users.length, 0);
  assert.equal(view.userRoles.length, 0);
  assert.equal(view.scopes.length, 0);
  assert.ok(reads.flat().includes('SECURITY:Modulos'));
  assert.ok(reads.flat().includes('SECURITY:Roles'));
  assert.ok(reads.flat().includes('SECURITY:TiposAmbito'));
  assert.ok(reads.flat().includes('SECURITY:Sedes'));
  assert.doesNotMatch(reads.flat().join('|'), /EstructuraOrg|DIRECTORY:locales|tipos_estructura|estructura_local|Usuarios|UsuarioRol|Permisos|RolPermiso|AmbitosAcceso|Operaciones/);
  assert.equal(view.catalogs.sedes.length, 1);
  assert.equal(view.catalogs.estructuraOrg.length, 0);
  assert.equal(view.scopeCatalogsLoaded, false);

  const scopeCatalogs = sandbox.getAccessScopeCatalogs();
  assert.equal(scopeCatalogs.sedes.length, 1);
  assert.equal(scopeCatalogs.estructuraOrg.length, 1);
  assert.equal(scopeCatalogs.locales.length, 1);
  assert.equal(scopeCatalogs.tiposEstructura.length, 1);
  assert.equal(scopeCatalogs.estructuraLocal.length, 1);
  const scopeReads = reads.filter(batch => batch.includes('DIRECTORY:estructura_local'));
  assert.equal(scopeReads.length, 1, 'El editor agrupa las cinco fuentes organizacionales en una lectura.');
  assert.equal(JSON.stringify(Array.from(scopeReads[0]).sort()), JSON.stringify([
    'DIRECTORY:estructura_local',
    'DIRECTORY:locales',
    'DIRECTORY:tipos_estructura',
    'SECURITY:EstructuraOrg',
    'SECURITY:Sedes'
  ].sort()));

  const callsBeforeSecondOpen = reads.length;
  const second = sandbox.getAccessScopeCatalogs();
  assert.equal(second.estructuraLocal.length, 1);
  assert.equal(reads.length, callsBeforeSecondOpen, 'La segunda apertura debe reutilizar la vista por generación.');
});
test('la configuración del editor consulta solo las relaciones de la persona seleccionada', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const calls = [];
  const listReads = [];
  const original = sandbox.SUNARPCore.findRecordsByFields;
  const originalList = sandbox.SUNARPCore.listRecordsFromSourcesCached;
  sandbox.SUNARPCore.findRecordsByFields = (source, filters, options) => {
    calls.push({ sheet: source.sheetName, filters, projectionFields: options.projectionFields });
    return original(source, filters, options);
  };
  sandbox.SUNARPCore.listRecordsFromSourcesCached = requests => {
    requests.forEach(item => listReads.push(item.source.sheetName));
    return originalList(requests);
  };
  const configuration = sandbox.getAccessUserConfiguration('PER_117');
  assert.equal(configuration.userRoles.length, 2);
  assert.equal(configuration.scopes.length, 2);
  const roleCall = calls.find(item => item.sheet === 'UsuarioRol' && item.filters.persona_id === 'PER_117');
  const scopeCall = calls.find(item => item.sheet === 'AmbitosAcceso' && item.filters.persona_id === 'PER_117');
  assert.ok(roleCall);
  assert.ok(scopeCall);
  assert.equal(roleCall.projectionFields.join(','), 'persona_id,modulo_id,rol_id,active');
  assert.equal(
    scopeCall.projectionFields.join(','),
    'persona_id,modulo_id,tipo_ambito_id,referencia_id,incluir_descendientes,active'
  );
  assert.deepEqual(listReads, ['Modulos']);
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
  assert.match(accessSource, /SUNARPCore\.resolveIdentity\(/);
  assert.match(accessSource, /resolveAuthorizationContext\(\s*\{\s*personaId,/);
  assert.match(accessSource, /userRoles:\s*data\.usuarioRol/);
  assert.doesNotMatch(accessSource, /user\.rol_id/);
  assert.doesNotMatch(accessSource, /users:\s*Object\.freeze\(\[[^\]]*correo_institucional/);
  assert.doesNotMatch(accessSource, /scopeEmail|scopeEmailField/);
});

test('Directorio exige modulo_id explícito y pasa local_id para ámbitos LOCAL', () => {
  assert.match(directorySource, /const moduleId = 'MOD_INFO_PERSONAL';[\s\S]*?const requiredPermissionCode = permissionCode \|\| 'INFORMACION_PERSONAL_VER';[\s\S]*?requirePermission_\(requiredPermissionCode, moduleId\)/s);
  assert.match(directorySource, /permissionCode: requiredPermissionCode/);
  const buildViewStart = directorySource.indexOf('function _directoryBuildView_(');
  const buildViewEnd = directorySource.indexOf('function _directorySortAssignments_(', buildViewStart);
  const buildViewSource = directorySource.slice(buildViewStart, buildViewEnd);
  assert.match(buildViewSource, /const record = \{[\s\S]*?estructura_id:\s*location\.estructura_id[\s\S]*?local_id:\s*item\.local_id[\s\S]*?\};[\s\S]*?_accessRecordIsAllowed_\([\s\S]*?\n\s*record,/s);
  assert.match(directorySource, /{ sede_id: _directoryKey_\(local\.sede_id\), local_id: _directoryKey_\(local\.id\) }/);
});

test('la interfaz administra roles y ámbitos mediante persona_id y modulo_id', () => {
  assert.match(accessUiSource, /capabilities\.userRoles/);
  assert.match(accessUiSource, /rpc\('saveAccessUserConfiguration',\s*\{/s);
  assert.match(accessUiSource, /ambitos:\s*\(item\.ambitos \|\| \[\]\)\.map/);
  assert.match(accessUiSource, /scopeTypeOptions = \(state\.data\.scopeTypes \|\| \[\]\)\.map/);
  assert.match(accessUiSource, /type === 'LOCAL'/);
  assert.match(appSource, /_accessIsGlobalAdministrator_\(auth\)\s*\|\|\s*hasPermission_\(auth, 'AUDITORIA_VER'\)/);
  assert.doesNotMatch(accessUiSource, /row\.estado|item\.estado|correo_original|estructura_org_id/);
});

test('Agregar acceso incorpora directamente el ámbito seleccionado sin acción intermedia', () => {
  assert.doesNotMatch(accessUiSource, /Agregar ámbito|function addScope\(\)/);
  assert.match(accessUiSource, /Selecciona un ámbito \(opcional\)/);
  assert.match(accessUiSource, /let collectScopes = \(\) =>/);
  assert.match(accessUiSource, /collectScopes = function \(\)/);
  assert.match(accessUiSource, /nextScopes\.push\(\{[\s\S]*?tipo_ambito_id: type,[\s\S]*?referencia_id: referenceId/);
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

  const referenceStart = accessUiSource.indexOf('function updateReferenceOptions() {');
  const referenceEnd = accessUiSource.indexOf('function paintScopes()', referenceStart);
  assert.ok(referenceStart >= 0 && referenceEnd > referenceStart);
  const referenceOptions = accessUiSource.slice(referenceStart, referenceEnd);
  assert.ok(referenceOptions.includes("if (!['SEDE', 'LOCAL', 'ESTRUCTURA_ORG'].includes(type))"));
  assert.ok(referenceOptions.includes('String(item.sede_id) === siteId'));
  assert.ok(referenceOptions.includes("selectedReferenceId = type === 'SEDE'"));
  assert.ok(referenceOptions.includes("else if (type === 'LOCAL')"));
  assert.ok(referenceOptions.includes('selectedReferenceId = localId;'));
  assert.ok(referenceOptions.includes('renderStructureLevels(localId, levelsHost, selectedChain, type)'));
  const levelsStart = accessUiSource.indexOf('function renderStructureLevels(');
  const levelsEnd = accessUiSource.indexOf('function updateReferenceOptions()', levelsStart);
  assert.ok(levelsStart >= 0 && levelsEnd > levelsStart);
  const hierarchyLevels = accessUiSource.slice(levelsStart, levelsEnd);
  assert.ok(hierarchyLevels.includes("if (type === 'SEDE')"));
  assert.ok(hierarchyLevels.includes('selectedReferenceId = selectedSiteReferenceId;'));
  assert.ok(hierarchyLevels.includes("else if (type === 'LOCAL')"));
  assert.ok(hierarchyLevels.includes('selectedReferenceId = String(localId);'));
  assert.ok(hierarchyLevels.includes('selectedReferenceId = selectedChain.length'));
  assert.match(accessUiSource, /String\(item\.parent_id \|\| ''\) === String\(selectedId\)/);
  assert.doesNotMatch(referenceOptions, /sedeName\(item\.sede_id\) \+ ' — ' \+ item\.name/);
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
  assert.doesNotMatch(accessSource, /ACCESS_PERMISSION_OPERATIONS/);
  assert.match(accessSource, /ACCESS_MANAGEMENT_CONFIG\.sheets\.operations/);
  assert.match(accessSource, /ACCESS_MANAGEMENT_FIELDS\.operations/);
  assert.match(accessSource, /operacion_id/);
});

test('el listado de usuarios se consulta al seleccionar un filtro y admite Todas las sedes explícitamente', () => {
  assert.match(accessSource, /users:\s*\[\]/);
  assert.match(accessSource, /function getAccessUsers\(filters\)/);
  assert.match(accessSource, /const allSitesSelected = filters\.all_sedes === true/);
  assert.match(accessSource, /if \(!sedeId && !roleId && !allSitesSelected\) return \{ items: \[\], total: 0 \}/);
  assert.match(accessSource, /access-users-index-v4/);
  assert.match(accessSource, /matchingRows = indexed\.value\.rows\.filter/);
  assert.match(accessSource, /SUNARPCore\.queryRecords/);
  assert.doesNotMatch(accessSource, /access-users-index-v1/);
  assert.match(accessUiSource, /createField\('Sede', siteSelect\)/);
  assert.match(accessUiSource, /createField\('Rol', roleSelect\)/);
  assert.match(accessUiSource, /rpc\('getAccessUsers'/);
  assert.match(accessUiSource, /all_sedes: allSitesSelected/);
  assert.match(accessUiSource, /siteSelect\.addEventListener\('change', loadFilteredUsers\)/);
  assert.match(accessUiSource, /roleSelect\.addEventListener\('change', loadFilteredUsers\)/);
  assert.doesNotMatch(accessUiSource, /loadFilteredUsers\(true\)/);
  assert.doesNotMatch(accessUiSource, /applyButton/);
  assert.match(accessUiSource, /searchPlaceholder: 'Buscar por nombre o correo institucional/);
  assert.match(accessUiSource, /mode: 'server'/);
});

test('las pestañas de permisos y asignaciones cargan sus datos al abrirse y conservan la selección', () => {
  assert.match(accessUiSource, /tabDataLoaded: \{ permissions: false, assignments: false, operations: false \}/);
  assert.match(accessUiSource, /permissions: async \(\) => \{/);
  assert.match(accessUiSource, /assignments: async \(\) => \{/);
  assert.match(accessUiSource, /state\.tabDataLoaded\[tabId\] = true/);
  assert.match(accessUiSource, /state\.selectedAssignmentRoleId/);
});

test('la búsqueda de persona muestra un loader transparente dentro del formulario modal', () => {
  assert.match(accessUiSource, /function beginElementLoading\(target, message\)/);
  assert.match(accessUiSource, /beginElementLoading\(\s*form,/);
  assert.match(accessUiSource, /access-element-loader/);
  assert.match(viewSource, /\.access-element-loader\s*\{/);
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
  assert.match(accessUiSource, /const moduleSelect = createSelect\(/);
  assert.match(accessUiSource, /'Selecciona un módulo'/);
  assert.match(accessUiSource, /label: 'Todos los módulos'/);
  assert.match(accessUiSource, /moduleSelect\.addEventListener\('change', renderPermissionTable\)/);
  assert.doesNotMatch(accessUiSource.slice(
    accessUiSource.indexOf('function renderPermissions(host)'),
    accessUiSource.indexOf('function renderOperations(host)')
  ), /filters:\s*\[/);
  assert.match(accessUiSource, /function renderOperations\(host\)/);
  assert.match(accessUiSource, /operations: renderOperations/);
  assert.match(accessUiSource, /function renderScopeTypes\(host\)/);
  assert.match(accessUiSource, /scopeTypes: renderScopeTypes/);
  assert.match(accessUiSource, /Buscar operación/);
  assert.match(accessUiSource, /permission\.operacion_nombre \|\| permission\.operacion_id/);
  assert.match(accessUiSource, /row\.operacion_nombre \|\| row\.operacion_id/);
  assert.match(accessSource, /function _accessScopeType_\(data, typeId\)/);
  assert.match(accessSource, /function migrateAccessManagementSchema\(\)/);
  assert.match(accessSource, /typeIdsByName/);
  assert.match(accessUiSource, /Seleccionar todo el bloque/);
  assert.match(accessUiSource, /groupToggle\.indeterminate/);
  assert.match(accessUiSource, /groupToggle\.checked = checkboxes\.length > 0/);
});

test('las actualizaciones usan loader local y el acceso inicial loader global blanco', () => {
  assert.match(accessUiSource, /function refreshCurrentTabData\(showNotification\)/);
  assert.match(accessUiSource, /getAccessManagementTabData', 'roles'/);
  assert.match(accessUiSource, /getAccessManagementTabData', 'permissions'/);
  assert.match(accessUiSource, /getAccessManagementTabData', 'assignments'/);
  assert.match(accessUiSource, /state\.table\.refresh\(\)/);
  assert.match(accessUiSource, /function beginAccessPanelLoading\(/);
  assert.match(accessUiSource, /const finish = SUNARPUI\.beginLoading\(\)/);
  assert.doesNotMatch(accessUiSource, /backdrop: 'translucent'/);
  assert.doesNotMatch(viewSource, /sunarp-loader\.is-translucent/);
  assert.doesNotMatch(accessUiSource, /accessRefreshButton/);
});


test('TiposAmbito es un catálogo cerrado con cuatro tipos y semántica fija', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const data = makeSecurityData();
  assert.doesNotThrow(() => sandbox._accessValidateSnapshot_(data));

  const extraType = makeSecurityData({
    tiposAmbito: data.tiposAmbito.concat([{
      tipo_ambito_id: 'REGIONAL', nombre: 'Regional', descripcion: 'No soportado',
      entidad_referencia: 'SEDE', requiere_referencia: true,
      permite_descendientes: false, active: true
    }])
  });
  assert.throws(() => sandbox._accessValidateSnapshot_(extraType), /tipo no admitido/i);

  const alteredSemantics = makeSecurityData({
    tiposAmbito: data.tiposAmbito.map(item => item.tipo_ambito_id === 'TOTAL'
      ? Object.assign({}, item, { entidad_referencia: 'SEDE', requiere_referencia: true })
      : item
    )
  });
  assert.throws(() => sandbox._accessValidateSnapshot_(alteredSemantics), /no coincide con el modelo admitido/i);
});

test('Permisos valida operacion_id contra el catálogo Operaciones', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const data = makeSecurityData();
  data.permisos[0].operacion_id = 'NO_EXISTE';
  assert.throws(() => sandbox._accessValidateSnapshot_(data), /operacion_id inexistente/i);
});

test('el gestor no conserva nombres de columnas anteriores ni catálogos fijos', () => {
  assert.doesNotMatch(accessSource, /\\.operacion\\b|\\boperacion\\s*:/);
  assert.doesNotMatch(accessSource, /\\.tipo_ambito\\b|\\btipo_ambito\\s*:/);
  assert.doesNotMatch(accessUiSource, /\\.operacion\\b|\\boperacion\\s*:/);
  assert.doesNotMatch(accessUiSource, /\\.tipo_ambito\\b|\\btipo_ambito\\s*:/);
  assert.match(accessSource, /tipo_ambito_id/);
  assert.match(accessSource, /operacion_id/);
});


test('la migración transforma columnas antiguas sin perder referencias y no altera Operaciones', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const scopeRows = [
    { rowNumber: 2, get: field => ({ tipo_ambito: 'TOTAL' }[field] || '') },
    { rowNumber: 3, get: field => ({ tipo_ambito: 'SEDE' }[field] || '') }
  ];
  const scopePlan = sandbox._accessMigrationPrepareColumn_({
    sheet: {}, sheetName: 'AmbitosAcceso', headers: ['persona_id', 'tipo_ambito'],
    lastColumn: 2, records: scopeRows
  }, 'tipo_ambito_id', 'tipo_ambito', value => {
    const id = String(value || '').trim().toUpperCase();
    if (!['TOTAL', 'SEDE', 'ESTRUCTURA_ORG', 'LOCAL'].includes(id)) throw new Error('invalid type');
    return id;
  });
  assert.equal(scopePlan.createHeader, true);
  assert.equal(scopePlan.targetColumn, 3);
  assert.deepEqual(scopePlan.updates.map(item => item.value), ['TOTAL', 'SEDE']);

  assert.match(accessSource, /function migrateAccessManagementSchema\(\)/);
  assert.match(accessSource, /function _accessMigrationAssertAdministrator_/);
  const migrationStart = accessSource.indexOf('function migrateAccessManagementSchema()');
  const migrationImplementation = accessSource.slice(migrationStart);
  assert.match(migrationImplementation, /SUNARPCore\.runSourceWriteBatch\(affectedSources, markWriteStarted =>/);
  assert.doesNotMatch(migrationImplementation, /LockService\.getScriptLock\(\)/);
  assert.doesNotMatch(migrationImplementation, /SpreadsheetApp\.flush\(\)/);
  assert.match(accessSource, /function _accessMigrationWriteColumn_\(plan, markWriteStarted\)/);
  assert.match(accessSource, /function _accessMigrationEnsureScopeTypes_\(spreadsheet, markWriteStarted\)/);
  assert.match(accessSource, /_accessMigrationEnsureScopeTypes_\(spreadsheet,\s*markWriteStarted\)/);
  assert.match(accessSource, /ACCESS_SCHEMA_MIGRATION_SCOPE_ROWS/);
  assert.match(accessSource, /operacion_id.*nombre/);
  assert.doesNotMatch(
    accessSource.slice(accessSource.indexOf('function migrateAccessManagementSchema()')),
    /getSheetByName\(['"]Operaciones['"]\)[\s\S]{0,500}\.setValue\(/,
    'la migración no debe escribir valores ni modificar el catálogo Operaciones'
  );
});


test('la actualización de Asignación de permisos usa claves reales de la instantánea de seguridad', () => {
  const start = accessSource.indexOf("if (tab === 'assignments')");
  const end = accessSource.indexOf("if (tab === 'operations')", start);
  assert.ok(start >= 0 && end > start);
  const endpoint = accessSource.slice(start, end);
  assert.match(endpoint, /const catalogs = SUNARPCore\.listRecordsFromSourcesCached\(\[/);
  assert.match(endpoint, /key: 'modules'/);
  assert.match(endpoint, /key: 'permissions'/);
  assert.match(endpoint, /key: 'rolePermissions'/);
  assert.doesNotMatch(endpoint, /_accessLoadSecurityRecords_\(/);
  assert.match(endpoint, /modules: modules\.map/);
  assert.match(endpoint, /permissions: permissions\.map/);
  assert.match(endpoint, /rolePermissions: rolePermissions\.map/);
});


test('el historial de un permiso deduplica eventos encontrados por ID y por snapshots sin perder el orden ni el total', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  const direct = [
    {
      evento_id: 'EVT_001',
      fecha_hora: new Date('2026-11-20T09:00:00Z'),
      tipo_entidad: 'PERMISO',
      registro_id: 'PERM_001',
      modulo: 'ACCESOS',
      datos_antes: '',
      datos_despues: ''
    },
    {
      evento_id: 'EVT_002',
      fecha_hora: new Date('2026-11-20T10:00:00Z'),
      tipo_entidad: 'ROL_PERMISO',
      registro_id: 'ROL_001',
      modulo: 'ACCESOS',
      datos_antes: '[]',
      datos_despues: JSON.stringify([{ permiso_id: 'PERM_001' }])
    }
  ];
  const related = [
    direct[1],
    {
      evento_id: 'EVT_003',
      fecha_hora: new Date('2026-11-20T11:00:00Z'),
      tipo_entidad: 'ROL_PERMISO',
      registro_id: 'ROL_002',
      modulo: 'ACCESOS',
      datos_antes: '[]',
      datos_despues: JSON.stringify([{ permiso_id: 'PERM_001' }])
    },
    {
      evento_id: 'EVT_004',
      fecha_hora: new Date('2026-11-20T12:00:00Z'),
      tipo_entidad: 'ROL_PERMISO',
      registro_id: 'ROL_003',
      modulo: 'ACCESOS',
      datos_antes: '[]',
      datos_despues: JSON.stringify([{ permiso_id: 'PERM_999' }])
    }
  ];
  sandbox.SUNARPCore.findRecordsByFields = () => ({ records: direct, total: direct.length });
  sandbox.SUNARPCore.searchRecordsByFields = () => ({ records: related, total: related.length });

  const result = sandbox.getAccessEntityHistory({
    tipo_entidad: 'PERMISO',
    registro_id: 'PERM_001',
    page: 2,
    pageSize: 1
  });
  assert.equal(result.total, 3);
  assert.equal(result.totalPages, 3);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].evento_id, 'EVT_002');
});


test('el contexto de autorización se cachea por identidad y depende de todas las fuentes de seguridad', () => {
  const source = accessSource.slice(
    accessSource.indexOf('function _accessGetAuthContext_()'),
    accessSource.indexOf('function getAuthContext_()')
  );
  assert.match(source, /getOrBuildCachedValue/);
  assert.match(source, /Authorization context cache/);
  assert.match(source, /access-auth-context:v1:/);
  assert.match(source, /_accessDirectorySource_\(sheets\.people\)/);
  for (const sheet of ['users', 'modules', 'roles', 'userRoles', 'permissions', 'rolePermissions', 'scopes']) {
    assert.match(source, new RegExp('_accessSecuritySource_\\(sheets\\.' + sheet + '\\)'));
  }
  assert.match(source, /_accessBuildAuthContext_\(email\),\s*3600\s*\)/);
});

test('la autorización ordinaria consulta solo relaciones activas y proyecta los campos mínimos de seguridad', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const calls = [];
  const originalFind = sandbox.SUNARPCore.findRecordsByFields;
  sandbox.SUNARPCore.findRecordsByFields = (source, filters, options) => {
    calls.push({
      sheet: source.sheetName,
      filters: Object.assign({}, filters),
      projectionFields: options && options.projectionFields
    });
    return originalFind(source, filters, options);
  };

  const data = sandbox._accessLoadAuthorizationData_('PER_117');
  assert.equal(data.usuarios.length, 1);
  assert.equal(data.usuarioRol.length, 2);
  assert.equal(data.ambitosAcceso.length, 2);
  assert.ok(calls.length >= 6);
  for (const sheet of ['UsuarioRol', 'AmbitosAcceso', 'Roles', 'RolPermiso', 'Permisos']) {
    const call = calls.find(item => item.sheet === sheet);
    assert.ok(call, 'Debe consultar ' + sheet);
    assert.equal(call.filters.active, true, sheet + ' debe limitar la lectura a relaciones activas');
    assert.ok(Array.isArray(call.projectionFields), sheet + ' debe declarar una proyección mínima');
  }
  const userRoleCall = calls.find(item => item.sheet === 'UsuarioRol');
  assert.equal(
    userRoleCall.projectionFields.join(','),
    'persona_id,modulo_id,rol_id,active'
  );
  assert.equal(calls.some(item => item.sheet === 'Usuarios' && item.filters.active === true), false);
});



test('las validaciones de ámbitos consultan referencias puntuales y respetan las dos réplicas organizacionales', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const calls = [];
  sandbox.SUNARPCore.findRecordsByFields = (source, filters, options) => {
    calls.push({
      sourceKey: source.sourceKey,
      sheetName: source.sheetName,
      filterIds: Array.from(filters.id),
      searchField: options.searchField
    });
    return {
      records: Array.from(filters.id, id => ({ id, active: true, sede_id: 'SITE_1' })),
      total: filters.id.length
    };
  };

  sandbox._accessFindOrgCatalogByIds_('SEDE', ['SITE_1', 'SITE_1']);
  sandbox._accessFindOrgCatalogByIds_('ESTRUCTURA_ORG', ['ORG_1']);
  sandbox._accessFindOrgCatalogByIds_('LOCAL', ['LOCAL_1']);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].sheetName, 'Sedes');
  assert.equal(calls[1].sheetName, 'EstructuraOrg');
  assert.equal(calls[2].sheetName, 'locales');
  assert.equal(calls[0].filterIds.join(','), 'SITE_1');
  assert.ok(calls.every(call => call.searchField === 'id'));

  const start = accessSource.indexOf('function saveAccessScopes(');
  const end = accessSource.indexOf('function saveAccessUserConfiguration(', start);
  const saveScopesSource = accessSource.slice(start, end);
  assert.ok(saveScopesSource.includes('_accessFindOrgCatalogByIds_'));
  assert.ok(!saveScopesSource.includes('_accessOrgCatalog_'));
});

test('el historial de auditoría combina actor, módulo, acción, resultado, registro y fechas con total y orden exactos', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  const event = (id, date, actor, action, result, module, recordId, detail) => ({
    evento_id: id,
    fecha_hora: new Date(date),
    actor_correo: actor,
    actor_nombre: actor === 'ana@sunarp.gob.pe' ? 'Ana' : 'Bruno',
    accion: action,
    modulo: module,
    tipo_entidad: 'USUARIO',
    registro_id: recordId,
    registro_nombre: 'Persona',
    resultado: result,
    detalle: detail,
    datos_antes: '',
    datos_despues: '',
    ambito_modulo: '',
    ambito_tipo: '',
    ambito_referencia_id: ''
  });
  const candidates = [
    event('EVT_10', '2026-11-19T10:00:00Z', 'ana@sunarp.gob.pe', 'ACTUALIZAR', 'OK', 'ACCESOS', 'PER_117', 'Actualización correcta'),
    event('EVT_11', '2026-11-19T12:00:00Z', 'ana@sunarp.gob.pe', 'ACTUALIZAR', 'OK', 'ACCESOS', 'PER_117', 'Actualización correcta'),
    event('EVT_12', '2026-11-19T13:00:00Z', 'ana@sunarp.gob.pe', 'CREAR', 'OK', 'ACCESOS', 'PER_117', 'Actualización correcta'),
    event('EVT_13', '2026-11-18T13:00:00Z', 'ana@sunarp.gob.pe', 'ACTUALIZAR', 'OK', 'ACCESOS', 'PER_117', 'Actualización correcta'),
    event('EVT_14', '2026-11-19T14:00:00Z', 'ana@sunarp.gob.pe', 'ACTUALIZAR', 'ERROR', 'ACCESOS', 'PER_117', 'Actualización fallida'),
    event('EVT_15', '2026-11-19T15:00:00Z', 'bruno@sunarp.gob.pe', 'ACTUALIZAR', 'OK', 'ACCESOS', 'PER_117', 'Actualización correcta'),
    event('EVT_16', '2026-11-19T16:00:00Z', 'ana@sunarp.gob.pe', 'ACTUALIZAR', 'OK', 'DIRECTORIOS', 'PER_117', 'Actualización correcta'),
    event('EVT_17', '2026-11-19T17:00:00Z', 'ana@sunarp.gob.pe', 'ACTUALIZAR', 'OK', 'ACCESOS', 'PER_999', 'Actualización correcta')
  ];
  let search = null;
  let fullReads = 0;
  sandbox.SUNARPCore.searchRecordsByFields = (source, query, fields, options) => {
    search = { source: source.sheetName, query, fields: Array.from(fields), matchCase: options.matchCase };
    return { records: candidates, total: candidates.length };
  };
  sandbox.SUNARPCore.listRecordsFromSourcesCached = () => {
    fullReads++;
    throw new Error('No debe leerse toda Auditoria para filtros combinados.');
  };

  const result = sandbox.getAccessAuditHistory({
    actor: 'ana@sunarp.gob.pe',
    modulo: 'ACCESOS',
    accion: 'ACTUALIZAR',
    resultado: 'OK',
    registro_id: 'PER_117',
    search: 'actualización',
    desde: '2026-11-19',
    hasta: '2026-11-19',
    page: 2,
    pageSize: 1
  });

  assert.equal(search.source, 'Auditoria');
  assert.equal(search.query, 'ana@sunarp.gob.pe');
  assert.equal(search.fields.join(','), 'actor_correo');
  assert.equal(search.matchCase, false);
  assert.equal(result.total, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].evento_id, 'EVT_10');
  assert.equal(fullReads, 0);
});

test('el historial por rango temporal devuelve página vacía y total cero sin recurrir a lectura integral', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  let request = null;
  let fullReads = 0;
  sandbox.SUNARPCore.listTailRecords = (source, options) => {
    request = { sheet: source.sheetName, options };
    return { records: [], total: 0 };
  };
  sandbox.SUNARPCore.listRecordsFromSourcesCached = () => {
    fullReads++;
    throw new Error('No debe leerse toda Auditoria para un rango temporal.');
  };

  const result = sandbox.getAccessAuditHistory({
    desde: '2026-11-19',
    hasta: '2026-11-19',
    page: 3,
    pageSize: 10
  });

  assert.equal(request.sheet, 'Auditoria');
  assert.ok(Number.isFinite(request.options.fromDate.getTime()));
  assert.ok(Number.isFinite(request.options.toDate.getTime()));
  assert.equal(request.options.offset, 20);
  assert.equal(request.options.limit, 10);
  assert.equal(result.total, 0);
  assert.equal(result.totalPages, 1);
  assert.equal(result.items.length, 0);
  assert.equal(fullReads, 0);
});


test('el editor de usuarios solicita catálogos de ámbito de forma diferida y una sola vez', () => {
  const editor = accessUiSource.slice(
    accessUiSource.indexOf('async function openUserModal(row)'),
    accessUiSource.indexOf('function renderActiveTab(', accessUiSource.indexOf('async function openUserModal(row)'))
  );
  assert.match(editor, /state\.data\.capabilities\.scopes === true/);
  assert.match(editor, /state\.data\.scopeCatalogsLoaded !== true/);
  assert.match(editor, /rpc\('getAccessScopeCatalogs'\)/);
  assert.match(editor, /state\.data\.scopeCatalogsLoaded = true/);
});

test('CRUD de roles y permisos consulta únicamente las claves necesarias, sin cargar catálogos completos', () => {
  const roleStart = accessSource.indexOf('function saveAccessRole(');
  const roleEnd = accessSource.indexOf('function saveAccessPermission(', roleStart);
  const permissionStart = roleEnd;
  const permissionEnd = accessSource.indexOf('function saveRolePermissions(', permissionStart);
  assert.ok(roleStart >= 0 && roleEnd > roleStart && permissionEnd > permissionStart);
  const roleCrud = accessSource.slice(roleStart, roleEnd);
  const permissionCrud = accessSource.slice(permissionStart, permissionEnd);
  assert.doesNotMatch(roleCrud, /_accessLoadSecurityRecords_\s*\(/);
  assert.doesNotMatch(permissionCrud, /_accessLoadSecurityRecords_\s*\(/);
  assert.match(roleCrud, /_accessFindSecurityRecords_\s*\(\s*rolesSheet\s*,\s*'nombre'/);
  assert.match(permissionCrud, /_accessGenerateUniqueIdentifierFromSource_/);
});

test('la generación de ID administrativo detecta colisiones mediante búsquedas exactas', () => {
  const data = makeSecurityData();
  data.roles.push({ rol_id: 'ROL_EDITOR', nombre: 'Editor', descripcion: '', active: true });
  const sandbox = createAdapterSandbox(data);
  const lookups = [];
  const originalFind = sandbox.SUNARPCore.findRecordsByFields;
  sandbox.SUNARPCore.findRecordsByFields = (source, filters, options) => {
    lookups.push({ sheetName: source.sheetName, filters, options });
    return originalFind(source, filters, options);
  };
  const generated = sandbox._accessGenerateUniqueIdentifierFromSource_(
    'Roles', 'ROL_', 'Editor', 'rol_id', ['rol_id', 'nombre', 'active'], 50
  );
  assert.equal(generated, 'ROL_EDITOR_2');
  assert.deepEqual(lookups.map(item => item.filters.rol_id), ['ROL_EDITOR', 'ROL_EDITOR_2']);
  assert.ok(lookups.every(item => item.options.matchCase === false));
});

test('la edición conjunta de accesos consulta módulos y roles por los IDs de la persona, no por catálogo completo', () => {
  const start = accessSource.indexOf('function saveAccessUserConfiguration(');
  const end = accessSource.indexOf('function _accessLoadSecurityRecords_(', start);
  assert.ok(start >= 0 && end > start);
  const implementation = accessSource.slice(start, end);
  assert.doesNotMatch(implementation, /_accessLoadSecurityRecords_\s*\(\s*s\.modules/);
  assert.doesNotMatch(implementation, /_accessLoadSecurityRecords_\s*\(\s*s\.roles/);
  assert.match(implementation, /targetUserRoles\.map\(item => _accessText_\(item\.modulo_id\)\)/);
  assert.match(implementation, /targetUserRoles\.map\(item => _accessText_\(item\.rol_id\)\)/);
  assert.match(implementation, /_accessFindSecurityRecords_\s*\(\s*s\.modules/);
  assert.match(implementation, /_accessFindSecurityRecords_\s*\(\s*s\.roles/);
});


test('la continuidad del administrador reutiliza su vista hasta que cambie la generación', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const cache = new Map();
  let builds = 0;
  let lookups = 0;
  const originalFind = sandbox.SUNARPCore.findRecordsByFields;
  sandbox.SUNARPCore.findRecordsByFields = (...args) => {
    lookups++;
    return originalFind(...args);
  };
  sandbox.SUNARPCore.getOrBuildCachedValue = (key, sources, builder, ttl) => {
    assert.equal(key, 'access-admin-continuity:v1');
    assert.equal(ttl, 60);
    assert.ok(sources.some(source => source.sheetName === 'Usuarios'));
    assert.ok(sources.some(source => source.sheetName === 'AmbitosAcceso'));
    if (cache.has(key)) return { value: cache.get(key), cacheHit: true, cacheStored: true };
    builds++;
    const value = builder();
    cache.set(key, value);
    return { value, cacheHit: false, cacheStored: true };
  };
  const first = sandbox._accessLoadAdministratorContinuityData_();
  const firstLookups = lookups;
  const second = sandbox._accessLoadAdministratorContinuityData_();
  assert.equal(builds, 1);
  assert.equal(lookups, firstLookups);
  assert.equal(first.usuarios.length, second.usuarios.length);
  assert.equal(first.usuarioRol.length, second.usuarioRol.length);
});

test('la continuidad del administrador global restringe las relaciones por módulo y permisos críticos', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const calls = [];
  const originalFind = sandbox.SUNARPCore.findRecordsByFields;
  sandbox.SUNARPCore.findRecordsByFields = (source, filters, options) => {
    calls.push({ sheet: source.sheetName, filters });
    return originalFind(source, filters, options);
  };
  const data = sandbox._accessLoadAdministratorContinuityData_();
  assert.equal(data.modulos.length, 1);
  assert.equal(data.usuarioRol.length, 1);
  assert.equal(data.ambitosAcceso.length, 1);
  const permissionQuery = calls.find(call => call.sheet === 'Permisos');
  const rolePermissionQuery = calls.find(call => call.sheet === 'RolPermiso');
  const userRoleQuery = calls.find(call => call.sheet === 'UsuarioRol');
  const scopeQuery = calls.find(call => call.sheet === 'AmbitosAcceso');
  assert.deepEqual(Array.from(permissionQuery.filters.codigo), [
    'USUARIOS_ADMINISTRAR', 'ROLES_ADMINISTRAR',
    'PERMISOS_ADMINISTRAR', 'AMBITOS_ACCESO_ADMINISTRAR'
  ]);
  assert.equal(permissionQuery.filters.modulo_id, 'MOD_ACCESOS');
  assert.equal(rolePermissionQuery.filters.rol_id, 'ROL_ADMIN');
  assert.equal(rolePermissionQuery.filters.permiso_id.length, 4);
  assert.equal(userRoleQuery.filters.modulo_id, 'MOD_ACCESOS');
  assert.equal(scopeQuery.filters.tipo_ambito_id, 'TOTAL');
});

test('la edición conjunta de accesos consulta solo referencias organizacionales seleccionadas', () => {
  const start = accessSource.indexOf('function saveAccessUserConfiguration(');
  const end = accessSource.indexOf('function _accessLoadSecurityRecords_(', start);
  assert.ok(start >= 0 && end > start);
  const implementation = accessSource.slice(start, end);
  assert.doesNotMatch(implementation, /_accessOrgCatalog_\s*\(/);
  assert.match(implementation, /_accessFindOrgCatalogByIds_\s*\(\s*'ESTRUCTURA_ORG'/);
  assert.match(implementation, /_accessFindOrgCatalogByIds_\s*\(\s*'SEDE'/);
  assert.match(implementation, /_accessFindOrgCatalogByIds_\s*\(\s*'LOCAL'/);
});

test('la paginación del historial por entidad reutiliza el índice cacheado y conserva total y orden', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  const rows = [
    { evento_id: 'EVT_001', fecha_hora: new Date('2026-11-20T09:00:00Z'), tipo_entidad: 'USUARIO', registro_id: 'PER_001', modulo: 'ACCESOS' },
    { evento_id: 'EVT_002', fecha_hora: new Date('2026-11-20T11:00:00Z'), tipo_entidad: 'USUARIO_ROL', registro_id: 'PER_001', modulo: 'ACCESOS' },
    { evento_id: 'EVT_003', fecha_hora: new Date('2026-11-20T10:00:00Z'), tipo_entidad: 'AMBITO_ACCESO', registro_id: 'PER_001', modulo: 'ACCESOS' }
  ];
  const cache = new Map();
  let builds = 0;
  let searches = 0;
  sandbox.SUNARPCore.getOrBuildCachedValue = (key, sources, builder, ttl) => {
    assert.equal(sources.length, 1);
    assert.equal(sources[0].sheetName, 'Auditoria');
    assert.equal(ttl, 60);
    if (cache.has(key)) return { value: cache.get(key), cacheHit: true, cacheStored: true };
    builds++;
    const value = builder();
    cache.set(key, value);
    return { value, cacheHit: false, cacheStored: true };
  };
  sandbox.SUNARPCore.findRecordsByFields = () => {
    searches++;
    return { records: rows, total: rows.length };
  };

  const first = sandbox.getAccessEntityHistory({
    tipo_entidad: 'USUARIO', registro_id: 'PER_001', page: 1, pageSize: 1
  });
  const second = sandbox.getAccessEntityHistory({
    tipo_entidad: 'USUARIO', registro_id: 'PER_001', page: 2, pageSize: 1
  });

  assert.equal(first.total, 3);
  assert.equal(second.total, 3);
  assert.equal(first.items[0].evento_id, 'EVT_002');
  assert.equal(second.items[0].evento_id, 'EVT_003');
  assert.equal(builds, 1);
  assert.equal(searches, 1);
});

test('los límites de fecha de auditoría rechazan días inexistentes y conservan el día completo inclusivo', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const from = sandbox._accessAuditDateBound_('2026-11-20', false);
  const to = sandbox._accessAuditDateBound_('2026-11-20', true);
  assert.equal(from.getHours(), 0);
  assert.equal(from.getMinutes(), 0);
  assert.equal(from.getSeconds(), 0);
  assert.equal(from.getMilliseconds(), 0);
  assert.equal(to.getHours(), 23);
  assert.equal(to.getMinutes(), 59);
  assert.equal(to.getSeconds(), 59);
  assert.equal(to.getMilliseconds(), 999);
  assert.throws(
    () => sandbox._accessAuditDateBound_('2026-02-30', false),
    /filtro de fecha de auditoría no es válido/
  );
  assert.throws(
    () => sandbox._accessAuditDateBound_('20/11/2026', true),
    /filtro de fecha de auditoría no es válido/
  );
});

test('el historial filtrado desempata por evento_id y coloca fechas inválidas al final', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  sandbox._accessRequirePermission_ = () => ({ authenticated: true });
  sandbox._accessSecuritySource_ = sheet => ({ sheetName: sheet });
  const sameTime = new Date('2026-11-20T12:00:00Z');
  const rows = [
    { evento_id: 'EVT_001', fecha_hora: sameTime, actor_correo: 'ana@sunarp.gob.pe' },
    { evento_id: 'EVT_003', fecha_hora: new Date('invalid'), actor_correo: 'ana@sunarp.gob.pe' },
    { evento_id: 'EVT_002', fecha_hora: sameTime, actor_correo: 'ana@sunarp.gob.pe' },
    { evento_id: 'EVT_004', fecha_hora: new Date('invalid'), actor_correo: 'ana@sunarp.gob.pe' }
  ];
  sandbox.SUNARPCore.searchRecordsByFields = () => ({ records: rows, total: rows.length });
  const result = sandbox.getAccessAuditHistory({
    actor: 'ana@sunarp.gob.pe', page: 1, pageSize: 10
  });
  assert.deepEqual(
    Array.from(result.items, item => item.evento_id),
    ['EVT_002', 'EVT_001', 'EVT_004', 'EVT_003']
  );
  assert.equal(result.total, 4);
});


test('Administración de accesos no presenta botones manuales de Actualizar y conserva resultados de Usuarios y Auditoría', () => {
  const panelStart = accessUiSource.indexOf('function makeTabPanel(');
  const panelEnd = accessUiSource.indexOf('function destroyTable(', panelStart);
  const panel = accessUiSource.slice(panelStart, panelEnd);
  assert.doesNotMatch(panel, /'Actualizar'/);
  assert.match(accessUiSource, /userPageCache: \{\}/);
  assert.match(accessUiSource, /auditPageCache: \{\}/);
  assert.match(accessUiSource, /state\.userPageCache\[cacheKey\]/);
  assert.match(accessUiSource, /state\.auditPageCache\[cacheKey\]/);
  assert.match(accessUiSource, /No existen usuarios para los filtros seleccionados/);
  assert.match(accessUiSource, /Selecciona una sede o un rol para consultar usuarios/);
});

test('el catálogo de tipos de documento se carga al abrir Nueva cuenta y no en el bootstrap de accesos', () => {
  assert.match(accessUiSource, /needsDocumentTypes = !editing && state\.data\.documentTypesLoaded !== true/);
  assert.match(accessUiSource, /rpc\('getAccessManagementTabData', 'documentTypes'\)/);
  assert.match(accessSource, /if \(tab === 'documenttypes'\)/);
  const bootstrap = accessSource.slice(
    accessSource.indexOf('function getAccessManagementData()'),
    accessSource.indexOf('function getAccessManagementTabData(', accessSource.indexOf('function getAccessManagementData()'))
  );
  assert.doesNotMatch(bootstrap, /_accessLoadDocumentTypes_\(/);
});

test('el contexto del Directorio reutiliza catálogos ensamblados por generación de fuente', () => {
  const start = directorySource.indexOf('function _directoryLoadContext_(options)');
  const end = directorySource.indexOf('function _directoryInvalidateCache_()', start);
  const implementation = directorySource.slice(start, end);
  assert.match(implementation, /getOrBuildCachedValue/);
  assert.match(implementation, /directory-context:v1:/);
  assert.match(implementation, /sources,/);
  assert.match(implementation, /validateSnapshot: false/);
  assert.match(implementation, /_directoryValidateSnapshot_\(context, options\)/);
  assert.match(implementation, /DIRECTORY_CATALOG_CACHE_TTL/);
});

test('Información de personal muestra Local después de Sede y antes de la estructura', () => {
  assert.match(directoryViewSource, /id="directorySedeFilter"/);
  assert.match(directoryViewSource, /id="directoryLocalFilter"/);
  assert.match(directoryViewSource, /id="directoryHierarchyFilters"/);
  assert.ok(directoryViewSource.indexOf('directoryLocalFilter') < directoryViewSource.indexOf('directoryHierarchyFilters'));
  assert.match(directoryViewSource, /id="directoryCargoFilter"/);
  assert.match(directoryUiSource, /localFilter: document\.getElementById\(/);
  assert.match(directoryUiSource, /function populateLocalFilter\(/);
  assert.match(directoryUiSource, /function _directoryGetAccessFilterPlan_/);
  assert.match(directoryUiSource, /function _directoryBuildLocalHierarchyFilterSets_/);
  assert.match(directoryUiSource, /accessPlan\.localMode === 'hidden'/);
  assert.match(directoryUiSource, /accessPlan\.hierarchyMode === 'structure-scope'/);
  assert.match(directoryUiSource, /_directoryBuildHierarchyFilterSets_\(/);
  assert.match(directoryUiSource, /state\.hierarchySelectableIds = _directoryBuildLocalHierarchyFilterSets_/);
  assert.match(directoryUiSource, /recordLocalId = key\(record\.filter_local_id \|\| record\.local_id\)/);
  assert.match(directoryUiSource, /localFilter\.addEventListener\('change'/);
});

test('los cambios de filtro calculan cargos sobre la instantánea local sin nuevas consultas', () => {
  assert.match(directoryUiSource, /getRecordsForFilters\(new Set\(\['cargo'\]\)\)/);
  assert.match(directoryUiSource, /state\.table\.setData\(options\.data\)/);
  assert.match(directoryUiSource, /mode:\s*'client'/);
  assert.doesNotMatch(directoryUiSource, /state\.cargoOptionsNeedRefresh/);
  assert.doesNotMatch(directoryUiSource, /includeCargoOptions/);
  assert.doesNotMatch(directoryUiSource, /callServer\('listDirectoryAssignments'/);
  assert.doesNotMatch(directoryUiSource, /loadData:/);
});

test('Información de personal registra por separado el selector de sedes y la carga de una sede', () => {
  assert.match(directorySource, /\[DirectoryService\] Initial site selector ms:/);
  assert.match(directorySource, /scopeSummary:\s*\{/);
  assert.match(directorySource, /function getDirectoryAuthorizedData\(\)/);
  assert.match(directorySource, /directory-authorized-snapshot:v1/);
  assert.match(directorySource, /\[DirectoryService\] Site data ms:/);
  assert.match(directoryUiSource, /Selector inicial de sedes:/);
  assert.match(directoryUiSource, /Sede cargada:/);
  assert.doesNotMatch(directoryUiSource, /DataTable server request ms/);
});

test('las pestañas Usuarios y Auditoría conservan búsqueda, filtros y página al volver', () => {
  assert.match(dataTableUiSource, /const initialState = options\.initialState/);
  assert.match(dataTableUiSource, /Number\.parseInt\(initialState\.page/);
  assert.match(dataTableUiSource, /String\(initialState\.search/);
  assert.match(dataTableUiSource, /initialState\.filters && initialState\.filters\[filter\.key\]/);
  assert.match(accessUiSource, /initialState: config\.initialState/);
  assert.match(accessUiSource, /state\.userListParams = tableState/);
  assert.match(accessUiSource, /state\.auditListParams = tableState/);
  assert.match(accessUiSource, /state\.userPagePromises/);
  assert.match(accessUiSource, /state\.auditPagePromises/);
  assert.match(accessUiSource, /state\.userCacheGeneration \+= 1/);
  assert.match(accessUiSource, /state\.auditCacheGeneration \+= 1/);
});

test('el modal de permiso abre sin depender de visitar antes la pestaña de módulos', () => {
  const start = accessUiSource.indexOf('function openPermissionModal(row)');
  const end = accessUiSource.indexOf('function renderAssignments(host)', start);
  const modal = accessUiSource.slice(start, end);
  assert.match(modal, /needsPermissionCatalogs/);
  assert.match(modal, /rpc\('getAccessManagementTabData', 'permissions'\)\.then/);
  assert.match(modal, /El formulario se muestra de inmediato/);
  assert.match(modal, /if \(editing \|\| needsPermissionCatalogs\) module\.disabled = true/);
  assert.match(modal, /if \(editing \|\| needsPermissionCatalogs\) operation\.disabled = true/);
});

test('el editor de permisos recibe el catálogo de operaciones al cargar Permisos', () => {
  assert.match(accessUiSource, /state\.data\.operations = result\.operations \|\| \[\]/);
  assert.match(accessUiSource, /state\.tabDataLoaded\.operations = true/);
});

test('Nueva cuenta abre el formulario sin esperar los catálogos organizacionales ni tipos de documento', () => {
  assert.match(accessUiSource, /if \(editing \|\| needsScopeCatalogs\)/);
  assert.match(accessUiSource, /Cargando tipos de documento/);
  assert.match(accessUiSource, /rpc\('getAccessManagementTabData', 'documentTypes'\)\.then/);
  assert.match(accessUiSource, /await rpc\('getAccessScopeCatalogs'\)/);
});



test('Nueva cuenta monta el formulario antes de mostrar la alerta del contenedor de búsqueda', () => {
  const start = accessUiSource.indexOf('function openUserModal(row) {');
  const end = accessUiSource.indexOf('function renderRoles(host)', start);
  const implementation = accessUiSource.slice(start, end);
  const mountIndex = implementation.indexOf('saveButton = openFormModal(');
  const alertIndex = implementation.indexOf('if (initialDocumentAlert) {');
  assert.ok(mountIndex >= 0);
  assert.ok(alertIndex > mountIndex);
  assert.match(implementation, /let initialDocumentAlert = null/);
  assert.match(implementation, /initialDocumentAlert = \{[\s\S]*?title: 'Cargando catálogo'/);
  assert.match(implementation, /showSearchAlert\(\s*initialDocumentAlert\.type/);
  assert.ok(implementation.includes("resultHost.appendChild(alertHost)"));
  assert.doesNotMatch(
    implementation.slice(implementation.indexOf("if (!documentTypes.length)"), mountIndex),
    /showSearchAlert\(/
  );
});

test('el bootstrap de Administración reutiliza catálogos mientras no cambie su generación', () => {
  const sandbox = createAdapterSandbox(makeSecurityData());
  const cache = new Map();
  const readCounts = [];
  const list = sandbox.SUNARPCore.listRecordsFromSourcesCached;
  sandbox.SUNARPCore.getOrBuildCachedValue = (key, sources, builder, ttl) => {
    const cacheKey = String(key);
    assert.ok(ttl === 60 || ttl === 3600);
    if (cache.has(cacheKey)) {
      return { value: cache.get(cacheKey), cacheHit: true, cacheStored: true };
    }
    const value = builder();
    cache.set(cacheKey, value);
    return { value, cacheHit: false, cacheStored: true };
  };
  sandbox.SUNARPCore.listRecordsFromSourcesCached = (...args) => {
    readCounts.push(args[0].map(request => request.source.sheetName));
    return list(...args);
  };
  const first = sandbox.getAccessManagementData();
  const firstReadCount = readCounts.length;
  const second = sandbox.getAccessManagementData();
  assert.equal(firstReadCount, 2, 'Una lectura para identidad y otra para catálogos iniciales');
  assert.equal(readCounts.length, firstReadCount, 'La segunda entrada no debe volver a leer catálogos.');
  assert.ok(cache.has('access-auth-context:v1:prueba@sunarp.gob.pe'));
  assert.ok(cache.has('access-management-bootstrap:v1'));
  assert.deepEqual(
    Array.from(first.modules, item => item.modulo_id),
    Array.from(second.modules, item => item.modulo_id)
  );
});

test('el bootstrap de accesos agrupa catálogos del libro de Seguridad en una lectura', () => {
  const bootstrap = accessSource.slice(
    accessSource.indexOf('function getAccessManagementData()'),
    accessSource.indexOf('function getAccessManagementTabData(', accessSource.indexOf('function getAccessManagementData()'))
  );
  assert.match(bootstrap, /bootstrapRequests/);
  assert.match(bootstrap, /getOrBuildCachedValue/);
  assert.match(bootstrap, /access-management-bootstrap:v1/);
  assert.match(bootstrap, /listRecordsFromSourcesCached\(bootstrapRequests, 60\)/);
  assert.doesNotMatch(bootstrap, /_accessLoadSecurityRecords_\(/);
});



test('la jerarquía del Directorio muestra los hijos directos con sus nombres reales', () => {
  const start = directoryUiSource.indexOf('function appendHierarchyLevel(');
  const end = directoryUiSource.indexOf('function renderHierarchyFilters()', start);
  assert.ok(start >= 0 && end > start);
  const implementation = directoryUiSource.slice(start, end);
  assert.ok(implementation.includes('option.textContent = key(node.name)'));
  assert.ok(directoryUiSource.includes('hierarchyIndex.childrenByParent.get(parentKey)'));
  assert.ok(directoryUiSource.includes('Array.from(index.structureById.values())'));
  assert.ok(directoryUiSource.includes('scope.includeDescendants === true'));
  assert.equal(implementation.includes('contextualIds'), false);
  assert.equal(implementation.includes('(contexto)'), false);
  assert.equal(implementation.includes('option.disabled'), false);
});

test('los ámbitos recorren Sede -> Local -> Unidad orgánica filtrando cada nivel por su padre', () => {
  const start = accessUiSource.indexOf('function updateReferenceOptions() {');
  const end = accessUiSource.indexOf('function paintScopes()', start);
  assert.ok(start >= 0 && end > start);
  const implementation = accessUiSource.slice(start, end);
  assert.ok(implementation.includes("createField('Sede', siteSelect)"));
  assert.ok(implementation.includes('String(item.sede_id) === siteId'));
  assert.ok(implementation.includes("siteSelect.addEventListener('change'"));
  assert.ok(implementation.includes("localSelect.addEventListener('change'"));
  assert.ok(implementation.includes('renderStructureLevels(localId, levelsHost, selectedChain, type)'));
  assert.ok(implementation.includes("localSelect.required = type !== 'SEDE'"));
  assert.ok(implementation.includes("!['SEDE', 'LOCAL', 'ESTRUCTURA_ORG'].includes(type)"));
  assert.ok(accessUiSource.includes("levelSelect.required = type === 'ESTRUCTURA_ORG'"));
});

test('los botones de Administración de accesos notifican errores sincrónicos y asíncronos', () => {
  const start = accessUiSource.indexOf('function createButton(');
  const end = accessUiSource.indexOf('function createSelect(', start);
  assert.ok(start >= 0 && end > start);
  const implementation = accessUiSource.slice(start, end);
  assert.ok(implementation.includes("button.addEventListener('click', event =>"));
  assert.ok(implementation.includes('const result = onClick(event)'));
  assert.ok(implementation.includes('Promise.resolve(result).catch(reportError)'));
  assert.ok(implementation.includes("window.SUNARPUI.notify('error'"));
  const usersStart = accessUiSource.indexOf('function renderUsers(host)');
  const usersEnd = accessUiSource.indexOf('async function openUserModal(row)', usersStart);
  const users = accessUiSource.slice(usersStart, usersEnd);
  assert.ok(users.includes("canManage ? 'Nueva cuenta'"));
  assert.ok(users.includes('canManage ? () => openUserModal(null) : null'));
});


test('los filtros acumulan Sede, Local, estructura y Cargo sobre la instantánea autorizada', () => {
  assert.match(directoryUiSource, /localFilter|populateLocalFilter|directoryLocalFilter/);

  const recordsStart = directoryUiSource.indexOf('function getRecordsForFilters(');
  const recordsEnd = directoryUiSource.indexOf('function getUsedCatalogItems(', recordsStart);
  const recordsFilter = directoryUiSource.slice(recordsStart, recordsEnd);
  assert.match(recordsFilter, /localId = elements\.localFilter/);
  assert.match(recordsFilter, /recordLocalId !== localId/);
  assert.ok(recordsFilter.includes('return state.records.filter'));

  const hierarchyStart = directoryUiSource.indexOf('function getHierarchyFilterSets()');
  const hierarchyEnd = directoryUiSource.indexOf('function getHierarchyNodes(parentId)', hierarchyStart);
  const hierarchy = directoryUiSource.slice(hierarchyStart, hierarchyEnd);
  assert.ok(hierarchy.includes('state.hierarchySelectableIds'));

  const scopeRootsStart = directoryUiSource.indexOf('function _directoryGetHierarchyScopeRoots_');
  const nodesStart = directoryUiSource.indexOf('function getHierarchyNodes(parentId)');
  const hierarchyScopeRoots = directoryUiSource.slice(scopeRootsStart, nodesStart);
  assert.ok(hierarchyScopeRoots.includes("scope.type !== 'ESTRUCTURA_ORG'"));
  assert.ok(hierarchyScopeRoots.includes('scope.includeDescendants'));
  assert.ok(hierarchyScopeRoots.includes('_directoryMatchesHierarchySubtree_'));

  const nodesEnd = directoryUiSource.indexOf('function getHierarchyLabel(', nodesStart);
  const hierarchyNodes = directoryUiSource.slice(nodesStart, nodesEnd);
  assert.ok(hierarchyNodes.includes('_directoryGetHierarchyScopeRoots_'));
  assert.ok(hierarchyNodes.includes('_directoryGetSelectableHierarchyChildren_'));
  assert.ok(hierarchyNodes.includes("scope.type === 'LOCAL'"));
  assert.equal(hierarchyNodes.includes('collectChildren'), false);

  const renderStart = directoryUiSource.indexOf('function renderHierarchyFilters()');
  const renderEnd = directoryUiSource.indexOf('function hasAvailableFilterSelection(filter)', renderStart);
  const renderHierarchy = directoryUiSource.slice(renderStart, renderEnd);
  assert.ok(renderHierarchy.includes('_directoryBuildLocalHierarchyFilterSets_'));
  assert.doesNotMatch(renderHierarchy, /selectableIds\.size <= 1/);

  const cargoStart = directoryUiSource.indexOf('function populateCargoFilter()');
  const cargoEnd = directoryUiSource.indexOf('function getHierarchyFilterSets()', cargoStart);
  const cargoFilter = directoryUiSource.slice(cargoStart, cargoEnd);
  assert.ok(cargoFilter.includes("getRecordsForFilters(new Set(['cargo']))"));
  assert.ok(cargoFilter.includes('if (wrapper) wrapper.hidden = cargos.length === 0'));

  assert.match(directoryViewSource, /directoryLocalFilter/);
  assert.match(directoryViewSource, /directoryCargoFilter/);
});
