/**
 * GESTOR DE INTRANET SUNARP
 * Servicio de administración de accesos sobre el contrato único del Core.
 * La identidad se resuelve desde personas; Usuarios solo almacena persona_id.
 */

const ACCESS_MANAGEMENT_CONFIG = Object.freeze({
  sourceKey: 'SECURITY',
  peopleSourceKey: 'DIRECTORY',
  sheets: Object.freeze({
    users: 'Usuarios',
    modules: 'Modulos',
    roles: 'Roles',
    userRoles: 'UsuarioRol',
    permissions: 'Permisos',
    operations: 'Operaciones',
    rolePermissions: 'RolPermiso',
    scopeTypes: 'TiposAmbito',
    scopes: 'AmbitosAcceso',
    audit: 'Auditoria',
    people: 'personas'
  }),
  moduleCodes: Object.freeze({
    accesses: 'ACCESOS',
    personalInformation: 'INFORMACION_PERSONAL'
  }),
  adminRoleId: 'ROL_ADMIN',
  adminPermissionCodes: Object.freeze([
    'USUARIOS_ADMINISTRAR',
    'ROLES_ADMINISTRAR',
    'PERMISOS_ADMINISTRAR',
    'AMBITOS_ACCESO_ADMINISTRAR'
  ]),
});

const ACCESS_SCOPE_TYPE_IDS = Object.freeze(['TOTAL', 'SEDE', 'ESTRUCTURA_ORG', 'LOCAL']);

function _accessIdentifierToken_(value) {
  return _accessText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function _accessGenerateUniqueIdentifier_(prefix, value, records, field, maxLength) {
  const token = _accessIdentifierToken_(value) || 'REGISTRO';
  const limit = Math.max(2, Number(maxLength) || 50);
  const base = (String(prefix || '') + token).slice(0, limit);
  const used = new Set((records || []).map(item => _accessUpper_(item && item[field])));
  if (!used.has(base)) return base;
  for (let suffixNumber = 2; suffixNumber < 10000; suffixNumber++) {
    const suffix = '_' + suffixNumber;
    const candidate = base.slice(0, limit - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('No se pudo generar un identificador único.');
}

/**
 * Genera un identificador comprobando colisiones mediante búsquedas exactas.
 * Evita cargar el catálogo completo solo para reservar un ID.
 */
function _accessGenerateUniqueIdentifierFromSource_(sheetName, prefix, value, field, requiredHeaders, maxLength) {
  const token = _accessIdentifierToken_(value) || 'REGISTRO';
  const limit = Math.max(2, Number(maxLength) || 50);
  const base = (String(prefix || '') + token).slice(0, limit);
  const exists = candidate => _accessFindSecurityRecords_(
    sheetName,
    field,
    [candidate],
    requiredHeaders,
    { matchCase: false, projectionFields: [field] }
  ).length > 0;

  if (!exists(base)) return base;
  for (let suffixNumber = 2; suffixNumber < 10000; suffixNumber++) {
    const suffix = '_' + suffixNumber;
    const candidate = base.slice(0, limit - suffix.length) + suffix;
    if (!exists(candidate)) return candidate;
  }
  throw new Error('No se pudo generar un identificador único.');
}

function _accessBuildPermissionCode_(moduleCode, operation) {
  const moduleToken = _accessIdentifierToken_(moduleCode);
  const operationToken = _accessIdentifierToken_(operation);
  if (!moduleToken || !operationToken) throw new Error('No se pudo generar el código del permiso.');
  return (moduleToken + '_' + operationToken).slice(0, 80);
}

function _accessGetOperationCatalog_(operations) {
  return (operations || []).map(item => ({
    operacion_id: _accessUpper_(item.operacion_id), nombre: _accessText_(item.nombre),
    descripcion: _accessText_(item.descripcion), active: _accessCatalogIsActive_(item)
  })).filter(item => item.operacion_id && item.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function _accessFlag_(value) {
  return value === true || ['TRUE', '1', 'SI', 'SÍ', 'YES'].includes(_accessUpper_(value));
}

function _accessScopeType_(data, typeId) {
  const id = _accessUpper_(typeId);
  if (!ACCESS_SCOPE_TYPE_IDS.includes(id)) return null;
  return (data.tiposAmbito || []).find(item => _accessUpper_(item.tipo_ambito_id) === id && _accessCatalogIsActive_(item)) || null;
}

const ACCESS_MANAGEMENT_FIELDS = Object.freeze({
  users: Object.freeze(['persona_id', 'active']),
  modules: Object.freeze(['modulo_id', 'codigo', 'nombre', 'descripcion', 'active']),
  roles: Object.freeze(['rol_id', 'nombre', 'descripcion', 'active']),
  userRoles: Object.freeze(['persona_id', 'modulo_id', 'rol_id', 'active']),
  permissions: Object.freeze(['permiso_id', 'codigo', 'modulo_id', 'operacion_id', 'descripcion', 'active']),
  rolePermissions: Object.freeze(['rol_id', 'permiso_id', 'active']),
  scopes: Object.freeze(['persona_id', 'modulo_id', 'tipo_ambito_id', 'referencia_id', 'incluir_descendientes', 'active']),
  operations: Object.freeze(['operacion_id', 'nombre']),
  scopeTypes: Object.freeze(['tipo_ambito_id', 'nombre', 'descripcion', 'entidad_referencia', 'requiere_referencia', 'permite_descendientes', 'active']),
  people: Object.freeze(['persona_id', 'nombres', 'apellidos', 'correo_institucional']),
  audit: Object.freeze([
    'evento_id', 'fecha_hora', 'actor_correo', 'actor_nombre', 'accion',
    'modulo', 'tipo_entidad', 'registro_id', 'registro_nombre', 'resultado',
    'detalle', 'datos_antes', 'datos_despues', 'ambito_modulo',
    'ambito_tipo', 'ambito_referencia_id'
  ])
});


function _accessText_(value) {
  return String(
    value === null || value === undefined ? '' : value
  ).trim();
}


function _accessUpper_(value) {
  return _accessText_(value).toUpperCase();
}


function _accessIsActive_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return _accessUpper_(value) === 'TRUE';
}


function _accessCatalogIsActive_(record) {
  if (!record) return false;
  if (!Object.prototype.hasOwnProperty.call(record, 'active')) return true;
  return _accessIsActive_(record.active);
}

function _accessNormalizeActive_(value, label) {
  if (value === true || _accessUpper_(value) === 'TRUE') return true;
  if (value === false || _accessUpper_(value) === 'FALSE') return false;
  throw new Error((label || 'El estado') + ' debe ser TRUE o FALSE.');
}

function _accessDirectorySource_(sheetName) {
  return getIntranetDataSource(ACCESS_MANAGEMENT_CONFIG.peopleSourceKey, sheetName, 1);
}

function _accessResolveModuleId_(auth, moduleIdOrCode) {
  const expected = _accessUpper_(moduleIdOrCode);
  if (!expected) throw new Error('Debes indicar el modulo_id para la autorización.');

  const module = (auth && auth.modules || []).find(item =>
    _accessUpper_(item.modulo_id) === expected ||
    _accessUpper_(item.codigo) === expected
  );

  if (!module || !_accessIsActive_(module.active)) {
    throw new Error('El módulo solicitado no existe o está inactivo.');
  }

  return _accessText_(module.modulo_id);
}

function _accessGetModuleAccess_(auth, moduleIdOrCode) {
  const moduleId = _accessResolveModuleId_(auth, moduleIdOrCode);
  return (auth.moduleAccess || []).find(item =>
    _accessText_(item.modulo_id) === moduleId
  ) || null;
}

function _accessHasPermission_(auth, permissionCode, moduleIdOrCode) {
  const moduleId = _accessResolveModuleId_(auth, moduleIdOrCode);
  return SUNARPCore.authorizationHasPermission(auth, permissionCode, moduleId);
}

function _accessIsGlobalAdministrator_(auth) {
  const moduleId = _accessResolveModuleId_(auth, ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses);
  const access = _accessGetModuleAccess_(auth, moduleId);

  if (!access || access.rol_id !== ACCESS_MANAGEMENT_CONFIG.adminRoleId) return false;

  if (!SUNARPCore.authorizationIsRecordInScope(auth, moduleId, {}, [])) return false;

  return ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes.every(code =>
    SUNARPCore.authorizationHasPermission(auth, code, moduleId)
  );
}

function hasPermission_(auth, permissionCode) {
  const code = _accessUpper_(permissionCode);
  if (!auth || !auth.authenticated || !code) return false;

  const matches = (auth.permissionsCatalog || []).filter(permission =>
    _accessUpper_(permission.codigo) === code && _accessIsActive_(permission.active)
  );
  if (matches.length !== 1) return false;

  return _accessHasPermission_(auth, code, matches[0].modulo_id);
}


function _accessSecuritySource_(sheetName) {
  return getIntranetDataSource(
    ACCESS_MANAGEMENT_CONFIG.sourceKey,
    sheetName,
    1
  );
}


/**
 * Carga las nueve fuentes únicamente para la validación integral explícita.
 * No debe invocarse desde la resolución de identidad/autorización ordinaria.
 */
function _accessLoadSecurityData_() {
  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const requests = [
    { key: 'usuarios', source: _accessSecuritySource_(s.users), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.users },
    { key: 'modulos', source: _accessSecuritySource_(s.modules), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.modules },
    { key: 'roles', source: _accessSecuritySource_(s.roles), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.roles },
    { key: 'usuarioRol', source: _accessSecuritySource_(s.userRoles), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.userRoles },
    { key: 'permisos', source: _accessSecuritySource_(s.permissions), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.permissions },
    { key: 'operaciones', source: _accessSecuritySource_(s.operations), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.operations },
    { key: 'rolPermiso', source: _accessSecuritySource_(s.rolePermissions), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.rolePermissions },
    { key: 'ambitosAcceso', source: _accessSecuritySource_(s.scopes), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.scopes },
    { key: 'tiposAmbito', source: _accessSecuritySource_(s.scopeTypes), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.scopeTypes }
  ];
  const data = SUNARPCore.listRecordsFromSourcesCached(requests, 300);
  _accessValidateSnapshot_(data);
  return data;
}

/**
 * Ejecuta la validación referencial integral de las nueve tablas de seguridad.
 *
 * Es una operación explícita de mantenimiento, protegida para administradores
 * globales. No participa en el login, la navegación ni las consultas normales.
 * Devuelve conteos y estado, nunca el contenido de las tablas.
 */
function validateAccessManagementIntegrity() {
  _accessRequirePermission_('USUARIOS_ADMINISTRAR');
  const data = _accessLoadSecurityData_();
  const counts = {};
  Object.keys(data).forEach(key => {
    counts[key] = Array.isArray(data[key]) ? data[key].length : 0;
  });
  return {
    success: true,
    valid: true,
    validatedAt: new Date().toISOString(),
    counts
  };
}

function _accessFindPersonById_(personaId) {
  const id = _accessText_(personaId);
  if (!id) return null;
  const result = SUNARPCore.findRecordsByFields(
    _accessDirectorySource_(ACCESS_MANAGEMENT_CONFIG.sheets.people),
    { persona_id: id },
    {
      searchField: 'persona_id',
      requiredHeaders: ACCESS_MANAGEMENT_FIELDS.people,
      projectionFields: ['persona_id', 'correo_institucional', 'nombres', 'apellidos']
    }
  );
  if (result.total > 1) {
    throw new Error('El identificador de persona está duplicado en el directorio: ' + id + '.');
  }
  return result.records[0] || null;
}

/**
 * Recupera únicamente las relaciones de seguridad necesarias para resolver
 * la autorización de una persona. Las colecciones completas de gestión se
 * cargan bajo demanda cuando una operación administrativa las necesita.
 */
function _accessFindSecurityRecords_(sheetName, field, values, requiredHeaders, options) {
  const ids = Array.from(new Set((values || []).map(_accessText_).filter(Boolean)));
  if (!ids.length) return [];
  const filters = {};
  filters[field] = ids.length === 1 ? ids[0] : ids;
  return _accessFindSecurityRecordsByFilters_(sheetName, filters, field, requiredHeaders, options);
}

function _accessFindSecurityRecordsByFilters_(sheetName, filters, searchField, requiredHeaders, options) {
  const fields = Object.keys(filters || {});
  if (!fields.length) return [];
  const result = SUNARPCore.findRecordsByFields(
    _accessSecuritySource_(sheetName),
    filters,
    Object.assign({ searchField: searchField || fields[0], requiredHeaders }, options || {})
  );
  return result.records || [];
}

/**
 * Conjunto reducido utilizado exclusivamente para proteger la continuidad
 * del último administrador global. No carga las nueve tablas completas:
 * obtiene ACCESOS, ROL_ADMIN, sus permisos/relaciones, las asignaciones de
 * ese rol y solo las cuentas/ámbitos que podrían contar como administradores.
 */
function _accessMergeUniqueRows_(collections, fields) {
  const merged = new Map();
  (collections || []).forEach(collection => (collection || []).forEach(row => {
    const key = fields.map(field => _accessText_(row[field])).join('\\u0000');
    merged.set(key, row);
  }));
  return Array.from(merged.values());
}

function _accessLoadAdministratorContinuityData_() {
  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const moduleMatches = _accessFindSecurityRecords_(
    s.modules, 'codigo', [ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses],
    ACCESS_MANAGEMENT_FIELDS.modules, { matchCase: false }
  ).filter(item => _accessIsActive_(item.active));

  if (moduleMatches.length > 1) {
    throw new Error('Existe más de un módulo ACCESOS activo.');
  }
  const module = moduleMatches[0] || null;
  if (!module) {
    return {
      usuarios: [], modulos: [], roles: [], usuarioRol: [],
      permisos: [], rolPermiso: [], ambitosAcceso: []
    };
  }

  const moduleId = _accessText_(module.modulo_id);
  const roles = _accessFindSecurityRecords_(
    s.roles, 'rol_id', [ACCESS_MANAGEMENT_CONFIG.adminRoleId],
    ACCESS_MANAGEMENT_FIELDS.roles
  );
  const activeAdminRoles = roles.filter(item => _accessIsActive_(item.active));
  if (activeAdminRoles.length > 1) {
    throw new Error('Existe más de un registro activo para ROL_ADMIN.');
  }

  const permissions = _accessFindSecurityRecordsByFilters_(
    s.permissions,
    { modulo_id: moduleId, codigo: ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes },
    'modulo_id',
    ACCESS_MANAGEMENT_FIELDS.permissions
  );
  const permissionIds = permissions.map(item => _accessText_(item.permiso_id)).filter(Boolean);
  const rolePermissions = permissionIds.length
    ? _accessFindSecurityRecordsByFilters_(
        s.rolePermissions,
        { rol_id: ACCESS_MANAGEMENT_CONFIG.adminRoleId, permiso_id: permissionIds },
        'rol_id',
        ACCESS_MANAGEMENT_FIELDS.rolePermissions
      )
    : [];
  const userRoles = _accessFindSecurityRecordsByFilters_(
    s.userRoles,
    { rol_id: ACCESS_MANAGEMENT_CONFIG.adminRoleId, modulo_id: moduleId },
    'rol_id',
    ACCESS_MANAGEMENT_FIELDS.userRoles
  );
  const candidatePersonaIds = userRoles.map(item => item.persona_id);
  const usuarios = _accessFindSecurityRecords_(
    s.users, 'persona_id', candidatePersonaIds,
    ACCESS_MANAGEMENT_FIELDS.users
  );
  const ambitosAcceso = _accessFindSecurityRecordsByFilters_(
    s.scopes,
    { modulo_id: moduleId, tipo_ambito_id: 'TOTAL' },
    'modulo_id',
    ACCESS_MANAGEMENT_FIELDS.scopes
  );

  _accessValidateUnique_(userRoles, ['persona_id', 'modulo_id'], 'UsuarioRol ROL_ADMIN');
  _accessValidateUnique_(rolePermissions, ['rol_id', 'permiso_id'], 'RolPermiso ROL_ADMIN');
  _accessValidateUnique_(ambitosAcceso, ['persona_id', 'modulo_id', 'tipo_ambito_id', 'referencia_id'], 'AmbitosAcceso TOTAL');

  return {
    usuarios,
    modulos: [module],
    roles,
    usuarioRol: userRoles,
    permisos: permissions,
    rolPermiso: rolePermissions,
    ambitosAcceso
  };
}

function _accessLoadAuthorizationData_(personaId) {
  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const users = _accessFindSecurityRecords_(
    s.users,
    'persona_id',
    [personaId],
    ACCESS_MANAGEMENT_FIELDS.users,
    { projectionFields: ['persona_id', 'active'] }
  );
  const activeUsers = users.filter(item => _accessIsActive_(item.active));

  if (!activeUsers.length) {
    return {
      usuarios: users, modulos: [], roles: [], usuarioRol: [],
      permisos: [], rolPermiso: [], ambitosAcceso: [],
      operaciones: [], tiposAmbito: []
    };
  }

  // La autorización ordinaria solo necesita relaciones activas de la
  // identidad solicitante. Las relaciones inactivas se reservan para
  // mantenimiento e integridad, no para resolver permisos efectivos.
  const usuarioRol = _accessFindSecurityRecordsByFilters_(
    s.userRoles,
    { persona_id: personaId, active: true },
    'persona_id',
    ACCESS_MANAGEMENT_FIELDS.userRoles,
    { matchCase: false, projectionFields: ['persona_id', 'modulo_id', 'rol_id', 'active'] }
  );
  const ambitosAcceso = _accessFindSecurityRecordsByFilters_(
    s.scopes,
    { persona_id: personaId, active: true },
    'persona_id',
    ACCESS_MANAGEMENT_FIELDS.scopes,
    {
      matchCase: false,
      projectionFields: [
        'persona_id', 'modulo_id', 'tipo_ambito_id',
        'referencia_id', 'incluir_descendientes', 'active'
      ]
    }
  );

  const roleIds = [...new Set(usuarioRol.map(item => _accessText_(item.rol_id)).filter(Boolean))];
  const roles = _accessFindSecurityRecordsByFilters_(
    s.roles,
    { rol_id: roleIds, active: true },
    'rol_id',
    ACCESS_MANAGEMENT_FIELDS.roles,
    { matchCase: false, projectionFields: ['rol_id', 'nombre', 'active'] }
  );
  const activeRoleIds = [...new Set(roles.map(item => _accessText_(item.rol_id)).filter(Boolean))];
  const rolPermiso = _accessFindSecurityRecordsByFilters_(
    s.rolePermissions,
    { rol_id: activeRoleIds, active: true },
    'rol_id',
    ACCESS_MANAGEMENT_FIELDS.rolePermissions,
    { matchCase: false, projectionFields: ['rol_id', 'permiso_id', 'active'] }
  );
  const permissionIds = [...new Set(rolPermiso.map(item => _accessText_(item.permiso_id)).filter(Boolean))];
  const permisos = _accessFindSecurityRecordsByFilters_(
    s.permissions,
    { permiso_id: permissionIds, active: true },
    'permiso_id',
    ACCESS_MANAGEMENT_FIELDS.permissions,
    {
      matchCase: false,
      projectionFields: [
        'permiso_id', 'codigo', 'modulo_id',
        'operacion_id', 'descripcion', 'active'
      ]
    }
  );

  // El catálogo de módulos es pequeño y permite resolver module_id incluso
  // cuando la persona no tiene una asignación en un módulo concreto.
  const moduleData = SUNARPCore.listRecordsFromSourcesCached([{
    key: 'modulos',
    source: _accessSecuritySource_(s.modules),
    requiredHeaders: ACCESS_MANAGEMENT_FIELDS.modules
  }], 300);

  return {
    usuarios: activeUsers,
    modulos: moduleData.modulos || [],
    roles,
    usuarioRol,
    permisos,
    rolPermiso,
    ambitosAcceso,
    operaciones: [],
    tiposAmbito: []
  };
}

function _accessLoadDocumentTypes_() {
  const result = SUNARPCore.listRecordsFromSourcesCached([{
    key: 'documentTypes',
    source: _directoryResolveDocumentTypesSource_(),
    requiredHeaders: ['id', 'name']
  }], 60);
  return result.documentTypes || [];
}

function _accessValidateHeaders_() {
  const sheets = ACCESS_MANAGEMENT_CONFIG.sheets;
  Object.keys(ACCESS_MANAGEMENT_FIELDS).forEach(key => {
    if (key === 'audit') return;
    const source = key === 'people'
      ? _accessDirectorySource_(sheets[key])
      : _accessSecuritySource_(sheets[key]);
    const info = SUNARPCore.getSourceInfoCached(source, 300);
    const missing = ACCESS_MANAGEMENT_FIELDS[key].filter(header => !info.headers.includes(header));
    if (missing.length) {
      throw new Error('La pestaña "' + sheets[key] + '" no contiene los encabezados requeridos: ' + missing.join(', ') + '.');
    }
  });
}


function _accessValidateUnique_(records, fields, label) {
  const seen = new Set();

  (records || []).forEach(record => {
    const values = fields.map(field =>
      _accessText_(record[field]).toLowerCase()
    );

    if (values.every(value => !value)) return;

    const key = JSON.stringify(values);

    if (seen.has(key)) {
      throw new Error(
        `La hoja de seguridad contiene claves duplicadas en ${label}.`
      );
    }

    seen.add(key);
  });
}


/**
 * Comprueba integridad referencial básica.
 */
function _accessValidateSnapshot_(data) {
  const unique = [
    ['usuarios', ['persona_id'], 'Usuarios.persona_id'],
    ['modulos', ['modulo_id'], 'Modulos.modulo_id'],
    ['modulos', ['codigo'], 'Modulos.codigo'],
    ['roles', ['rol_id'], 'Roles.rol_id'],
    ['permisos', ['permiso_id'], 'Permisos.permiso_id'],
    ['permisos', ['codigo'], 'Permisos.codigo'],
    ['usuarioRol', ['persona_id', 'modulo_id', 'rol_id'], 'UsuarioRol.persona_id+modulo_id+rol_id'],
    ['rolPermiso', ['rol_id', 'permiso_id'], 'RolPermiso.rol_id+permiso_id'],
    ['ambitosAcceso', ['persona_id', 'modulo_id', 'tipo_ambito_id', 'referencia_id'], 'AmbitosAcceso'],
    ['operaciones', ['operacion_id'], 'Operaciones.operacion_id'],
    ['tiposAmbito', ['tipo_ambito_id'], 'TiposAmbito.tipo_ambito_id']
  ];

  unique.forEach(([collection, fields, label]) =>
    _accessValidateUnique_(data[collection] || [], fields, label)
  );

  const moduleIds = new Set(data.modulos.map(row => _accessText_(row.modulo_id)));
  const roleIds = new Set(data.roles.map(row => _accessText_(row.rol_id)));
  const permissionIds = new Set(data.permisos.map(row => _accessText_(row.permiso_id)));
  const userIds = new Set(data.usuarios.map(row => _accessText_(row.persona_id)));
  const operationIds = new Set(data.operaciones.map(row => _accessUpper_(row.operacion_id)));
  data.operaciones.forEach(item => {
    if (!_accessUpper_(item.operacion_id) || !_accessText_(item.nombre)) {
      throw new Error('Operaciones contiene un registro sin operacion_id o nombre.');
    }
  });
  const scopeTypeIds = new Set(data.tiposAmbito.map(row => _accessUpper_(row.tipo_ambito_id)));
  const allowedScopeTypeIds = new Set(ACCESS_SCOPE_TYPE_IDS);
  data.tiposAmbito.forEach(item => {
    const id = _accessUpper_(item.tipo_ambito_id);
    if (!allowedScopeTypeIds.has(id)) throw new Error('TiposAmbito contiene un tipo no admitido por el modelo: ' + id + '.');
  });
  const scopeTypeRules = {
    TOTAL: { entity: 'NINGUNA', reference: false, descendants: false },
    SEDE: { entity: 'SEDE', reference: true, descendants: false },
    ESTRUCTURA_ORG: { entity: 'ESTRUCTURA_ORG', reference: true, descendants: true },
    LOCAL: { entity: 'LOCAL', reference: true, descendants: false }
  };
  ACCESS_SCOPE_TYPE_IDS.forEach(id => {
    if (!scopeTypeIds.has(id)) throw new Error('TiposAmbito no contiene el tipo obligatorio ' + id + '.');
    const row = data.tiposAmbito.find(item => _accessUpper_(item.tipo_ambito_id) === id);
    const expected = scopeTypeRules[id];
    if (!_accessCatalogIsActive_(row) ||
        _accessUpper_(row.entidad_referencia) !== expected.entity ||
        _accessFlag_(row.requiere_referencia) !== expected.reference ||
        _accessFlag_(row.permite_descendientes) !== expected.descendants) {
      throw new Error('La configuración de TiposAmbito para ' + id + ' no coincide con el modelo admitido.');
    }
  });

  data.usuarioRol.forEach(item => {
    if (!userIds.has(_accessText_(item.persona_id))) throw new Error('UsuarioRol referencia una cuenta inexistente en Usuarios.');
    if (!moduleIds.has(_accessText_(item.modulo_id))) throw new Error('UsuarioRol referencia un módulo inexistente.');
    if (!roleIds.has(_accessText_(item.rol_id))) throw new Error('UsuarioRol referencia un rol inexistente.');
  });

  const activeRoleByPersonModule = new Map();
  data.usuarioRol.forEach(item => {
    if (!_accessIsActive_(item.active)) return;
    const key = _accessText_(item.persona_id) + '\\u0000' + _accessText_(item.modulo_id);
    if (activeRoleByPersonModule.has(key)) {
      throw new Error(
        'UsuarioRol tiene más de un rol activo para la persona ' +
        _accessText_(item.persona_id) + ' en el módulo ' +
        _accessText_(item.modulo_id) + '.'
      );
    }
    activeRoleByPersonModule.set(key, _accessText_(item.rol_id));
  });

  data.permisos.forEach(permission => {
    if (!moduleIds.has(_accessText_(permission.modulo_id))) throw new Error('El permiso ' + _accessText_(permission.permiso_id) + ' referencia un modulo_id inexistente.');
    if (!operationIds.has(_accessUpper_(permission.operacion_id))) throw new Error('El permiso ' + _accessText_(permission.permiso_id) + ' referencia un operacion_id inexistente.');
  });

  data.rolPermiso.forEach(item => {
    if (!roleIds.has(_accessText_(item.rol_id))) throw new Error('RolPermiso referencia un rol inexistente.');
    if (!permissionIds.has(_accessText_(item.permiso_id))) throw new Error('RolPermiso referencia un permiso inexistente.');
  });

  data.ambitosAcceso.forEach(item => {
    if (!moduleIds.has(_accessText_(item.modulo_id))) throw new Error('AmbitosAcceso referencia un módulo inexistente.');
    const typeId = _accessUpper_(item.tipo_ambito_id);
    if (!scopeTypeIds.has(typeId)) throw new Error('AmbitosAcceso referencia un tipo_ambito_id inexistente.');
    const typeConfig = _accessScopeType_(data, typeId);
    const referenceId = _accessText_(item.referencia_id);
    const requiresReference = _accessFlag_(typeConfig.requiere_referencia);
    if (requiresReference && !referenceId) {
      throw new Error('AmbitosAcceso contiene un ' + typeId + ' sin referencia_id.');
    }
    if (!requiresReference && referenceId) {
      throw new Error('AmbitosAcceso contiene un ' + typeId + ' con referencia_id; debe estar vacío.');
    }
    const includesDescendants = _accessFlag_(item.incluir_descendientes);
    if (includesDescendants && !_accessFlag_(typeConfig.permite_descendientes)) {
      throw new Error('AmbitosAcceso contiene descendientes en un tipo que no los admite: ' + typeId + '.');
    }
  });

  const codes = new Set();
  data.modulos.filter(row => _accessIsActive_(row.active)).forEach(module => {
    const code = _accessUpper_(module.codigo);
    if (!code) throw new Error('Existe un módulo activo sin código.');
    if (codes.has(code)) throw new Error('Existe un código duplicado en Modulos: ' + code + '.');
    codes.add(code);
  });
}


/**
 * Recupera únicamente las referencias organizacionales utilizadas por una
 * operación de ámbito. Mantiene separadas las réplicas de Seguridad y Directorio.
 */
function _accessFindOrgCatalogByIds_(entity, ids) {
  const references = Array.from(new Set((ids || [])
    .map(_accessText_)
    .filter(Boolean)));
  if (!references.length) return [];

  let source;
  if (entity === 'SEDE') {
    source = _accessSecuritySource_('Sedes');
  } else if (entity === 'ESTRUCTURA_ORG') {
    source = _accessSecuritySource_('EstructuraOrg');
  } else if (entity === 'LOCAL') {
    source = _accessDirectorySource_('locales');
  } else {
    throw new Error('Entidad de referencia organizacional no admitida: ' + entity + '.');
  }

  const result = SUNARPCore.findRecordsByFields(
    source,
    { id: references },
    { searchField: 'id', matchCase: false, requiredHeaders: ['id'] }
  );
  return (result.records || []).filter(_accessCatalogIsActive_);
}


function _accessOrgCatalog_() {
  const requests = [
    { key: 'sedes', source: getIntranetDataSource('SECURITY', 'Sedes', 1) },
    { key: 'estructuraOrg', source: getIntranetDataSource('SECURITY', 'EstructuraOrg', 1) },
    { key: 'locales', source: getIntranetDataSource('DIRECTORY', 'locales', 1) }
  ];

  const catalogs = SUNARPCore.listRecordsFromSourcesCached(requests, 30);

  return {
    sedes: (catalogs.sedes || []).filter(_accessCatalogIsActive_),
    estructuraOrg: (catalogs.estructuraOrg || []).filter(_accessCatalogIsActive_),
    locales: (catalogs.locales || []).filter(_accessCatalogIsActive_)
  };
}

function _accessOrgManagementCatalog_() {
  const base = _accessOrgCatalog_();
  const requests = [
    { key: 'tiposEstructura', source: getIntranetDataSource('DIRECTORY', 'tipos_estructura', 1) },
    { key: 'estructuraLocal', source: getIntranetDataSource('DIRECTORY', 'estructura_local', 1) }
  ];
  const extra = SUNARPCore.listRecordsFromSourcesCached(requests, 30);

  return Object.assign({}, base, {
    tiposEstructura: (extra.tiposEstructura || []).filter(_accessCatalogIsActive_),
    estructuraLocal: (extra.estructuraLocal || []).filter(_accessCatalogIsActive_)
  });
}


function _accessGetAuthContext_() {
  const email = SUNARPCore.getCurrentUserEmail();
  if (!email) {
    throw new Error('No se pudo identificar tu cuenta institucional. Verifica la implementación de la aplicación web.');
  }

  const identityResult = SUNARPCore.resolveIdentity(
    _accessDirectorySource_(ACCESS_MANAGEMENT_CONFIG.sheets.people),
    email,
    {
      emailField: 'correo_institucional',
      idField: 'persona_id',
      requiredHeaders: ACCESS_MANAGEMENT_FIELDS.people,
      projectionFields: [
        'persona_id', 'correo_institucional', 'nombres', 'apellidos'
      ]
    }
  );
  const matchingPeople = identityResult.records;

  if (matchingPeople.length !== 1) {
    _accessWriteAudit_({ email, name: '' }, {
      accion: 'IDENTIDAD_NO_RESUELTA',
      modulo: 'ACCESOS',
      tipo_entidad: 'PERSONA',
      registro_id: email,
      registro_nombre: email,
      resultado: 'DENEGADO',
      detalle: matchingPeople.length
        ? 'El correo institucional aparece asociado a más de una persona.'
        : 'El correo institucional no está registrado en personas.'
    });
    throw new Error(matchingPeople.length
      ? 'Tu correo institucional está asociado a más de una persona. Debe corregirse el registro de identidad.'
      : 'Tu persona no tiene un correo institucional registrado en el directorio.');
  }

  const person = matchingPeople[0];
  if (Object.prototype.hasOwnProperty.call(person, 'active') && !_accessIsActive_(person.active)) {
    throw new Error('La persona vinculada a tu correo institucional está inactiva.');
  }

  const personaId = _accessText_(person.persona_id);
  const data = _accessLoadAuthorizationData_(personaId);
  const context = SUNARPCore.resolveAuthorizationContext({
    personaId,
    users: data.usuarios,
    modules: data.modulos,
    roles: data.roles,
    userRoles: data.usuarioRol,
    permissions: data.permisos,
    rolePermissions: data.rolPermiso,
    scopes: data.ambitosAcceso
  });

  if (!context.authenticated) {
    _accessWriteAudit_({
      email,
      name: [person.nombres, person.apellidos].map(_accessText_).filter(Boolean).join(' ')
    }, {
      accion: 'AUTENTICACION_DENEGADA',
      modulo: 'ACCESOS',
      tipo_entidad: 'USUARIO',
      registro_id: personaId,
      registro_nombre: email,
      resultado: 'DENEGADO',
      detalle: 'La persona no tiene una cuenta activa en Usuarios.'
    });
    throw new Error('Tu cuenta no está habilitada para utilizar el gestor de intranet.');
  }

  const auth = Object.assign({}, context, {
    email,
    name: [person.nombres, person.apellidos].map(_accessText_).filter(Boolean).join(' '),
    person,
    modules: data.modulos,
    permissionsCatalog: data.permisos,
    rolesCatalog: data.roles
  });

  // El contexto de autorización queda cerrado sobre las relaciones puntuales
  // ya consultadas. No expone getters que puedan disparar lecturas globales.
  return auth;
}


function getAuthContext_() {
  return _accessGetAuthContext_();
}


/**
 * Registra un evento en Auditoria.
 * La auditoría no debe impedir que se informe el resultado principal
 * de una operación cuando exista un problema al escribir el evento.
 */
function _accessWriteAudit_(actor, event) {
  try {
    const source = _accessSecuritySource_(
      ACCESS_MANAGEMENT_CONFIG.sheets.audit
    );

    const info = SUNARPCore.getSourceInfoCached(source, 300);
    const now = new Date();

    const record = {
      evento_id: Utilities.getUuid(),
      fecha_hora: now,
      actor_correo: _accessText_(actor && actor.email),
      actor_nombre: _accessText_(actor && actor.name),
      accion: _accessUpper_(event.accion),
      modulo: _accessUpper_(event.modulo),
      tipo_entidad: _accessUpper_(event.tipo_entidad),
      registro_id: _accessText_(event.registro_id),
      registro_nombre: _accessText_(event.registro_nombre),
      resultado: _accessUpper_(event.resultado || 'OK'),
      detalle: _accessText_(event.detalle),
      datos_antes: event.datos_antes == null
        ? ''
        : JSON.stringify(event.datos_antes),
      datos_despues: event.datos_despues == null
        ? ''
        : JSON.stringify(event.datos_despues),
      ambito_modulo: _accessUpper_(event.ambito_modulo),
      ambito_tipo: _accessUpper_(event.ambito_tipo),
      ambito_referencia_id: _accessText_(event.ambito_referencia_id)
    };

    const payload = {};

    info.headers.forEach(header => {
      if (Object.prototype.hasOwnProperty.call(record, header)) {
        payload[header] = record[header];
      }
    });

    const required = [
      'evento_id',
      'fecha_hora',
      'actor_correo',
      'accion',
      'modulo',
      'resultado',
      'detalle'
    ];

    const missing = required.filter(field =>
      !info.headers.includes(field)
    );

    if (missing.length) {
      throw new Error(
        `Auditoria no contiene los campos requeridos: ${missing.join(', ')}.`
      );
    }

    return SUNARPCore.appendAuditEvent(
      source,
      payload,
      'evento_id'
    );

  } catch (error) {
    console.error(
      '[AccessManagement] No se pudo registrar auditoría:',
      error.message
    );

    return null;
  }
}


/**
 * Ejecuta una operación y registra su resultado.
 */
function _accessRunAudited_(auth, event, callback) {
  try {
    const outcome = callback();

    _accessWriteAudit_(
      auth,
      Object.assign({}, event, {
        resultado: 'OK',

        datos_despues:
          outcome && outcome.auditAfter !== undefined
            ? outcome.auditAfter
            : null
      })
    );

    return outcome &&
      Object.prototype.hasOwnProperty.call(outcome, 'value')
      ? outcome.value
      : outcome;

  } catch (error) {
    _accessWriteAudit_(
      auth,
      Object.assign({}, event, {
        resultado: 'ERROR',
        detalle: [
          event.detalle,
          error.message
        ].filter(Boolean).join(' | ')
      })
    );

    throw error;
  }
}


/**
 * Exige un permiso y, opcionalmente, valida el ámbito de un registro.
 */
function _accessRequirePermission_(permissionCode, moduleIdOrCode, record) {
  const auth = _accessGetAuthContext_();
  const moduleId = _accessResolveModuleId_(
    auth,
    moduleIdOrCode || ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses
  );
  const accessModuleId = _accessResolveModuleId_(
    auth,
    ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses
  );
  const code = _accessUpper_(permissionCode);

  // La regla de administrador global protege las operaciones de gestión,
  // pero AUDITORIA_VER conserva su permiso independiente.
  const isAdministrativeOperation =
    ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes.includes(code);

  if (
    moduleId === accessModuleId &&
    isAdministrativeOperation &&
    !_accessIsGlobalAdministrator_(auth)
  ) {
    _accessWriteAudit_(auth, {
      accion: 'AUTORIZACION_DENEGADA',
      modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
      tipo_entidad: 'ADMINISTRACION',
      registro_id: code,
      registro_nombre: code,
      resultado: 'DENEGADO',
      detalle: 'La administración de accesos exige ROL_ADMIN y ámbito TOTAL en el módulo ACCESOS.'
    });
    throw new Error(
      'La administración de accesos requiere ROL_ADMIN y ámbito TOTAL en el módulo Accesos.'
    );
  }

  if (!SUNARPCore.authorizationHasPermission(auth, code, moduleId)) {
    _accessWriteAudit_(auth, {
      accion: 'AUTORIZACION_DENEGADA',
      modulo: moduleId,
      tipo_entidad: 'PERMISO',
      registro_id: code,
      registro_nombre: code,
      resultado: 'DENEGADO',
      detalle: 'La cuenta no tiene el permiso ' + code + ' en el módulo indicado.'
    });
    throw new Error('No tienes autorización para realizar esta operación.');
  }

  if (record) {
    const catalogs = _accessOrgCatalog_();
    const allowed = SUNARPCore.authorizationIsRecordInScope(
      auth,
      moduleId,
      record,
      catalogs.estructuraOrg,
      undefined,
      catalogs.locales
    );

    if (!allowed) {
      _accessWriteAudit_(auth, {
        accion: 'AUTORIZACION_DENEGADA',
        modulo: moduleId,
        tipo_entidad: 'REGISTRO',
        registro_id: _accessText_(record.id || record.persona_id),
        registro_nombre: _accessText_(record.nombre),
        resultado: 'DENEGADO',
        detalle: 'El registro se encuentra fuera de los ámbitos de acceso asignados.'
      });
      throw new Error('No tienes ámbito de acceso para operar sobre este registro.');
    }
  }

  return auth;
}


function requirePermission_(permissionCode, moduleId, record) {
  if (!moduleId) throw new Error('requirePermission_ necesita el modulo_id explícito del módulo que protege la operación.');
  return _accessRequirePermission_(permissionCode, moduleId, record);
}


function _accessRecordIsAllowed_(auth, moduleId, record, structures, locals) {
  const resolvedModuleId = _accessResolveModuleId_(auth, moduleId);
  return SUNARPCore.authorizationIsRecordInScope(
    auth,
    resolvedModuleId,
    record,
    structures || [],
    undefined,
    locals || []
  );
}


function _accessCountAdministrators_(data) {
  const accessModule = data.modulos.find(module =>
    _accessUpper_(module.codigo) === ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses &&
    _accessIsActive_(module.active)
  );
  if (!accessModule) return 0;
  const moduleId = _accessText_(accessModule.modulo_id);
  const activeRoles = new Set(data.roles.filter(role => _accessIsActive_(role.active)).map(role => _accessText_(role.rol_id)));
  const activePermissionsById = new Map(data.permisos
    .filter(permission => _accessIsActive_(permission.active) && _accessText_(permission.modulo_id) === moduleId)
    .map(permission => [_accessText_(permission.permiso_id), _accessUpper_(permission.codigo)]));
  const permissionsByRole = new Map();
  data.rolPermiso.forEach(assignment => {
    if (!_accessIsActive_(assignment.active)) return;
    const roleId = _accessText_(assignment.rol_id);
    if (!activeRoles.has(roleId)) return;
    const code = activePermissionsById.get(_accessText_(assignment.permiso_id));
    if (!code) return;
    if (!permissionsByRole.has(roleId)) permissionsByRole.set(roleId, new Set());
    permissionsByRole.get(roleId).add(code);
  });
  const activeUserIds = new Set(data.usuarios.filter(user => _accessIsActive_(user.active)).map(user => _accessText_(user.persona_id)));
  const activeTotalScopeIds = new Set(data.ambitosAcceso
    .filter(scope => _accessIsActive_(scope.active) && _accessText_(scope.modulo_id) === moduleId && _accessUpper_(scope.tipo_ambito_id) === 'TOTAL')
    .map(scope => _accessText_(scope.persona_id)));
  return data.usuarioRol.filter(assignment => {
    const personaId = _accessText_(assignment.persona_id);
    const roleId = _accessText_(assignment.rol_id);
    if (!_accessIsActive_(assignment.active) ||
        _accessText_(assignment.modulo_id) !== moduleId ||
        roleId !== ACCESS_MANAGEMENT_CONFIG.adminRoleId ||
        !activeUserIds.has(personaId) ||
        !activeTotalScopeIds.has(personaId) ||
        !activeRoles.has(roleId)) return false;
    const codes = permissionsByRole.get(roleId) || new Set();
    return ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes.every(code => codes.has(code));
  }).length;
}


function _accessAssertAdministratorContinuity_(before, after) {
  const currentCount = _accessCountAdministrators_(before);
  const nextCount = _accessCountAdministrators_(after);
  if (currentCount > 0 && nextCount === 0) {
    throw new Error('La operación dejaría el gestor sin administradores globales activos. Conserva una persona con ROL_ADMIN, ámbito TOTAL y todos los permisos administrativos en ACCESOS.');
  }
}


function _accessCopyData_(data) {
  return {
    usuarios: (data.usuarios || []).map(row => Object.assign({}, row)),
    modulos: (data.modulos || []).map(row => Object.assign({}, row)),
    roles: (data.roles || []).map(row => Object.assign({}, row)),
    usuarioRol: (data.usuarioRol || []).map(row => Object.assign({}, row)),
    permisos: (data.permisos || []).map(row => Object.assign({}, row)),
    operaciones: (data.operaciones || []).map(row => Object.assign({}, row)),
    tiposAmbito: (data.tiposAmbito || []).map(row => Object.assign({}, row)),
    rolPermiso: (data.rolPermiso || []).map(row => Object.assign({}, row)),
    ambitosAcceso: (data.ambitosAcceso || []).map(row => Object.assign({}, row))
  };
}


function _accessSourceInfo_(sheetName) {
  return SUNARPCore.getSourceInfo(
    _accessSecuritySource_(sheetName)
  );
}


/**
 * Filtra un objeto para enviar solamente columnas existentes.
 */
function _accessFilterPayload_(sheetName, record, requiredFields) {
  const headers = _accessSourceInfo_(sheetName).headers;
  const payload = {};

  Object.keys(record).forEach(field => {
    if (headers.includes(field)) {
      payload[field] = record[field];
    }
  });

  const missing = (requiredFields || []).filter(field =>
    !headers.includes(field)
  );

  if (missing.length) {
    throw new Error(
      `La pestaña "${sheetName}" no contiene: ${missing.join(', ')}.`
    );
  }

  return payload;
}


/**
 * Agrega metadatos de creación y actualización solo cuando
 * las columnas correspondientes existen en la pestaña.
 */
function _accessAddMetadata_(sheetName, record, isCreate, auth) {
  const now = new Date();

  if (isCreate) {
    record.creado_en = now;
    record.creado_por = auth.email;
    record.fecha_creacion = now;
    record.usuario_creacion = auth.email;
    record.created_at = now;
    record.created_by = auth.email;
  }

  record.actualizado_en = now;
  record.actualizado_por = auth.email;
  record.fecha_actualizacion = now;
  record.usuario_actualizacion = auth.email;
  record.updated_at = now;
  record.updated_by = auth.email;

  return _accessFilterPayload_(sheetName, record, []);
}


/**
 * Busca un registro mediante una comparación textual no sensible
 * a mayúsculas/minúsculas.
 */
function _accessFindBy_(records, field, value) {
  const expected = _accessText_(value).toLowerCase();

  return (records || []).find(row =>
    _accessText_(row[field]).toLowerCase() === expected
  ) || null;
}


/**
 * Valida el dominio institucional.
 */
function _accessValidateEmail_(email) {
  if (!/^[^\s@]+@sunarp\.gob\.pe$/i.test(email)) {
    throw new Error(
      'Ingresa un correo institucional válido del dominio sunarp.gob.pe.'
    );
  }
}


/**
 * Comprueba que la estructura orgánica exista y esté activa.
 */
function _accessValidateOrgStructure_(structureId, catalogs) {
  if (!structureId) return;

  const structure = _accessFindBy_(
    catalogs.estructuraOrg,
    'id',
    structureId
  );

  if (!structure || !_accessCatalogIsActive_(structure)) {
    throw new Error(
      'La unidad orgánica seleccionada no existe o está inactiva en Global parameters.'
    );
  }
}

/**
 * Normaliza los valores documentales para consultas exactas.
 * Se conservan letras y signos; únicamente se eliminan espacios y
 * diferencias de mayúsculas/minúsculas.
 */
function _accessNormalizeDocumentValue_(value, label) {
  const normalized = _accessText_(value).replace(/\s+/g, '').toUpperCase();
  if (!normalized) throw new Error((label || 'El documento') + ' es obligatorio.');
  if (normalized.length > 30) throw new Error((label || 'El documento') + ' no puede superar 30 caracteres.');
  return normalized;
}


function _accessLoadDocumentTypeRecords_() {
  return _accessLoadDocumentTypes_().filter(_accessCatalogIsActive_);
}


function getAccessDocumentTypes() {
  _accessRequirePermission_('USUARIOS_ADMINISTRAR');

  return _accessLoadDocumentTypeRecords_()
    .map(item => ({
      id: _accessText_(item.id),
      name: _accessText_(item.name)
    }))
    .filter(item => item.id && item.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}


/**
 * Busca una persona por coincidencia exacta de tipo y número documental.
 * La consulta y la resolución persona_id se realizan en el servidor.
 */
function searchAccessPersonByDocument(payload) {
  const auth = _accessRequirePermission_('USUARIOS_ADMINISTRAR');

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Debes indicar el tipo y número de documento.');
  }

  const documentType = _accessNormalizeDocumentValue_(
    payload.tipo_documento,
    'Tipo de documento'
  );
  const documentNumber = _accessNormalizeDocumentValue_(
    payload.numero_documento,
    'Número de documento'
  );

  const documentLookup = SUNARPCore.findRecordsByFields(
    _accessDirectorySource_('servidores datos personales'),
    { tipo_documento: documentType, numero_documento: documentNumber },
    {
      searchField: 'numero_documento',
      matchCase: false,
      requiredHeaders: ['servidor_id', 'tipo_documento', 'numero_documento'],
      projectionFields: ['servidor_id', 'tipo_documento', 'numero_documento']
    }
  );
  const matches = documentLookup.records.filter(record =>
    _accessText_(record.tipo_documento).replace(/\\s+/g, '').toUpperCase() === documentType
  );

  if (!matches.length) {
    return {
      found: false,
      message: 'No se encontró una persona con ese tipo y número de documento.'
    };
  }

  if (matches.length > 1) {
    throw new Error(
      'El documento aparece asociado a más de un registro. Debe corregirse la duplicidad antes de habilitar una cuenta.'
    );
  }

  const documentRecord = matches[0];
  const documentTypeRecord = _accessLoadDocumentTypeRecords_().find(item =>
    _accessText_(item.id).toUpperCase() ===
    _accessText_(documentRecord.tipo_documento).toUpperCase()
  );

  if (!documentTypeRecord) {
    throw new Error(
      'El tipo de documento de la persona no existe en el catálogo tipo_documento_identidad.'
    );
  }

  const personaId = _accessText_(documentRecord.servidor_id);
  const person = _accessFindPersonById_(personaId);
  if (!person) {
    throw new Error('El documento está registrado, pero no se pudo resolver la persona en el directorio.');
  }
  const name = [
    _accessText_(person.nombres),
    _accessText_(person.apellidos)
  ].filter(Boolean).join(' ');
  const email = _accessText_(person.correo_institucional);
  const emailIsValid = /^[^\s@]+@sunarp\.gob\.pe$/i.test(email);
  const existingUsers = _accessFindSecurityRecords_(
    ACCESS_MANAGEMENT_CONFIG.sheets.users,
    'persona_id',
    [personaId],
    ACCESS_MANAGEMENT_FIELDS.users
  );
  if (existingUsers.length > 1) {
    throw new Error('La persona tiene más de una cuenta registrada en Usuarios.');
  }
  const existingUser = existingUsers[0] || null;
  const personIsActive =
    !Object.prototype.hasOwnProperty.call(person, 'active') ||
    _accessIsActive_(person.active);

  let reason = '';
  if (!personIsActive) {
    reason = 'La persona está inactiva en el directorio.';
  } else if (!emailIsValid) {
    reason = 'La persona no tiene un correo institucional válido del dominio sunarp.gob.pe.';
  }

  return {
    found: true,
    canEnableAccount: personIsActive && emailIsValid && !existingUser,
    existingAccount: existingUser ? {
      exists: true,
      active: _accessIsActive_(existingUser.active)
    } : {
      exists: false,
      active: false
    },
    reason,
    person: {
      persona_id: personaId,
      nombres: _accessText_(person.nombres),
      apellidos: _accessText_(person.apellidos),
      nombre_completo: name,
      correo_institucional: email,
      tipo_documento: _accessText_(documentRecord.tipo_documento),
      tipo_documento_name: _accessText_(documentTypeRecord.name),
      numero_documento: _accessText_(documentRecord.numero_documento)
    }
  };
}


/**
 * Crea o actualiza un usuario.
 */
function _accessRecordUser_(auth, payload, action) {
  const source = _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.users);
  const personaId = _accessText_(payload.persona_id);
  const active = _accessNormalizeActive_(payload.active, 'El estado de la cuenta');
  if (!personaId) throw new Error('Selecciona una persona del directorio.');
  const person = _accessFindPersonById_(personaId);
  if (!person) throw new Error('La persona seleccionada no existe en personas.');
  _accessValidateEmail_(person.correo_institucional);
  if (
    Object.prototype.hasOwnProperty.call(person, 'active') &&
    !_accessIsActive_(person.active)
  ) {
    throw new Error('No se puede habilitar una cuenta para una persona inactiva.');
  }

  // La creación debe corresponder exactamente a la búsqueda documental
  // realizada en el servidor; no basta con enviar persona_id desde el cliente.
  if (action === 'create') {
    const documentTypeId = _accessNormalizeDocumentValue_(
      payload.tipo_documento,
      'Tipo de documento'
    );
    const documentTypeExists = _accessLoadDocumentTypeRecords_().some(item =>
      _accessText_(item.id).toUpperCase() === documentTypeId
    );
    if (!documentTypeExists) {
      throw new Error('Selecciona un tipo de documento vigente del catálogo institucional.');
    }

    const documentLookup = SUNARPCore.findRecordsByFields(
      _accessDirectorySource_('servidores datos personales'),
      { tipo_documento: documentTypeId, numero_documento: payload.numero_documento },
      { searchField: 'numero_documento', matchCase: false, requiredHeaders: ['servidor_id', 'tipo_documento', 'numero_documento'] }
    );
    const documentMatches = documentLookup.records.filter(record =>
      _accessText_(record.tipo_documento).replace(/\\s+/g, '').toUpperCase() === documentTypeId
    );

    if (
      documentMatches.length !== 1 ||
      _accessText_(documentMatches[0].servidor_id) !== personaId
    ) {
      throw new Error(
        'No se pudo validar el documento con la persona seleccionada. Realiza nuevamente la búsqueda.'
      );
    }
  }

  if (personaId === _accessText_(auth.personaId) && !active) {
    throw new Error('No puedes desactivar tu propia cuenta mientras administras el gestor.');
  }

  const matchingUsers = _accessFindSecurityRecords_(
    ACCESS_MANAGEMENT_CONFIG.sheets.users,
    'persona_id',
    [personaId],
    ACCESS_MANAGEMENT_FIELDS.users
  );
  if (matchingUsers.length > 1) {
    throw new Error('La persona tiene más de una cuenta registrada en Usuarios.');
  }
  const existing = matchingUsers[0] || null;
  if (action === 'create' && existing) throw new Error('La persona ya tiene una cuenta registrada.');
  if (action === 'edit' && !existing) throw new Error('No se encontró la cuenta que deseas actualizar.');

  const nextUser = { persona_id: personaId, active };
  const data = _accessLoadAdministratorContinuityData_();
  const after = _accessCopyData_(data);
  const continuityUserIndex = after.usuarios.findIndex(row =>
    _accessText_(row.persona_id) === personaId
  );
  if (continuityUserIndex >= 0) after.usuarios[continuityUserIndex] = nextUser;
  else after.usuarios.push(nextUser);
  _accessAssertAdministratorContinuity_(data, after);

  const name = [person.nombres, person.apellidos].map(_accessText_).filter(Boolean).join(' ');
  return _accessRunAudited_(auth, {
    accion: action === 'create' ? 'CREAR_USUARIO' : 'EDITAR_USUARIO',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'USUARIO',
    registro_id: personaId,
    registro_nombre: name,
    detalle: 'Administración de habilitación de cuenta institucional.',
    datos_antes: existing || null
  }, () => {
    const record = _accessAddMetadata_(ACCESS_MANAGEMENT_CONFIG.sheets.users, nextUser, action === 'create', auth);
    if (action === 'create') {
      SUNARPCore.insertRecord(source, record, { idField: 'persona_id' });
    } else {
      const updates = Object.assign({}, record);
      delete updates.persona_id;
      SUNARPCore.updateRecord(source, 'persona_id', personaId, updates);
    }
    return {
      value: { success: true, message: action === 'create' ? 'Cuenta habilitada correctamente.' : 'Cuenta actualizada correctamente.' },
      auditAfter: nextUser
    };
  });
}


function saveAccessUser(payload) {
  const auth = _accessRequirePermission_('USUARIOS_ADMINISTRAR');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('No se recibieron los datos de la cuenta.');
  const action = _accessText_(payload.action).toLowerCase();
  if (!['create', 'edit'].includes(action)) throw new Error('La operación de la cuenta no es válida.');
  return _accessRecordUser_(auth, payload, action);
}


function saveAccessUserRole(payload) {
  const auth = _accessRequirePermission_('ROLES_ADMINISTRAR');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('No se recibieron los datos de la asignación de rol.');
  const personaId = _accessText_(payload.persona_id);
  const moduleId = _accessText_(payload.modulo_id);
  const roleId = _accessText_(payload.rol_id);
  const active = roleId ? _accessNormalizeActive_(payload.active === undefined ? true : payload.active, 'El estado de la asignación') : false;
  if (!personaId || !moduleId) throw new Error('Debes indicar persona_id y modulo_id.');

  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const users = _accessFindSecurityRecords_(
    s.users, 'persona_id', [personaId], ACCESS_MANAGEMENT_FIELDS.users
  );
  if (!users.some(row => _accessIsActive_(row.active))) {
    throw new Error('La persona no tiene una cuenta activa.');
  }
  const moduleMatches = _accessFindSecurityRecords_(
    s.modules, 'modulo_id', [moduleId], ACCESS_MANAGEMENT_FIELDS.modules
  ).filter(row => _accessIsActive_(row.active));
  if (moduleMatches.length !== 1) throw new Error('El módulo no existe, está inactivo o está duplicado.');
  const module = moduleMatches[0];

  if (active) {
    const roles = _accessFindSecurityRecords_(
      s.roles, 'rol_id', [roleId], ACCESS_MANAGEMENT_FIELDS.roles
    );
    if (!roles.some(row => _accessIsActive_(row.active))) {
      throw new Error('El rol seleccionado no existe o está inactivo.');
    }
  }

  const previous = _accessFindSecurityRecordsByFilters_(
    s.userRoles,
    { persona_id: personaId, modulo_id: moduleId },
    'persona_id',
    ACCESS_MANAGEMENT_FIELDS.userRoles
  );
  const data = _accessLoadAdministratorContinuityData_();
  const after = _accessCopyData_(data);
  const accessModuleId = (data.modulos[0] && _accessText_(data.modulos[0].modulo_id)) || '';
  if (moduleId === accessModuleId) {
    after.usuarioRol = after.usuarioRol.filter(item =>
      !(_accessText_(item.persona_id) === personaId &&
        _accessText_(item.modulo_id) === moduleId)
    );
    if (active && roleId === ACCESS_MANAGEMENT_CONFIG.adminRoleId) {
      after.usuarioRol.push({
        persona_id: personaId, modulo_id: moduleId,
        rol_id: roleId, active: true
      });
    }
  }
  _accessAssertAdministratorContinuity_(data, after);

  const person = _accessFindPersonById_(personaId);
  return _accessRunAudited_(auth, {
    accion: 'ACTUALIZAR_ROL_USUARIO',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'USUARIO_ROL',
    registro_id: personaId,
    registro_nombre: [person && person.nombres, person && person.apellidos].filter(Boolean).join(' '),
    detalle: 'Actualización de rol asignado en el módulo ' + _accessText_(module.nombre || module.codigo) + '.',
    datos_antes: previous
  }, () => {
    const result = SUNARPCore.syncRecordsByKey(
      _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.userRoles),
      { persona_id: personaId, modulo_id: moduleId },
      ['rol_id'],
      active ? [{ rol_id: roleId }] : [],
      'active', true, false
    );
    return {
      value: { success: true, message: active ? 'Rol asignado al módulo correctamente.' : 'Asignación de rol retirada correctamente.', ...result },
      auditAfter: active ? [{ persona_id: personaId, modulo_id: moduleId, rol_id: roleId, active: true }] : []
    };
  });
}


function saveAccessRole(payload) {
  const auth = _accessRequirePermission_('ROLES_ADMINISTRAR');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('No se recibieron los datos del rol.');
  const action = _accessText_(payload.action).toLowerCase();
  const name = _accessText_(payload.nombre || payload.name);
  const description = _accessText_(payload.descripcion || payload.description);
  if (!['create', 'edit'].includes(action)) throw new Error('La operación del rol no es válida.');
  if (!name) throw new Error('Ingresa el nombre del rol.');

  const rolesSheet = ACCESS_MANAGEMENT_CONFIG.sheets.roles;
  const originalId = action === 'edit' ? _accessUpper_(payload.rol_id_original || payload.originalRoleId || payload.rol_id) : '';
  const existingMatches = action === 'edit'
    ? _accessFindSecurityRecords_(rolesSheet, 'rol_id', [originalId], ACCESS_MANAGEMENT_FIELDS.roles)
    : [];
  if (action === 'edit' && existingMatches.length !== 1) throw new Error('No se encontró un único rol para actualizar.');
  const existing = existingMatches[0] || null;
  const duplicateNames = _accessFindSecurityRecords_(
    rolesSheet,
    'nombre',
    [name],
    ACCESS_MANAGEMENT_FIELDS.roles,
    { matchCase: false, projectionFields: ['rol_id', 'nombre'] }
  );
  if (duplicateNames.some(row => _accessText_(row.rol_id) !== originalId &&
      _accessText_(row.nombre).toLowerCase() === name.toLowerCase())) {
    throw new Error('Ya existe un rol con ese nombre.');
  }

  const roleId = action === 'create'
    ? _accessGenerateUniqueIdentifierFromSource_(
        rolesSheet, 'ROL_', name, 'rol_id', ACCESS_MANAGEMENT_FIELDS.roles, 50
      )
    : originalId;
  const active = action === 'create' ? true : _accessIsActive_(existing.active);
  const nextRole = { rol_id: roleId, nombre: name, descripcion: description, active };
  const data = _accessLoadAdministratorContinuityData_();
  const after = _accessCopyData_(data);
  if (roleId === ACCESS_MANAGEMENT_CONFIG.adminRoleId) {
    if (action === 'edit') {
      const index = after.roles.findIndex(row => _accessText_(row.rol_id) === originalId);
      if (index >= 0) after.roles[index] = Object.assign({}, after.roles[index], nextRole);
    } else {
      after.roles.push(nextRole);
    }
  }
  _accessAssertAdministratorContinuity_(data, after);

  return _accessRunAudited_(auth, {
    accion: action === 'create' ? 'CREAR_ROL' : 'EDITAR_ROL',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'ROL',
    registro_id: roleId,
    registro_nombre: name,
    detalle: 'Administración de rol.',
    datos_antes: existing || null
  }, () => {
    const sheet = ACCESS_MANAGEMENT_CONFIG.sheets.roles;
    const source = _accessSecuritySource_(sheet);
    const record = _accessAddMetadata_(sheet, nextRole, action === 'create', auth);
    if (action === 'create') {
      SUNARPCore.insertRecord(source, record, { idField: 'rol_id' });
    } else {
      const updates = Object.assign({}, record);
      delete updates.rol_id;
      SUNARPCore.updateRecord(source, 'rol_id', originalId, updates);
    }
    return {
      value: { success: true, rol_id: roleId, message: action === 'create' ? 'Rol creado correctamente.' : 'Rol actualizado correctamente.' },
      auditAfter: nextRole
    };
  });
}

function saveAccessPermission(payload) {
  const auth = _accessRequirePermission_('PERMISOS_ADMINISTRAR');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('No se recibieron los datos del permiso.');
  const action = _accessText_(payload.action).toLowerCase();
  const moduleId = _accessText_(payload.modulo_id || payload.moduleId);
  const operationId = _accessUpper_(payload.operacion_id || payload.operationId);
  const description = _accessText_(payload.descripcion || payload.description);
  if (!['create', 'edit'].includes(action)) throw new Error('La operación del permiso no es válida.');
  if (!moduleId || !operationId || !description) throw new Error('Completa el módulo, la operación y la descripción del permiso.');
  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const moduleMatches = _accessFindSecurityRecords_(
    s.modules, 'modulo_id', [moduleId], ACCESS_MANAGEMENT_FIELDS.modules
  ).filter(item => _accessIsActive_(item.active));
  if (moduleMatches.length !== 1) throw new Error('El módulo no existe, está inactivo o está duplicado.');
  const module = moduleMatches[0];
  const originalId = action === 'edit' ? _accessUpper_(payload.permiso_id_original || payload.originalPermissionId || payload.permiso_id) : '';
  const existingMatches = action === 'edit'
    ? _accessFindSecurityRecords_(s.permissions, 'permiso_id', [originalId], ACCESS_MANAGEMENT_FIELDS.permissions)
    : [];
  if (action === 'edit' && existingMatches.length !== 1) throw new Error('No se encontró un único permiso para actualizar.');
  const existing = existingMatches[0] || null;
  const operationMatches = _accessFindSecurityRecords_(
    s.operations, 'operacion_id', [operationId], ACCESS_MANAGEMENT_FIELDS.operations
  );
  const operation = operationMatches.find(item => _accessCatalogIsActive_(item));
  if (!operation || (action === 'create' && !_accessCatalogIsActive_(operation))) throw new Error('Selecciona una operación activa del catálogo Operaciones.');
  if (action === 'edit' && operationId !== _accessUpper_(existing.operacion_id)) throw new Error('La operación de un permiso existente es inmutable porque forma parte de su código.');
  if (action === 'edit' && moduleId !== _accessText_(existing.modulo_id)) throw new Error('El módulo de un permiso existente es inmutable. Crea otro permiso y reasigna sus relaciones.');
  const code = action === 'create' ? _accessBuildPermissionCode_(module.codigo, operationId) : _accessUpper_(existing.codigo);
  const codeMatches = _accessFindSecurityRecords_(
    s.permissions, 'codigo', [code], ACCESS_MANAGEMENT_FIELDS.permissions
  );
  if (codeMatches.some(row => _accessText_(row.permiso_id) !== originalId)) {
    throw new Error('Ya existe un permiso con esa combinación de módulo y operación.');
  }
  const permissionId = action === 'create'
    ? _accessGenerateUniqueIdentifierFromSource_(
        s.permissions, 'PERM_', code, 'permiso_id', ACCESS_MANAGEMENT_FIELDS.permissions, 50
      )
    : originalId;
  const active = action === 'create' ? true : _accessIsActive_(existing.active);
  const nextPermission = { permiso_id: permissionId, codigo: code, modulo_id: moduleId, operacion_id: operationId, descripcion: description, active };
  const data = _accessLoadAdministratorContinuityData_();
  const after = _accessCopyData_(data);
  if (moduleId === _accessText_(data.modulos[0] && data.modulos[0].modulo_id) &&
      ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes.includes(code)) {
    after.permisos = after.permisos.filter(row =>
      _accessText_(row.permiso_id) !== permissionId &&
      _accessUpper_(row.codigo) !== code
    );
    after.permisos.push(nextPermission);
  } else if (action === 'edit' && ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes.includes(code)) {
    const index = after.permisos.findIndex(row => _accessText_(row.permiso_id) === permissionId);
    if (index >= 0) after.permisos[index] = Object.assign({}, after.permisos[index], nextPermission);
  }
  _accessAssertAdministratorContinuity_(data, after);
  return _accessRunAudited_(auth, {
    accion: action === 'create' ? 'CREAR_PERMISO' : 'EDITAR_PERMISO',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'PERMISO', registro_id: permissionId, registro_nombre: code,
    detalle: 'Administración de permiso.', datos_antes: existing || null
  }, () => {
    const sheet = ACCESS_MANAGEMENT_CONFIG.sheets.permissions;
    const source = _accessSecuritySource_(sheet);
    const record = _accessFilterPayload_(sheet, nextPermission, ['permiso_id', 'codigo', 'modulo_id', 'operacion_id', 'descripcion', 'active']);
    if (action === 'create') SUNARPCore.insertRecord(source, record, { idField: 'permiso_id' });
    else {
      const updates = Object.assign({}, record); delete updates.permiso_id;
      SUNARPCore.updateRecord(source, 'permiso_id', permissionId, updates);
    }
    return { value: { success: true, permiso_id: permissionId, codigo: code, operacion_id: operationId, message: action === 'create' ? 'Permiso creado correctamente.' : 'Permiso actualizado correctamente.' }, auditAfter: nextPermission };
  });
}

function saveRolePermissions(payload) {
  const auth = _accessRequirePermission_('ROLES_ADMINISTRAR');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('No se recibieron las asignaciones.');

  const roleId = _accessUpper_(payload.rol_id || payload.roleId);
  const selected = Array.isArray(payload.permiso_ids) ? payload.permiso_ids :
    Array.isArray(payload.permissionIds) ? payload.permissionIds : [];
  if (!roleId) throw new Error('Selecciona un rol.');

  const permissionIds = [...new Set(selected.map(_accessText_).filter(Boolean))];
  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const roles = _accessFindSecurityRecords_(
    s.roles, 'rol_id', [roleId], ACCESS_MANAGEMENT_FIELDS.roles
  );
  const role = roles.find(row => _accessIsActive_(row.active));
  if (!role) throw new Error('El rol no existe o está inactivo.');

  const selectedPermissions = _accessFindSecurityRecords_(
    s.permissions, 'permiso_id', permissionIds, ACCESS_MANAGEMENT_FIELDS.permissions
  );
  const activePermissionIds = new Set(
    selectedPermissions.filter(row => _accessIsActive_(row.active))
      .map(row => _accessText_(row.permiso_id))
  );
  const invalid = permissionIds.filter(id => !activePermissionIds.has(id));
  if (invalid.length) throw new Error('Hay permisos inexistentes o inactivos: ' + invalid.join(', ') + '.');

  const previousAssignments = _accessFindSecurityRecords_(
    s.rolePermissions, 'rol_id', [roleId], ACCESS_MANAGEMENT_FIELDS.rolePermissions
  );
  const data = _accessLoadAdministratorContinuityData_();
  const after = _accessCopyData_(data);
  if (roleId === ACCESS_MANAGEMENT_CONFIG.adminRoleId) {
    after.rolPermiso = after.rolPermiso.filter(row =>
      _accessText_(row.rol_id) !== roleId
    );
    permissionIds.forEach(id => after.rolPermiso.push({
      rol_id: roleId, permiso_id: id, active: true
    }));
  }
  _accessAssertAdministratorContinuity_(data, after);

  return _accessRunAudited_(auth, {
    accion: 'ACTUALIZAR_ASIGNACION_PERMISOS',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'ROL_PERMISO',
    registro_id: roleId,
    registro_nombre: _accessText_(role.nombre),
    detalle: 'Actualización de permisos asignados al rol.',
    datos_antes: previousAssignments
  }, () => {
    const result = SUNARPCore.syncRecordsByKey(
      _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.rolePermissions),
      { rol_id: roleId },
      ['permiso_id'],
      permissionIds.map(id => ({ permiso_id: id })),
      'active', true, false
    );
    return {
      value: { success: true, message: 'Asignaciones actualizadas correctamente.', ...result },
      auditAfter: permissionIds.map(id => ({ permiso_id: id, active: true }))
    };
  });
}


function saveAccessScopes(payload) {
  const auth = _accessRequirePermission_('AMBITOS_ACCESO_ADMINISTRAR');
  const personaId = _accessText_(payload && payload.persona_id);
  const moduleId = _accessText_(payload && payload.modulo_id);
  const scopesInput = Array.isArray(payload && payload.ambitos) ? payload.ambitos :
    Array.isArray(payload && payload.scopes) ? payload.scopes : [];

  if (!personaId || !moduleId) throw new Error('Debes indicar persona_id y modulo_id.');

  const targetUsers = _accessFindSecurityRecords_(
    ACCESS_MANAGEMENT_CONFIG.sheets.users,
    'persona_id', [personaId], ACCESS_MANAGEMENT_FIELDS.users,
    { projectionFields: ['persona_id', 'active'] }
  );
  if (!targetUsers.some(row => _accessIsActive_(row.active))) {
    throw new Error('La persona no tiene una cuenta activa.');
  }
  const targetRoles = _accessFindSecurityRecordsByFilters_(
    ACCESS_MANAGEMENT_CONFIG.sheets.userRoles,
    { persona_id: personaId, modulo_id: moduleId },
    'persona_id',
    ACCESS_MANAGEMENT_FIELDS.userRoles
  );
  if (!targetRoles.some(row => _accessIsActive_(row.active))) {
    throw new Error('La persona debe tener un rol activo en el módulo antes de asignarle ámbitos.');
  }
  const targetModules = _accessFindSecurityRecords_(
    ACCESS_MANAGEMENT_CONFIG.sheets.modules,
    'modulo_id', [moduleId], ACCESS_MANAGEMENT_FIELDS.modules
  ).filter(row => _accessIsActive_(row.active));
  if (targetModules.length !== 1) throw new Error('El módulo no existe, está inactivo o está duplicado.');
  const module = targetModules[0];
  const targetScopes = _accessFindSecurityRecords_(
    ACCESS_MANAGEMENT_CONFIG.sheets.scopes,
    'persona_id', [personaId], ACCESS_MANAGEMENT_FIELDS.scopes
  );
  const scopeTypes = _accessLoadSecurityRecords_(
    ACCESS_MANAGEMENT_CONFIG.sheets.scopeTypes,
    ACCESS_MANAGEMENT_FIELDS.scopeTypes
  );
  const data = {
    usuarios: targetUsers,
    usuarioRol: targetRoles,
    modulos: targetModules,
    tiposAmbito: scopeTypes,
    ambitosAcceso: targetScopes
  };

  // Resolver por ID solo las referencias afectadas por la operación y las
  // referencias vigentes de otros módulos usadas para validar la sede única.
  const referenceIdsByEntity = {
    SEDE: new Set(),
    ESTRUCTURA_ORG: new Set(),
    LOCAL: new Set()
  };
  scopesInput.forEach(item => {
    const type = _accessUpper_(item.tipo_ambito_id || item.scopeType);
    const typeConfig = _accessScopeType_(data, type);
    const entity = typeConfig && _accessUpper_(typeConfig.entidad_referencia);
    const referenceId = _accessText_(item.referencia_id || item.referenceId);
    if (referenceId && referenceIdsByEntity[entity]) {
      referenceIdsByEntity[entity].add(referenceId);
    }
  });
  targetScopes.forEach(scope => {
    if (!_accessIsActive_(scope.active) ||
        _accessText_(scope.modulo_id) === moduleId) return;
    const type = _accessUpper_(scope.tipo_ambito_id);
    const referenceId = _accessText_(scope.referencia_id);
    if (referenceId && referenceIdsByEntity[type]) {
      referenceIdsByEntity[type].add(referenceId);
    }
  });
  const structures = _accessFindOrgCatalogByIds_(
    'ESTRUCTURA_ORG', Array.from(referenceIdsByEntity.ESTRUCTURA_ORG)
  );
  const sites = _accessFindOrgCatalogByIds_(
    'SEDE', Array.from(referenceIdsByEntity.SEDE)
  );
  const locals = _accessFindOrgCatalogByIds_(
    'LOCAL', Array.from(referenceIdsByEntity.LOCAL)
  );

  const normalized = scopesInput.map(item => {
    const type = _accessUpper_(item.tipo_ambito_id || item.scopeType);
    const referenceId = _accessText_(item.referencia_id || item.referenceId);
    const includeInput = item.incluir_descendientes !== undefined ? item.incluir_descendientes : item.includeDescendants;
    const typeConfig = _accessScopeType_(data, type);
    if (!typeConfig) throw new Error('Tipo de ámbito no válido o inactivo: ' + (type || '(vacío)') + '.');
    const referenceEntity = _accessUpper_(typeConfig.entidad_referencia);
    const requiresReference = _accessFlag_(typeConfig.requiere_referencia);
    const allowsDescendants = _accessFlag_(typeConfig.permite_descendientes);
    if (!requiresReference && referenceId) throw new Error('El ámbito ' + type + ' no admite referencia_id.');
    if (requiresReference && !referenceId) throw new Error('El ámbito ' + type + ' requiere una referencia.');
    if (referenceEntity === 'NINGUNA') return { tipo_ambito_id: type, referencia_id: '', incluir_descendientes: 'NO', _siteId: '' };
    if (referenceEntity === 'SEDE') {
      const site = _accessFindBy_(sites, 'id', referenceId);
      if (!site || !_accessCatalogIsActive_(site)) throw new Error('La sede "' + referenceId + '" no existe o está inactiva.');
      return { tipo_ambito_id: type, referencia_id: referenceId, incluir_descendientes: 'NO', _siteId: referenceId };
    }
    if (referenceEntity === 'ESTRUCTURA_ORG') {
      const structure = _accessFindBy_(structures, 'id', referenceId);
      if (!structure || !_accessCatalogIsActive_(structure)) throw new Error('La estructura orgánica "' + referenceId + '" no existe o está inactiva.');
      const descendants = _accessFlag_(includeInput);
      if (descendants && !allowsDescendants) throw new Error('El tipo de ámbito ' + type + ' no permite incluir descendientes.');
      return { tipo_ambito_id: type, referencia_id: referenceId, incluir_descendientes: descendants ? 'SI' : 'NO', _siteId: _accessText_(structure.sede_id) };
    }
    if (referenceEntity === 'LOCAL') {
      const local = _accessFindBy_(locals, 'id', referenceId);
      if (!local || !_accessCatalogIsActive_(local)) throw new Error('El local "' + referenceId + '" no existe o está inactivo.');
      return { tipo_ambito_id: type, referencia_id: referenceId, incluir_descendientes: 'NO', _siteId: _accessText_(local.sede_id) };
    }
    throw new Error('El catálogo TiposAmbito contiene una entidad_referencia no admitida para ' + type + '.');
  });

  if (normalized.some(item => item.tipo_ambito_id === 'TOTAL') && normalized.length > 1) {
    throw new Error('TOTAL es exclusivo dentro del mismo módulo.');
  }

  const seen = new Set();
  normalized.forEach(item => {
    const key = item.tipo_ambito_id + '\\u0000' + item.referencia_id;
    if (seen.has(key)) throw new Error('Has seleccionado un ámbito duplicado.');
    seen.add(key);
  });

  // Los ámbitos específicos se restringen a una sola sede en todos los módulos.
  // TOTAL solo es exclusivo dentro del módulo al que pertenece.
  const siteIds = new Set();
  data.ambitosAcceso.forEach(scope => {
    if (!_accessIsActive_(scope.active)) return;
    const type = _accessUpper_(scope.tipo_ambito_id);
    const referenceId = _accessText_(scope.referencia_id);
    if (!['TOTAL', 'SEDE', 'ESTRUCTURA_ORG', 'LOCAL'].includes(type)) {
      throw new Error('AmbitosAcceso contiene un tipo de ámbito no reconocido: ' + type + '.');
    }
    if (type === 'TOTAL' && referenceId) {
      throw new Error('Un ámbito TOTAL debe tener referencia_id vacío.');
    }
    if (type !== 'TOTAL' && !referenceId) {
      throw new Error('Un ámbito ' + type + ' requiere referencia_id.');
    }
  });

  const existingSpecific = data.ambitosAcceso.filter(scope =>
    _accessText_(scope.persona_id) === personaId &&
    _accessText_(scope.modulo_id) !== moduleId &&
    _accessIsActive_(scope.active) &&
    _accessUpper_(scope.tipo_ambito_id) !== 'TOTAL'
  );

  existingSpecific.forEach(scope => {
    const type = _accessUpper_(scope.tipo_ambito_id);
    const refId = _accessText_(scope.referencia_id);
    let siteId = '';
    if (type === 'SEDE') siteId = refId;
    if (type === 'ESTRUCTURA_ORG') {
      const structure = _accessFindBy_(structures, 'id', refId);
      siteId = _accessCatalogIsActive_(structure) ? _accessText_(structure.sede_id) : '';
    }
    if (type === 'LOCAL') {
      const local = _accessFindBy_(locals, 'id', refId);
      siteId = _accessCatalogIsActive_(local) ? _accessText_(local.sede_id) : '';
    }
    if (!siteId) throw new Error('Existe un ámbito específico previo con referencia inválida. Corrige ese ámbito antes de continuar.');
    siteIds.add(siteId);
  });

  normalized.forEach(scope => {
    if (scope.tipo_ambito_id !== 'TOTAL') {
      if (!scope._siteId) throw new Error('No se pudo determinar la sede del ámbito.');
      siteIds.add(scope._siteId);
    }
  });

  if (siteIds.size > 1) {
    throw new Error('Los ámbitos específicos de una persona deben pertenecer a una sola sede, aunque correspondan a módulos distintos.');
  }

  const recordsToSync = normalized.map(scope => ({
    tipo_ambito_id: scope.tipo_ambito_id,
    referencia_id: scope.referencia_id,
    incluir_descendientes: scope.incluir_descendientes
  }));

  const before = data.ambitosAcceso.filter(row =>
    _accessText_(row.persona_id) === personaId &&
    _accessText_(row.modulo_id) === moduleId
  );
  const continuityData = _accessLoadAdministratorContinuityData_();
  const afterContinuity = _accessCopyData_(continuityData);
  const accessModuleId = (continuityData.modulos[0] &&
    _accessText_(continuityData.modulos[0].modulo_id)) || '';
  if (moduleId === accessModuleId) {
    afterContinuity.ambitosAcceso = afterContinuity.ambitosAcceso.filter(row =>
      !(_accessText_(row.persona_id) === personaId &&
        _accessText_(row.modulo_id) === moduleId)
    );
    recordsToSync.filter(row => row.tipo_ambito_id === 'TOTAL').forEach(row => {
      afterContinuity.ambitosAcceso.push(Object.assign({
        persona_id: personaId, modulo_id: moduleId, active: true
      }, row));
    });
  }
  _accessAssertAdministratorContinuity_(continuityData, afterContinuity);
  const person = _accessFindPersonById_(personaId);

  return _accessRunAudited_(auth, {
    accion: 'ACTUALIZAR_AMBITOS',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'AMBITO_ACCESO',
    registro_id: personaId,
    registro_nombre: [person && person.nombres, person && person.apellidos].filter(Boolean).join(' '),
    detalle: 'Actualización de ámbitos del módulo ' + _accessText_(module.nombre || module.codigo) + '.',
    ambito_modulo: _accessText_(module.codigo),
    datos_antes: before
  }, () => {
    const result = SUNARPCore.syncRecordsByKey(
      _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.scopes),
      { persona_id: personaId, modulo_id: moduleId },
      ['tipo_ambito_id', 'referencia_id'],
      recordsToSync,
      'active',
      true,
      false,
      { allowEmptyKeyFields: ['referencia_id'] }
    );
    return {
      value: { success: true, message: 'Ámbitos de acceso actualizados correctamente.', ...result },
      auditAfter: recordsToSync.map(item => Object.assign({}, item, { active: true }))
    };
  });
}


/**
 * Guarda en bloque los roles y ámbitos de acceso de una persona.
 *
 * El cliente envía el conjunto completo de asignaciones activas.
 * SUNARP Core sincroniza todas las relaciones de la persona mediante
 * claves compuestas, evitando una llamada remota por módulo.
 */
function saveAccessUserConfiguration(payload) {
  const auth = _accessRequirePermission_('USUARIOS_ADMINISTRAR');
  _accessRequirePermission_('ROLES_ADMINISTRAR');

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('No se recibieron los accesos que deseas guardar.');
  }

  const personaId = _accessText_(payload.persona_id);
  const accessInput = Array.isArray(payload.accesos)
    ? payload.accesos
    : null;

  if (!personaId || !accessInput) {
    throw new Error('Debes indicar la persona y la lista de accesos por módulo.');
  }

  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const targetUsers = _accessFindSecurityRecords_(
    s.users, 'persona_id', [personaId], ACCESS_MANAGEMENT_FIELDS.users
  );
  const user = targetUsers.find(item => _accessIsActive_(item.active));
  if (!user) {
    throw new Error('La persona no tiene una cuenta activa.');
  }

  const continuityData = _accessLoadAdministratorContinuityData_();
  const targetUserRoles = _accessFindSecurityRecords_(
    s.userRoles, 'persona_id', [personaId], ACCESS_MANAGEMENT_FIELDS.userRoles
  );
  const targetScopes = _accessFindSecurityRecords_(
    s.scopes, 'persona_id', [personaId], ACCESS_MANAGEMENT_FIELDS.scopes
  );

  // El editor solo necesita los módulos y roles vinculados a esta persona
  // o incluidos en el envío; no requiere descargar ambos catálogos completos.
  const moduleIds = Array.from(new Set(
    targetUserRoles.map(item => _accessText_(item.modulo_id))
      .concat(accessInput.map(item => _accessText_(item && item.modulo_id)))
      .filter(Boolean)
  ));
  const roleIds = Array.from(new Set(
    targetUserRoles.map(item => _accessText_(item.rol_id))
      .concat(accessInput.map(item => _accessText_(item && item.rol_id)))
      .filter(Boolean)
  ));
  const modulesCatalog = _accessFindSecurityRecords_(
    s.modules, 'modulo_id', moduleIds, ACCESS_MANAGEMENT_FIELDS.modules
  );
  const rolesCatalog = _accessFindSecurityRecords_(
    s.roles, 'rol_id', roleIds, ACCESS_MANAGEMENT_FIELDS.roles
  );
  const scopeTypesCatalog = _accessLoadSecurityRecords_(
    s.scopeTypes, ACCESS_MANAGEMENT_FIELDS.scopeTypes
  );
  const data = {
    usuarios: _accessMergeUniqueRows_(
      [continuityData.usuarios, targetUsers], ['persona_id']
    ),
    modulos: _accessMergeUniqueRows_(
      [continuityData.modulos, modulesCatalog], ['modulo_id']
    ),
    roles: _accessMergeUniqueRows_(
      [continuityData.roles, rolesCatalog], ['rol_id']
    ),
    usuarioRol: _accessMergeUniqueRows_(
      [continuityData.usuarioRol, targetUserRoles],
      ['persona_id', 'modulo_id', 'rol_id', 'active']
    ),
    permisos: continuityData.permisos,
    rolPermiso: continuityData.rolPermiso,
    ambitosAcceso: _accessMergeUniqueRows_(
      [continuityData.ambitosAcceso, targetScopes],
      ['persona_id', 'modulo_id', 'tipo_ambito_id', 'referencia_id', 'active']
    ),
    tiposAmbito: scopeTypesCatalog
  };

  const accessModuleId = _accessResolveModuleId_(
    auth,
    ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses
  );

  const canManageScopes = _accessHasPermission_(
    auth,
    'AMBITOS_ACCESO_ADMINISTRAR',
    accessModuleId
  );

  const modulesById = new Map(
    data.modulos.map(module => [
      _accessText_(module.modulo_id),
      module
    ])
  );

  const rolesById = new Map(
    data.roles.map(role => [
      _accessText_(role.rol_id),
      role
    ])
  );

  const previousRoles = data.usuarioRol
    .filter(item =>
      _accessText_(item.persona_id) === personaId &&
      _accessIsActive_(item.active)
    )
    .map(item => ({
      modulo_id: _accessText_(item.modulo_id),
      rol_id: _accessText_(item.rol_id)
    }));

  const previousScopes = data.ambitosAcceso
    .filter(item =>
      _accessText_(item.persona_id) === personaId &&
      _accessIsActive_(item.active)
    )
    .map(item => ({
      modulo_id: _accessText_(item.modulo_id),
      tipo_ambito_id: _accessUpper_(item.tipo_ambito_id),
      referencia_id: _accessText_(item.referencia_id),
      incluir_descendientes: _accessUpper_(item.incluir_descendientes) === 'SI'
        ? 'SI'
        : 'NO'
    }));

  const previousRoleByModule = new Map(
    previousRoles.map(item => [item.modulo_id, item.rol_id])
  );

  const previousScopesByModule = new Map();

  previousScopes.forEach(scope => {
    if (!previousScopesByModule.has(scope.modulo_id)) {
      previousScopesByModule.set(scope.modulo_id, []);
    }

    previousScopesByModule.get(scope.modulo_id).push(scope);
  });

  const requestedByModule = new Map();

  accessInput.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('La asignación número ' + (index + 1) + ' no es válida.');
    }

    const moduleId = _accessText_(item.modulo_id);
    const roleId = _accessText_(item.rol_id);

    if (!moduleId || !roleId) {
      throw new Error('Cada acceso debe tener un módulo y un rol.');
    }

    if (requestedByModule.has(moduleId)) {
      throw new Error('Has agregado más de una asignación para el mismo módulo.');
    }

    requestedByModule.set(moduleId, {
      modulo_id: moduleId,
      rol_id: roleId,
      ambitos: Array.isArray(item.ambitos) ? item.ambitos : []
    });
  });

  const desiredRolesByModule = new Map();

  // Las asignaciones de módulos inactivos o que ya no figuran en el catálogo
  // se preservan. No se deben retirar como efecto colateral de editar otros módulos.
  previousRoles.forEach(previous => {
    const module = modulesById.get(previous.modulo_id);

    if (!module || !_accessIsActive_(module.active)) {
      desiredRolesByModule.set(previous.modulo_id, previous.rol_id);
    }
  });

  requestedByModule.forEach((requested, moduleId) => {
    const module = modulesById.get(moduleId);
    const previousRoleId = previousRoleByModule.get(moduleId) || '';

    if (!module || !_accessIsActive_(module.active)) {
      if (previousRoleId && previousRoleId === requested.rol_id) {
        desiredRolesByModule.set(moduleId, previousRoleId);
        return;
      }

      throw new Error(
        'No puedes agregar ni modificar asignaciones de un módulo inactivo o no disponible.'
      );
    }

    const role = rolesById.get(requested.rol_id);

    if (
      (!role || !_accessIsActive_(role.active)) &&
      previousRoleId !== requested.rol_id
    ) {
      throw new Error('El rol seleccionado no existe o está inactivo.');
    }

    desiredRolesByModule.set(moduleId, requested.rol_id);
  });

  const desiredRoles = Array.from(desiredRolesByModule.entries())
    .map(([moduloId, roleId]) => ({
      modulo_id: moduloId,
      rol_id: roleId
    }));

  const desiredRoleIds = new Set(
    desiredRoles.map(item => item.modulo_id)
  );

  if (!canManageScopes) {
    const removingRoleWithScopes = previousScopes.some(scope =>
      previousRoleByModule.has(scope.modulo_id) &&
      !desiredRoleIds.has(scope.modulo_id)
    );

    if (removingRoleWithScopes) {
      throw new Error(
        'No puedes retirar un acceso que tiene ámbitos asignados porque no tienes permiso para administrarlos.'
      );
    }
  }

  let desiredScopes = previousScopes.map(scope => Object.assign({}, scope));
  let scopesChanged = false;

  if (canManageScopes) {
    const referenceIdsByEntity = {
      SEDE: new Set(),
      ESTRUCTURA_ORG: new Set(),
      LOCAL: new Set()
    };
    requestedByModule.forEach(requested => {
      (requested.ambitos || []).forEach(scopeInput => {
        const type = _accessUpper_(
          scopeInput && (scopeInput.tipo_ambito_id || scopeInput.scopeType)
        );
        const typeConfig = _accessScopeType_(data, type);
        const entity = typeConfig && _accessUpper_(typeConfig.entidad_referencia);
        const referenceId = _accessText_(
          scopeInput && (scopeInput.referencia_id || scopeInput.referenceId)
        );
        if (referenceId && referenceIdsByEntity[entity]) {
          referenceIdsByEntity[entity].add(referenceId);
        }
      });
    });
    const structures = _accessFindOrgCatalogByIds_(
      'ESTRUCTURA_ORG', Array.from(referenceIdsByEntity.ESTRUCTURA_ORG)
    );
    const sites = _accessFindOrgCatalogByIds_(
      'SEDE', Array.from(referenceIdsByEntity.SEDE)
    );
    const locals = _accessFindOrgCatalogByIds_(
      'LOCAL', Array.from(referenceIdsByEntity.LOCAL)
    );

    const normalizedScopes = [];

    requestedByModule.forEach((requested, moduleId) => {
      const module = modulesById.get(moduleId);

      // Los ámbitos de módulos inactivos se conservan sin modificarlos.
      if (!module || !_accessIsActive_(module.active)) {
        return;
      }

      requested.ambitos.forEach(scopeInput => {
        const type = _accessUpper_(
          scopeInput && (scopeInput.tipo_ambito_id || scopeInput.scopeType)
        );

        const referenceId = _accessText_(
          scopeInput && (scopeInput.referencia_id || scopeInput.referenceId)
        );

        const includeInput = scopeInput && scopeInput.incluir_descendientes !== undefined
          ? scopeInput.incluir_descendientes
          : scopeInput && scopeInput.includeDescendants;

        const typeConfig = _accessScopeType_(data, type);
        if (!typeConfig) throw new Error('Tipo de ámbito no válido o inactivo: ' + (type || '(vacío)') + '.');
        const referenceEntity = _accessUpper_(typeConfig.entidad_referencia);
        const requiresReference = _accessFlag_(typeConfig.requiere_referencia);
        const allowsDescendants = _accessFlag_(typeConfig.permite_descendientes);
        if (!requiresReference && referenceId) throw new Error('El ámbito ' + type + ' no admite referencia.');
        if (requiresReference && !referenceId) throw new Error('El ámbito ' + type + ' requiere una referencia.');
        if (referenceEntity === 'NINGUNA') {
          normalizedScopes.push({ modulo_id: moduleId, tipo_ambito_id: type, referencia_id: '', incluir_descendientes: 'NO' });
          return;
        }
        if (referenceEntity === 'SEDE') {
          const site = _accessFindBy_(sites, 'id', referenceId);
          if (!site || !_accessCatalogIsActive_(site)) throw new Error('La sede seleccionada no existe o está inactiva.');
          normalizedScopes.push({ modulo_id: moduleId, tipo_ambito_id: type, referencia_id: referenceId, incluir_descendientes: 'NO' });
          return;
        }
        if (referenceEntity === 'ESTRUCTURA_ORG') {
          const structure = _accessFindBy_(structures, 'id', referenceId);
          if (!structure || !_accessCatalogIsActive_(structure)) throw new Error('La unidad orgánica seleccionada no existe o está inactiva.');
          const descendants = _accessFlag_(includeInput);
          if (descendants && !allowsDescendants) throw new Error('El tipo de ámbito ' + type + ' no permite incluir descendientes.');
          normalizedScopes.push({ modulo_id: moduleId, tipo_ambito_id: type, referencia_id: referenceId, incluir_descendientes: descendants ? 'SI' : 'NO' });
          return;
        }
        if (referenceEntity === 'LOCAL') {
          const local = _accessFindBy_(locals, 'id', referenceId);
          if (!local || !_accessCatalogIsActive_(local)) throw new Error('El local seleccionado no existe o está inactivo.');
          normalizedScopes.push({ modulo_id: moduleId, tipo_ambito_id: type, referencia_id: referenceId, incluir_descendientes: 'NO' });
          return;
        }
        throw new Error('El catálogo TiposAmbito contiene una entidad_referencia no admitida para ' + type + '.');
      });
    });

    // Preserva los ámbitos de módulos inactivos o no disponibles.
    previousScopes.forEach(scope => {
      const module = modulesById.get(scope.modulo_id);

      if (!module || !_accessIsActive_(module.active)) {
        normalizedScopes.push(Object.assign({}, scope));
      }
    });

    desiredScopes = normalizedScopes;

    const scopeSignature = records => records
      .map(item => [
        item.modulo_id,
        item.tipo_ambito_id,
        item.referencia_id,
        item.incluir_descendientes || 'NO'
      ].join('\u0000'))
      .sort()
      .join('\u0001');

    scopesChanged =
      scopeSignature(previousScopes) !== scopeSignature(desiredScopes);

    // Solo se vuelven a validar las referencias cuando los ámbitos realmente cambian.
    // Una edición de roles no debe quedar bloqueada por referencias antiguas sin cambios.
    if (scopesChanged) {
      const scopesToValidate = normalizedScopes.filter(scope => {
        const module = modulesById.get(scope.modulo_id);
        return module && _accessIsActive_(module.active);
      });

      const scopeTypesByModule = new Map();

      scopesToValidate.forEach(scope => {
        if (!scopeTypesByModule.has(scope.modulo_id)) {
          scopeTypesByModule.set(scope.modulo_id, new Set());
        }

        const types = scopeTypesByModule.get(scope.modulo_id);

        if (
          (scope.tipo_ambito_id === 'TOTAL' && types.size > 0) ||
          (scope.tipo_ambito_id !== 'TOTAL' && types.has('TOTAL'))
        ) {
          throw new Error('El ámbito Total es exclusivo dentro de cada módulo.');
        }

        types.add(scope.tipo_ambito_id);
      });

      const seenScopes = new Set();

      scopesToValidate.forEach(scope => {
        const key = [
          scope.modulo_id,
          scope.tipo_ambito_id,
          scope.referencia_id
        ].join('\u0000');

        if (seenScopes.has(key)) {
          throw new Error('Has agregado un ámbito duplicado.');
        }

        seenScopes.add(key);
      });

      // Los ámbitos específicos de una persona deben corresponder a una sola sede
      // en todos sus módulos.
      const siteIds = new Set();

      desiredScopes.forEach(scope => {
        const ownerModule = modulesById.get(scope.modulo_id);

        // Las asignaciones conservadas de módulos inactivos no participan
        // en la validación de los nuevos ámbitos.
        if (!ownerModule || !_accessIsActive_(ownerModule.active)) return;
        if (scope.tipo_ambito_id === 'TOTAL') return;

        const referenceId = _accessText_(scope.referencia_id);
        let siteId = '';

        if (scope.tipo_ambito_id === 'SEDE') {
          const site = _accessFindBy_(sites, 'id', referenceId);
          siteId = _accessCatalogIsActive_(site)
            ? _accessText_(site.id)
            : '';
        }

        if (scope.tipo_ambito_id === 'ESTRUCTURA_ORG') {
          const structure = _accessFindBy_(structures, 'id', referenceId);
          siteId = _accessCatalogIsActive_(structure)
            ? _accessText_(structure.sede_id)
            : '';
        }

        if (scope.tipo_ambito_id === 'LOCAL') {
          const local = _accessFindBy_(locals, 'id', referenceId);
          siteId = _accessCatalogIsActive_(local)
            ? _accessText_(local.sede_id)
            : '';
        }

        if (!siteId) {
          throw new Error(
            'Existe un ámbito específico con una referencia inválida. Corrige esa asignación antes de continuar.'
          );
        }

        siteIds.add(siteId);
      });

      if (siteIds.size > 1) {
        throw new Error(
          'Los ámbitos específicos de una persona deben pertenecer a una sola sede, aunque correspondan a módulos distintos.'
        );
      }
    }
  }

  const roleSignature = records => records
    .map(item => item.modulo_id + '\u0000' + item.rol_id)
    .sort()
    .join('\u0001');

  const rolesChanged =
    roleSignature(previousRoles) !== roleSignature(desiredRoles);

  if (!rolesChanged && !scopesChanged) {
    return {
      success: true,
      message: 'Los accesos ya se encuentran actualizados.'
    };
  }

  const after = _accessCopyData_(data);

  after.usuarioRol = after.usuarioRol.filter(row =>
    !(
      _accessText_(row.persona_id) === personaId &&
      _accessIsActive_(row.active)
    )
  );

  desiredRoles.forEach(item => {
    after.usuarioRol.push({
      persona_id: personaId,
      modulo_id: item.modulo_id,
      rol_id: item.rol_id,
      active: true
    });
  });

  if (canManageScopes) {
    after.ambitosAcceso = after.ambitosAcceso.filter(row =>
      !(
        _accessText_(row.persona_id) === personaId &&
        _accessIsActive_(row.active)
      )
    );

    desiredScopes.forEach(item => {
      after.ambitosAcceso.push(Object.assign({
        persona_id: personaId,
        active: true
      }, item));
    });
  }

  _accessAssertAdministratorContinuity_(data, after);

  const person = _accessFindPersonById_(personaId);
  const displayName = [
    person && person.nombres,
    person && person.apellidos
  ].map(_accessText_).filter(Boolean).join(' ');

  return _accessRunAudited_(auth, {
    accion: 'ACTUALIZAR_ACCESOS_USUARIO',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'USUARIO',
    registro_id: personaId,
    registro_nombre: displayName,
    detalle: 'Actualización conjunta de roles por módulo y ámbitos de acceso.',
    datos_antes: {
      roles: previousRoles,
      ambitos: previousScopes
    }
  }, () => {
    let roleResult = null;
    let scopeResult = null;

    try {
      roleResult = rolesChanged
        ? SUNARPCore.syncRecordsByKey(
            _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.userRoles),
            { persona_id: personaId },
            ['modulo_id'],
            desiredRoles,
            'active',
            true,
            false
          )
        : null;

      scopeResult = scopesChanged
        ? SUNARPCore.syncRecordsByKey(
            _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.scopes),
            { persona_id: personaId },
            ['modulo_id', 'tipo_ambito_id', 'referencia_id'],
            desiredScopes,
            'active',
            true,
            false,
            { allowEmptyKeyFields: ['referencia_id'] }
          )
        : null;

    } catch (error) {
      if (roleResult) {
        throw new Error(
          'Los roles se actualizaron, pero no se pudieron completar los ámbitos de acceso. Revisa la configuración antes de volver a guardar. Detalle: ' +
          (error.message || 'Error no identificado.')
        );
      }

      throw error;
    }

    return {
      value: {
        success: true,
        message: 'Los accesos por módulo se actualizaron correctamente.',
        roles: roleResult,
        ambitos: scopeResult
      },
      auditAfter: {
        roles: desiredRoles,
        ambitos: canManageScopes ? desiredScopes : previousScopes
      }
    };
  });
}


function _accessLoadSecurityRecords_(sheetName, requiredHeaders) {
  const result = SUNARPCore.listRecordsFromSourcesCached([{
    key: 'records',
    source: _accessSecuritySource_(sheetName),
    requiredHeaders: requiredHeaders || []
  }], 300);
  return result.records || [];
}


/**
 * Bootstrap liviano del panel: catálogos de selección y capacidades.
 * Las relaciones globales se consultan al abrir la pestaña correspondiente
 * o al editar la configuración de una persona concreta.
 */
function getAccessManagementData() {
  const auth = _accessGetAuthContext_();
  const accessModuleId = _accessResolveModuleId_(
    auth,
    ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses
  );
  const globalAdministrator = _accessIsGlobalAdministrator_(auth);

  const capabilities = {
    users: globalAdministrator && _accessHasPermission_(auth, 'USUARIOS_ADMINISTRAR', accessModuleId),
    roles: globalAdministrator && _accessHasPermission_(auth, 'ROLES_ADMINISTRAR', accessModuleId),
    permissions: globalAdministrator && _accessHasPermission_(auth, 'PERMISOS_ADMINISTRAR', accessModuleId),
    scopes: globalAdministrator && _accessHasPermission_(auth, 'AMBITOS_ACCESO_ADMINISTRAR', accessModuleId),
    audit: _accessHasPermission_(auth, 'AUDITORIA_VER', accessModuleId)
  };
  capabilities.assignments = capabilities.roles && capabilities.permissions;
  capabilities.userRoles = capabilities.users && capabilities.roles;

  if (!Object.values(capabilities).some(Boolean)) {
    throw new Error('Tu cuenta no tiene capacidades de administración de accesos ni permiso de auditoría.');
  }

  const needsModules = capabilities.permissions || capabilities.scopes || capabilities.userRoles;
  const needsRoles = capabilities.roles || capabilities.users;
  const modules = needsModules
    ? _accessLoadSecurityRecords_(ACCESS_MANAGEMENT_CONFIG.sheets.modules, ACCESS_MANAGEMENT_FIELDS.modules)
    : [];
  const roles = needsRoles
    ? _accessLoadSecurityRecords_(ACCESS_MANAGEMENT_CONFIG.sheets.roles, ACCESS_MANAGEMENT_FIELDS.roles)
    : [];
  const scopeTypes = capabilities.scopes
    ? _accessLoadSecurityRecords_(ACCESS_MANAGEMENT_CONFIG.sheets.scopeTypes, ACCESS_MANAGEMENT_FIELDS.scopeTypes)
    : [];

  const siteCatalogData = capabilities.users
    ? SUNARPCore.listRecordsFromSourcesCached([{
        key: 'sedes',
        source: _accessSecuritySource_('Sedes'),
        requiredHeaders: ['id', 'name']
      }], 30)
    : { sedes: [] };

  return {
    currentUser: {
      persona_id: auth.personaId,
      email: auth.email,
      name: auth.name,
      roles: auth.moduleAccess.map(item => ({
        modulo_id: item.modulo_id,
        modulo: item.module.nombre,
        rol_id: item.rol_id,
        rol: item.role.nombre
      }))
    },
    capabilities,
    documentTypes: capabilities.users
      ? _accessLoadDocumentTypes_()
          .filter(_accessCatalogIsActive_)
          .map(item => ({ id: _accessText_(item.id), name: _accessText_(item.name) }))
          .filter(item => item.id && item.name)
      : [],
    users: [],
    modules: modules.map(module => ({
      modulo_id: _accessText_(module.modulo_id),
      codigo: _accessUpper_(module.codigo),
      nombre: _accessText_(module.nombre),
      descripcion: _accessText_(module.descripcion),
      active: _accessIsActive_(module.active)
    })),
    roles: roles.map(role => ({
      rol_id: _accessText_(role.rol_id),
      nombre: _accessText_(role.nombre),
      descripcion: _accessText_(role.descripcion),
      active: _accessIsActive_(role.active)
    })),
    // Se cargan al entrar a sus pestañas; no forman parte del bootstrap.
    permissions: [],
    rolePermissions: [],
    operations: [],
    scopeTypes: scopeTypes.filter(_accessCatalogIsActive_).map(item => ({
      tipo_ambito_id: _accessUpper_(item.tipo_ambito_id),
      nombre: _accessText_(item.nombre),
      descripcion: _accessText_(item.descripcion),
      entidad_referencia: _accessUpper_(item.entidad_referencia),
      requiere_referencia: _accessFlag_(item.requiere_referencia),
      permite_descendientes: _accessFlag_(item.permite_descendientes),
      active: _accessCatalogIsActive_(item)
    })),
    userRoles: [],
    scopes: [],
    catalogs: {
      sedes: (siteCatalogData.sedes || []).filter(_accessCatalogIsActive_).map(row => ({
        id: _accessText_(row.id), name: _accessText_(row.name)
      })),
      estructuraOrg: [],
      locales: [],
      tiposEstructura: [],
      estructuraLocal: []
    },
    scopeCatalogsLoaded: false
  };
}


/** Devuelve únicamente los datos necesarios para actualizar una pestaña. */
function getAccessManagementTabData(tabId) {
  const tab = _accessText_(tabId).toLowerCase();
  const s = ACCESS_MANAGEMENT_CONFIG.sheets;

  if (tab === 'roles') {
    const auth = _accessRequirePermission_('ROLES_ADMINISTRAR');
    const roles = _accessLoadSecurityRecords_(s.roles, ACCESS_MANAGEMENT_FIELDS.roles);
    return { roles: roles.map(item => ({
      rol_id: _accessText_(item.rol_id), nombre: _accessText_(item.nombre),
      descripcion: _accessText_(item.descripcion), active: _accessIsActive_(item.active)
    })) };
  }

  if (tab === 'permissions') {
    const auth = _accessRequirePermission_('PERMISOS_ADMINISTRAR');
    const modules = _accessLoadSecurityRecords_(s.modules, ACCESS_MANAGEMENT_FIELDS.modules);
    const operations = _accessLoadSecurityRecords_(s.operations, ACCESS_MANAGEMENT_FIELDS.operations);
    const permissions = _accessLoadSecurityRecords_(s.permissions, ACCESS_MANAGEMENT_FIELDS.permissions);
    return {
      modules: modules.map(item => ({
        modulo_id: _accessText_(item.modulo_id), codigo: _accessUpper_(item.codigo),
        nombre: _accessText_(item.nombre), active: _accessIsActive_(item.active)
      })),
      operations: _accessGetOperationCatalog_(operations),
      permissions: permissions.map(item => {
        const module = modules.find(candidate => _accessText_(candidate.modulo_id) === _accessText_(item.modulo_id)) || {};
        return {
          permiso_id: _accessText_(item.permiso_id), codigo: _accessUpper_(item.codigo),
          modulo_id: _accessText_(item.modulo_id), modulo_codigo: _accessUpper_(module.codigo),
          modulo_nombre: _accessText_(module.nombre), operacion_id: _accessUpper_(item.operacion_id),
          operacion_nombre: _accessText_((operations.find(op => _accessUpper_(op.operacion_id) === _accessUpper_(item.operacion_id)) || {}).nombre),
          descripcion: _accessText_(item.descripcion), active: _accessIsActive_(item.active)
        };
      })
    };
  }

  if (tab === 'assignments') {
    const auth = _accessRequirePermission_('ROLES_ADMINISTRAR');
    const roles = _accessLoadSecurityRecords_(s.roles, ACCESS_MANAGEMENT_FIELDS.roles);
    const modules = _accessLoadSecurityRecords_(s.modules, ACCESS_MANAGEMENT_FIELDS.modules);
    const operations = _accessLoadSecurityRecords_(s.operations, ACCESS_MANAGEMENT_FIELDS.operations);
    const permissions = _accessLoadSecurityRecords_(s.permissions, ACCESS_MANAGEMENT_FIELDS.permissions);
    const rolePermissions = _accessLoadSecurityRecords_(s.rolePermissions, ACCESS_MANAGEMENT_FIELDS.rolePermissions);
    return {
      roles: roles.map(item => ({
        rol_id: _accessText_(item.rol_id), nombre: _accessText_(item.nombre),
        descripcion: _accessText_(item.descripcion), active: _accessIsActive_(item.active)
      })),
      modules: modules.map(item => ({
        modulo_id: _accessText_(item.modulo_id), codigo: _accessUpper_(item.codigo),
        nombre: _accessText_(item.nombre), active: _accessIsActive_(item.active)
      })),
      permissions: permissions.map(item => ({
        permiso_id: _accessText_(item.permiso_id), codigo: _accessUpper_(item.codigo),
        modulo_id: _accessText_(item.modulo_id), operacion_id: _accessUpper_(item.operacion_id),
        operacion_nombre: _accessText_((operations.find(op => _accessUpper_(op.operacion_id) === _accessUpper_(item.operacion_id)) || {}).nombre),
        descripcion: _accessText_(item.descripcion), active: _accessIsActive_(item.active)
      })),
      rolePermissions: rolePermissions.map(item => ({
        rol_id: _accessText_(item.rol_id), permiso_id: _accessText_(item.permiso_id),
        active: _accessIsActive_(item.active)
      }))
    };
  }

  if (tab === 'operations') {
    const auth = _accessRequirePermission_('PERMISOS_ADMINISTRAR');
    return { operations: _accessGetOperationCatalog_(
      _accessLoadSecurityRecords_(s.operations, ACCESS_MANAGEMENT_FIELDS.operations)
    ) };
  }

  if (tab === 'scopetypes') {
    const auth = _accessRequirePermission_('AMBITOS_ACCESO_ADMINISTRAR');
    return {
      scopeTypes: _accessLoadSecurityRecords_(s.scopeTypes, ACCESS_MANAGEMENT_FIELDS.scopeTypes)
        .filter(_accessCatalogIsActive_).map(item => ({
          tipo_ambito_id: _accessUpper_(item.tipo_ambito_id),
          nombre: _accessText_(item.nombre),
          descripcion: _accessText_(item.descripcion),
          entidad_referencia: _accessUpper_(item.entidad_referencia),
          requiere_referencia: _accessFlag_(item.requiere_referencia),
          permite_descendientes: _accessFlag_(item.permite_descendientes),
          active: _accessCatalogIsActive_(item)
        }))
    };
  }
  throw new Error('La pestaña solicitada no admite actualización independiente.');
}


/**
 * Recupera los catálogos organizacionales únicamente al abrir el editor de
 * ámbitos. Conserva separadas las fuentes de Seguridad y Directorio.
 */
function getAccessScopeCatalogs() {
  _accessRequirePermission_('AMBITOS_ACCESO_ADMINISTRAR');
  const catalogs = _accessOrgManagementCatalog_();
  return {
    sedes: (catalogs.sedes || []).filter(_accessCatalogIsActive_).map(row => ({
      id: _accessText_(row.id), name: _accessText_(row.name)
    })),
    estructuraOrg: (catalogs.estructuraOrg || []).filter(_accessCatalogIsActive_).map(row => ({
      id: _accessText_(row.id), sede_id: _accessText_(row.sede_id),
      parent_id: _accessText_(row.parent_id), tipo_estructura_id: _accessText_(row.tipo_estructura_id),
      name: _accessText_(row.name), order: row.order
    })),
    locales: (catalogs.locales || []).filter(_accessCatalogIsActive_).map(row => ({
      id: _accessText_(row.id), name: _accessText_(row.name), sede_id: _accessText_(row.sede_id)
    })),
    tiposEstructura: (catalogs.tiposEstructura || []).filter(_accessCatalogIsActive_).map(row => ({
      id: _accessText_(row.id), name: _accessText_(row.name)
    })),
    estructuraLocal: (catalogs.estructuraLocal || []).filter(_accessCatalogIsActive_).map(row => ({
      id: _accessText_(row.id), estructura_id: _accessText_(row.estructura_id),
      local_id: _accessText_(row.local_id), referencia: _accessText_(row.referencia)
    }))
  };
}


/**
 * Devuelve los roles y ámbitos de una sola persona para abrir su editor.
 * No carga las relaciones de las demás cuentas.
 */
function getAccessUserConfiguration(personaId) {
  const auth = _accessRequirePermission_('USUARIOS_ADMINISTRAR');
  const accessModuleId = _accessResolveModuleId_(auth, ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses);
  if (!_accessHasPermission_(auth, 'ROLES_ADMINISTRAR', accessModuleId)) {
    throw new Error('No tienes autorización para administrar roles por módulo.');
  }
  const id = _accessText_(personaId);
  if (!id) throw new Error('Debes indicar persona_id.');

  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const users = _accessFindSecurityRecords_(
    s.users, 'persona_id', [id], ACCESS_MANAGEMENT_FIELDS.users,
    { projectionFields: ['persona_id'] }
  );
  if (!users.length) {
    throw new Error('La persona no tiene una cuenta registrada.');
  }
  const userRoles = _accessFindSecurityRecords_(
    s.userRoles, 'persona_id', [id], ACCESS_MANAGEMENT_FIELDS.userRoles,
    { projectionFields: ['persona_id', 'modulo_id', 'rol_id', 'active'] }
  );
  const scopes = _accessFindSecurityRecords_(
    s.scopes, 'persona_id', [id], ACCESS_MANAGEMENT_FIELDS.scopes,
    {
      projectionFields: [
        'persona_id', 'modulo_id', 'tipo_ambito_id',
        'referencia_id', 'incluir_descendientes', 'active'
      ]
    }
  );
  const activeScopesByModule = new Set(scopes.filter(item => _accessIsActive_(item.active))
    .map(item => _accessText_(item.modulo_id)));
  return {
    userRoles: userRoles.map(item => ({
      persona_id: _accessText_(item.persona_id),
      modulo_id: _accessText_(item.modulo_id),
      rol_id: _accessText_(item.rol_id),
      active: _accessIsActive_(item.active),
      has_scopes: activeScopesByModule.has(_accessText_(item.modulo_id))
    })),
    scopes: scopes.map(item => ({
      persona_id: _accessText_(item.persona_id),
      modulo_id: _accessText_(item.modulo_id),
      tipo_ambito_id: _accessUpper_(item.tipo_ambito_id),
      referencia_id: _accessText_(item.referencia_id),
      incluir_descendientes: _accessText_(item.incluir_descendientes),
      active: _accessIsActive_(item.active)
    }))
  };
}


/** Lista usuarios bajo demanda después de seleccionar sede o rol. */
/**
 * Construye una vista derivada del listado de usuarios. Se materializa una
 * vez por combinación de filtros estructurales y generación de las fuentes.
 * Las búsquedas y páginas posteriores reutilizan el índice ya enriquecido.
 */
function _accessBuildUserListingIndex_(sedeId, roleId) {
  if (typeof SUNARPCore.getOrBuildCachedValue !== 'function') {
    throw new Error(
      'El listado de usuarios requiere la versión de SUNARP Core que incorpora getOrBuildCachedValue.'
    );
  }

  const sources = [
    _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.users),
    _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.userRoles),
    _accessDirectorySource_(ACCESS_MANAGEMENT_CONFIG.sheets.people)
  ];
  const locationRequests = [];
  if (sedeId) {
    const assignmentSource = _directorySource_('asignaciones');
    const relationSource = _directorySource_('estructura_local');
    const structureSource = _directorySource_('estructura_org');
    const localSource = _directorySource_('locales');
    const siteSource = _directorySource_('sede');
    sources.push(assignmentSource, relationSource, structureSource, localSource, siteSource);
    locationRequests.push(
      { key: 'relations', source: relationSource, requiredHeaders: ['id', 'estructura_id', 'local_id'] },
      { key: 'structures', source: structureSource, requiredHeaders: ['id', 'sede_id'] },
      { key: 'locals', source: localSource, requiredHeaders: ['id', 'sede_id'] },
      { key: 'sites', source: siteSource, requiredHeaders: ['id', 'name'] }
    );
  }

  const cacheKey = ['access-users-index-v1', sedeId || '*', roleId || '*'].join(':');
  const cached = SUNARPCore.getOrBuildCachedValue(cacheKey, sources, () => {
    const candidateSets = [];
    if (roleId) {
      const roleAssignments = _accessFindSecurityRecords_(
        ACCESS_MANAGEMENT_CONFIG.sheets.userRoles,
        'rol_id',
        [roleId],
        ACCESS_MANAGEMENT_FIELDS.userRoles,
        { projectionFields: ['persona_id', 'active'] }
      ).filter(item => _accessIsActive_(item.active));
      candidateSets.push(new Set(
        roleAssignments.map(item => _accessText_(item.persona_id)).filter(Boolean)
      ));
    }

    const sitesByPerson = new Map();
    const siteNames = new Map();
    if (sedeId) {
      const locationData = SUNARPCore.listRecordsFromSourcesCached(locationRequests, 300);
      const relations = new Map((locationData.relations || []).map(item => [
        _accessText_(item.id), item
      ]));
      const structures = new Map((locationData.structures || []).map(item => [
        _accessText_(item.id), item
      ]));
      const locals = new Map((locationData.locals || []).map(item => [
        _accessText_(item.id), item
      ]));
      (locationData.sites || []).forEach(item =>
        siteNames.set(_accessText_(item.id), _accessText_(item.name))
      );

      const relationIds = (locationData.relations || []).filter(relation => {
        const structure = structures.get(_accessText_(relation.estructura_id));
        return structure && _accessText_(structure.sede_id) === sedeId;
      }).map(item => _accessText_(item.id)).filter(Boolean);
      const localIds = (locationData.locals || []).filter(local =>
        _accessText_(local.sede_id) === sedeId
      ).map(item => _accessText_(item.id)).filter(Boolean);

      const assignmentHeaders = [
        'asignacion_id', 'persona_id', 'estructura_local_id', 'local_id', 'active'
      ];
      const collectAssignments = records => {
        (records || []).forEach(assignment => {
          if (!_accessIsActive_(assignment.active)) return;
          const personaId = _accessText_(assignment.persona_id);
          const relationId = _accessText_(assignment.estructura_local_id);
          const localId = _accessText_(assignment.local_id);
          let assignedSiteId = '';

          if (relationId) {
            const relation = relations.get(relationId);
            const structure = relation && structures.get(_accessText_(relation.estructura_id));
            if (!relation || !structure ||
                (localId && localId !== _accessText_(relation.local_id))) return;
            assignedSiteId = _accessText_(structure.sede_id);
          } else if (localId) {
            const local = locals.get(localId);
            assignedSiteId = local ? _accessText_(local.sede_id) : '';
          }

          if (!personaId || assignedSiteId !== sedeId) return;
          if (!sitesByPerson.has(personaId)) sitesByPerson.set(personaId, new Set());
          sitesByPerson.get(personaId).add(assignedSiteId);
        });
      };

      if (relationIds.length) {
        const result = SUNARPCore.findRecordsByFields(
          _directorySource_('asignaciones'),
          { estructura_local_id: relationIds },
          {
            searchField: 'estructura_local_id',
            requiredHeaders: assignmentHeaders,
            projectionFields: assignmentHeaders
          }
        );
        collectAssignments(result.records);
      }
      if (localIds.length) {
        const result = SUNARPCore.findRecordsByFields(
          _directorySource_('asignaciones'),
          { local_id: localIds, estructura_local_id: '' },
          {
            searchField: 'local_id',
            requiredHeaders: assignmentHeaders,
            projectionFields: assignmentHeaders
          }
        );
        collectAssignments(result.records);
      }
      candidateSets.push(new Set(sitesByPerson.keys()));
    }

    let candidateIds = candidateSets.length ? new Set(candidateSets[0]) : new Set();
    candidateSets.slice(1).forEach(set => {
      candidateIds = new Set(Array.from(candidateIds).filter(id => set.has(id)));
    });
    const personaIds = Array.from(candidateIds).filter(Boolean);
    if (!personaIds.length) return [];

    const accounts = _accessFindSecurityRecords_(
      ACCESS_MANAGEMENT_CONFIG.sheets.users,
      'persona_id',
      personaIds,
      ACCESS_MANAGEMENT_FIELDS.users,
      { projectionFields: ['persona_id', 'active'] }
    );
    const accountPersonaIds = [...new Set(
      accounts.map(item => _accessText_(item.persona_id)).filter(Boolean)
    )];
    if (!accountPersonaIds.length) return [];

    const peopleResult = SUNARPCore.findRecordsByFields(
      _accessDirectorySource_(ACCESS_MANAGEMENT_CONFIG.sheets.people),
      { persona_id: accountPersonaIds },
      {
        searchField: 'persona_id',
        requiredHeaders: ACCESS_MANAGEMENT_FIELDS.people,
        projectionFields: ['persona_id', 'correo_institucional', 'nombres', 'apellidos']
      }
    );
    const people = new Map((peopleResult.records || []).map(person => [
      _accessText_(person.persona_id), person
    ]));

    const userRoles = _accessFindSecurityRecords_(
      ACCESS_MANAGEMENT_CONFIG.sheets.userRoles,
      'persona_id',
      accountPersonaIds,
      ACCESS_MANAGEMENT_FIELDS.userRoles,
      { projectionFields: ['persona_id', 'modulo_id', 'rol_id', 'active'] }
    );
    const rolesByPerson = new Map();
    userRoles.filter(item => _accessIsActive_(item.active)).forEach(item => {
      const id = _accessText_(item.persona_id);
      if (!rolesByPerson.has(id)) rolesByPerson.set(id, []);
      rolesByPerson.get(id).push({
        modulo_id: _accessText_(item.modulo_id),
        rol_id: _accessUpper_(item.rol_id)
      });
    });

    const rows = accounts.map(user => {
      const personaId = _accessText_(user.persona_id);
      const person = people.get(personaId) || {};
      const sedeIds = Array.from(sitesByPerson.get(personaId) || []);
      return {
        persona_id: personaId,
        correo_institucional: _accessText_(person.correo_institucional),
        nombres: _accessText_(person.nombres),
        apellidos: _accessText_(person.apellidos),
        nombre_completo: [_accessText_(person.nombres), _accessText_(person.apellidos)]
          .filter(Boolean).join(' '),
        sede_ids: sedeIds,
        sede_nombre: sedeIds.map(id => siteNames.get(id) || id).join(' · '),
        active: _accessIsActive_(user.active),
        roles: rolesByPerson.get(personaId) || []
      };
    });
    rows.sort((left, right) =>
      left.nombre_completo.localeCompare(right.nombre_completo, 'es') ||
      left.persona_id.localeCompare(right.persona_id, 'es')
    );
    return rows;
  }, 300);

  if (!cached || !Array.isArray(cached.value)) {
    throw new Error('SUNARP Core no devolvió un índice válido para el listado de usuarios.');
  }
  return cached;
}


function getAccessUsers(filters) {
  _accessRequirePermission_('USUARIOS_ADMINISTRAR');
  filters = filters && typeof filters === 'object' ? filters : {};
  const sedeId = _accessText_(filters.sede_id);
  const roleId = _accessUpper_(filters.rol_id);
  const query = _accessText_(filters.search).toLocaleLowerCase();
  if (!sedeId && !roleId) return { items: [], total: 0 };

  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(filters.pageSize, 10) || 10));
  const offset = (page - 1) * pageSize;
  const indexed = _accessBuildUserListingIndex_(sedeId, roleId);
  let items;
  let total;

  if (!query) {
    // Sin búsqueda, el índice ya está ordenado: obtener la página no requiere
    // recorrer todos los candidatos ni volver a ordenarlos.
    total = indexed.value.length;
    items = indexed.value.slice(offset, offset + pageSize);
  } else {
    items = [];
    total = 0;
    indexed.value.forEach(row => {
      if (![
        row.persona_id, row.nombre_completo, row.correo_institucional, row.sede_nombre
      ].join(' ').toLocaleLowerCase().includes(query)) return;
      if (total >= offset && items.length < pageSize) items.push(row);
      total++;
    });
  }

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}


function _accessAuditTimestamp_(record) {
  const value = record && record.fecha_hora;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
}

function _accessCompareAuditEvents_(left, right) {
  const leftTime = _accessAuditTimestamp_(left);
  const rightTime = _accessAuditTimestamp_(right);
  const leftInvalid = Number.isNaN(leftTime);
  const rightInvalid = Number.isNaN(rightTime);

  if (leftInvalid !== rightInvalid) return leftInvalid ? 1 : -1;
  if (!leftInvalid && leftTime !== rightTime) return rightTime - leftTime;

  return _accessText_(right.evento_id).localeCompare(
    _accessText_(left.evento_id), 'es'
  );
}

function _accessInsertAuditPageRecord_(records, record, maxRecords) {
  if (maxRecords < 1) return;
  const compare = _accessCompareAuditEvents_;

  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compare(record, records[middle]) < 0) high = middle;
    else low = middle + 1;
  }
  if (low >= maxRecords && records.length >= maxRecords) return;
  records.splice(low, 0, record);
  if (records.length > maxRecords) records.pop();
}

function _accessAuditDateBound_(value, endOfDay) {
  const text = _accessText_(value);
  if (!text) return null;

  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!parts) {
    throw new Error('El filtro de fecha de auditoría no es válido: ' + text + '.');
  }

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const date = new Date(text + (endOfDay ? 'T23:59:59.999' : 'T00:00:00'));
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    throw new Error('El filtro de fecha de auditoría no es válido: ' + text + '.');
  }
  return date;
}

function getAccessAuditHistory(filters) {
  _accessRequirePermission_('AUDITORIA_VER');
  filters = filters && typeof filters === 'object' ? filters : {};

  const source = _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.audit);
  const actor = _accessText_(filters.actor || filters.actorEmail).toLowerCase();
  const moduleCode = _accessUpper_(filters.modulo || filters.module);
  const action = _accessUpper_(filters.accion || filters.action);
  const outcome = _accessUpper_(filters.resultado || filters.result);
  const recordId = _accessText_(filters.registro_id || filters.recordId).toLowerCase();
  const query = _accessText_(filters.search || filters.query).toLocaleLowerCase();
  const from = _accessText_(filters.desde || filters.from);
  const to = _accessText_(filters.hasta || filters.to);

  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(filters.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;
  const maxRetained = offset + pageSize;
  const hasNonDateFilters = Boolean(actor || moduleCode || action || outcome || recordId || query);
  const fromDate = _accessAuditDateBound_(from, false);
  const toDate = _accessAuditDateBound_(to, true);
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error('La fecha desde no puede ser posterior a la fecha hasta.');
  }

  let total = 0;
  let records = [];
  const requiredHeaders = ACCESS_MANAGEMENT_FIELDS.audit;
  const hasIndexedTail = typeof SUNARPCore.listTailRecords === 'function';

  // Sin filtros de texto, la consulta indexada resuelve tanto el historial
  // reciente como los rangos temporales sin descargar el contenido de toda la hoja.
  if (!hasNonDateFilters && hasIndexedTail) {
    const recent = SUNARPCore.listTailRecords(source, {
      idField: 'evento_id',
      dateField: 'fecha_hora',
      sortBy: 'fecha_hora',
      fromDate,
      toDate,
      offset,
      limit: pageSize,
      requiredHeaders
    });
    records = recent.records || [];
    total = recent.total;
  } else if (!hasNonDateFilters) {
    // Compatibilidad explícita con Core v9 mientras Gestor no consuma v10.
    // Esta rama seguirá siendo integral hasta que la biblioteca actualice el contrato.
    const cached = SUNARPCore.listRecordsFromSourcesCached([{
      key: 'audit',
      source,
      requiredHeaders
    }], 60);
    const all = (cached.audit || []).filter(row => {
      const timestamp = _accessAuditTimestamp_(row);
      if (Number.isNaN(timestamp)) return false;
      if (fromDate && timestamp < fromDate.getTime()) return false;
      if (toDate && timestamp > toDate.getTime()) return false;
      return true;
    }).sort((a, b) => _accessAuditTimestamp_(b) - _accessAuditTimestamp_(a));
    total = all.length;
    records = all.slice(offset, offset + pageSize);
  } else {
    let candidates = null;
    if (actor) {
      candidates = SUNARPCore.searchRecordsByFields(
        source, actor, ['actor_correo'], { matchCase: false }
      );
    } else if (recordId) {
      candidates = SUNARPCore.searchRecordsByFields(
        source, recordId, ['registro_id'], { matchCase: false }
      );
    } else if (moduleCode) {
      candidates = SUNARPCore.findRecordsByFields(
        source, { modulo: moduleCode },
        { searchField: 'modulo', matchCase: false, requiredHeaders }
      );
    } else if (action) {
      candidates = SUNARPCore.findRecordsByFields(
        source, { accion: action },
        { searchField: 'accion', matchCase: false, requiredHeaders }
      );
    } else if (outcome) {
      candidates = SUNARPCore.findRecordsByFields(
        source, { resultado: outcome },
        { searchField: 'resultado', matchCase: false, requiredHeaders }
      );
    } else {
      candidates = SUNARPCore.searchRecordsByFields(
        source,
        query,
        [
          'actor_correo', 'actor_nombre', 'accion', 'modulo',
          'tipo_entidad', 'registro_id', 'registro_nombre',
          'resultado', 'detalle'
        ],
        { matchCase: false }
      );
    }

    const candidateRows = candidates && Array.isArray(candidates.records)
      ? candidates.records
      : [];
    candidateRows.forEach(row => {
      if (actor && !_accessText_(row.actor_correo).toLowerCase().includes(actor)) return;
      if (moduleCode && _accessUpper_(row.modulo) !== moduleCode) return;
      if (action && _accessUpper_(row.accion) !== action) return;
      if (outcome && _accessUpper_(row.resultado) !== outcome) return;
      if (recordId && !_accessText_(row.registro_id).toLowerCase().includes(recordId)) return;

      const timestamp = _accessAuditTimestamp_(row);
      if (fromDate && (Number.isNaN(timestamp) || timestamp < fromDate.getTime())) return;
      if (toDate && (Number.isNaN(timestamp) || timestamp > toDate.getTime())) return;

      if (query) {
        const haystack = [
          row.actor_correo, row.actor_nombre, row.accion, row.modulo,
          row.tipo_entidad, row.registro_id, row.registro_nombre,
          row.resultado, row.detalle
        ].map(_accessText_).join(' ').toLocaleLowerCase();
        if (!haystack.includes(query)) return;
      }

      total++;
      _accessInsertAuditPageRecord_(records, row, maxRetained);
    });
    records = records.slice(offset, offset + pageSize);
  }

  return {
    items: records.map(row => ({
      evento_id: _accessText_(row.evento_id),
      fecha_hora: (() => {
        const date = row.fecha_hora instanceof Date
          ? row.fecha_hora
          : new Date(row.fecha_hora);
        return Number.isNaN(date.getTime())
          ? _accessText_(row.fecha_hora)
          : date.toISOString();
      })(),
      actor_correo: _accessText_(row.actor_correo),
      actor_nombre: _accessText_(row.actor_nombre),
      accion: _accessUpper_(row.accion),
      modulo: _accessUpper_(row.modulo),
      tipo_entidad: _accessUpper_(row.tipo_entidad),
      registro_id: _accessText_(row.registro_id),
      registro_nombre: _accessText_(row.registro_nombre),
      resultado: _accessUpper_(row.resultado),
      detalle: _accessText_(row.detalle),
      datos_antes: _accessText_(row.datos_antes),
      datos_despues: _accessText_(row.datos_despues),
      ambito_modulo: _accessText_(row.ambito_modulo),
      ambito_tipo: _accessText_(row.ambito_tipo),
      ambito_referencia_id: _accessText_(row.ambito_referencia_id)
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

/**
 * Convierte el contenido JSON guardado en los snapshots de auditoría.
 * Se mantiene independiente de la consulta paginada del historial.
 */
function _accessParseAuditData_(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    return null;
  }
}


/**
 * Comprueba si un evento de asignación de permisos
 * contiene el permiso solicitado, antes o después del cambio.
 */
function _accessAuditContainsPermission_(event, permissionId) {
  const before = _accessParseAuditData_(event.datos_antes);
  const after = _accessParseAuditData_(event.datos_despues);

  function contains(value) {
    if (!Array.isArray(value)) return false;

    return value.some(item => {
      if (typeof item === 'string') {
        return _accessText_(item) === permissionId;
      }

      if (item && typeof item === 'object') {
        return _accessText_(item.permiso_id) === permissionId;
      }

      return false;
    });
  }

  return contains(before) || contains(after);
}


/**
 * Consulta el historial de un registro específico.
 *
 * Tipos contemplados:
 * USUARIO
 * ROL
 * PERMISO
 * SERVIDOR
 *
 * Requiere AUDITORIA_VER.
 */
/**
 * Construye el índice de eventos de una entidad concreta. Solo consulta
 * coincidencias por registro_id y, para permisos, candidatos en snapshots.
 * La caché por generación permite que la paginación posterior no repita
 * búsquedas ni vuelva a descargar esos eventos.
 */
function _accessBuildEntityHistoryIndex_(source, entityType, recordId, relatedTypes) {
  const events = [];
  const seenEventIds = new Set();

  const consumeEvents = candidates => {
    (candidates || []).forEach(event => {
      const eventId = _accessText_(event.evento_id);
      if (eventId && seenEventIds.has(eventId)) return;
      if (eventId) seenEventIds.add(eventId);

      const eventType = _accessUpper_(event.tipo_entidad);
      const eventRecordId = _accessText_(event.registro_id);
      const eventModule = _accessUpper_(event.modulo);

      if (
        entityType === 'SERVIDOR' &&
        !['DIRECTORIOS', 'INFORMACION_PERSONAL'].includes(eventModule)
      ) return;

      let matches = relatedTypes[entityType].includes(eventType) &&
        eventRecordId === recordId;

      if (!matches && entityType === 'PERMISO' && eventType === 'ROL_PERMISO') {
        matches = _accessAuditContainsPermission_(event, recordId);
      }
      if (matches) events.push(event);
    });
  };

  const directMatches = SUNARPCore.findRecordsByFields(
    source,
    { registro_id: recordId },
    {
      searchField: 'registro_id',
      requiredHeaders: ACCESS_MANAGEMENT_FIELDS.audit
    }
  );
  consumeEvents(directMatches.records);

  if (entityType === 'PERMISO') {
    const relatedMatches = SUNARPCore.searchRecordsByFields(
      source,
      recordId,
      ['datos_antes', 'datos_despues'],
      { matchCase: false }
    );
    consumeEvents(relatedMatches.records);
  }

  events.sort(_accessCompareAuditEvents_);

  return events;
}


/**
 * Consulta el historial de un registro específico.
 *
 * Tipos contemplados: USUARIO, ROL, PERMISO y SERVIDOR.
 * Requiere AUDITORIA_VER.
 */
function getAccessEntityHistory(payload) {
  _accessRequirePermission_('AUDITORIA_VER');

  payload = payload || {};
  const entityType = _accessUpper_(
    payload.tipo_entidad || payload.entityType
  );
  const recordId = _accessText_(
    payload.registro_id || payload.recordId
  );
  if (!entityType || !recordId) {
    throw new Error('Debes indicar el tipo y el identificador del registro.');
  }

  const relatedTypes = {
    USUARIO: ['USUARIO', 'USUARIO_ROL', 'AMBITO_ACCESO'],
    ROL: ['ROL', 'ROL_PERMISO'],
    PERMISO: ['PERMISO', 'ROL_PERMISO'],
    SERVIDOR: ['SERVIDOR']
  };
  if (!relatedTypes[entityType]) {
    throw new Error('No está habilitada la consulta de historial para ' + entityType + '.');
  }

  const source = _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.audit);
  const page = Math.max(1, Number.parseInt(payload.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(payload.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;
  const buildIndex = () => _accessBuildEntityHistoryIndex_(
    source, entityType, recordId, relatedTypes
  );

  const cacheKey = 'access-entity-history-v1:' + entityType + ':' + recordId;
  let events;
  if (
    cacheKey.length <= 180 &&
    typeof SUNARPCore.getOrBuildCachedValue === 'function'
  ) {
    const cached = SUNARPCore.getOrBuildCachedValue(
      cacheKey,
      [source],
      buildIndex,
      300
    );
    events = cached && Array.isArray(cached.value)
      ? cached.value
      : buildIndex();
  } else {
    events = buildIndex();
  }

  const total = events.length;
  const records = events.slice(offset, offset + pageSize);
  return {
    items: records.map(event => {
      const date = event.fecha_hora instanceof Date
        ? event.fecha_hora
        : new Date(event.fecha_hora);
      return {
        evento_id: _accessText_(event.evento_id),
        fecha_hora: Number.isNaN(date.getTime())
          ? _accessText_(event.fecha_hora)
          : date.toISOString(),
        actor_correo: _accessText_(event.actor_correo),
        actor_nombre: _accessText_(event.actor_nombre),
        accion: _accessUpper_(event.accion),
        modulo: _accessUpper_(event.modulo),
        tipo_entidad: _accessUpper_(event.tipo_entidad),
        registro_id: _accessText_(event.registro_id),
        registro_nombre: _accessText_(event.registro_nombre),
        resultado: _accessUpper_(event.resultado),
        detalle: _accessText_(event.detalle),
        datos_antes: _accessText_(event.datos_antes),
        datos_despues: _accessText_(event.datos_despues),
        ambito_modulo: _accessText_(event.ambito_modulo),
        ambito_tipo: _accessText_(event.ambito_tipo),
        ambito_referencia_id: _accessText_(event.ambito_referencia_id)
      };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

function _accessChangeStatus_(config) {
  const auth = _accessRequirePermission_(config.permission);
  const nextActive = _accessNormalizeActive_(config.active, 'El estado solicitado');
  const collectionField = {
    usuarios: 'users',
    roles: 'roles',
    permisos: 'permissions'
  }[config.collection];
  const requiredHeaders = ACCESS_MANAGEMENT_FIELDS[collectionField];
  const matches = _accessFindSecurityRecords_(
    config.sheet,
    config.keyField,
    [config.id],
    requiredHeaders
  );
  if (matches.length !== 1) {
    throw new Error(matches.length
      ? 'El identificador "' + config.id + '" está duplicado.'
      : 'No se encontró el registro "' + config.id + '".');
  }
  const record = matches[0];

  const currentActive = _accessIsActive_(record.active);
  if (currentActive === nextActive) {
    return { success: true, message: 'El registro ya se encuentra ' + (nextActive ? 'activo' : 'inactivo') + '.' };
  }

  if (config.collection === 'usuarios' && !nextActive &&
      _accessText_(record.persona_id) === _accessText_(auth.personaId)) {
    throw new Error('No puedes desactivar tu propia cuenta.');
  }

  if (config.collection === 'roles' && !nextActive) {
    const assignments = _accessFindSecurityRecords_(
      ACCESS_MANAGEMENT_CONFIG.sheets.userRoles,
      'rol_id',
      [record.rol_id],
      ACCESS_MANAGEMENT_FIELDS.userRoles
    ).filter(item => _accessIsActive_(item.active));
    if (assignments.length) throw new Error('No puedes desactivar un rol que tiene asignaciones activas.');
  }

  const data = _accessLoadAdministratorContinuityData_();
  const after = _accessCopyData_(data);
  if (config.collection === 'usuarios') {
    const index = after.usuarios.findIndex(item =>
      _accessText_(item.persona_id) === _accessText_(record.persona_id)
    );
    if (index >= 0) after.usuarios[index] = Object.assign({}, record, { active: nextActive });
    else after.usuarios.push(Object.assign({}, record, { active: nextActive }));
  } else if (config.collection === 'roles' &&
      _accessText_(record.rol_id) === ACCESS_MANAGEMENT_CONFIG.adminRoleId) {
    const index = after.roles.findIndex(item =>
      _accessText_(item.rol_id) === _accessText_(record.rol_id)
    );
    if (index >= 0) after.roles[index] = Object.assign({}, record, { active: nextActive });
    else after.roles.push(Object.assign({}, record, { active: nextActive }));
  } else if (config.collection === 'permisos' &&
      ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes.includes(_accessUpper_(record.codigo)) &&
      _accessText_(record.modulo_id) === _accessText_(data.modulos[0] && data.modulos[0].modulo_id)) {
    const index = after.permisos.findIndex(item =>
      _accessText_(item.permiso_id) === _accessText_(record.permiso_id)
    );
    if (index >= 0) after.permisos[index] = Object.assign({}, record, { active: nextActive });
    else after.permisos.push(Object.assign({}, record, { active: nextActive }));
  }
  _accessAssertAdministratorContinuity_(data, after);

  const person = config.collection === 'usuarios'
    ? _accessFindPersonById_(record.persona_id)
    : null;
  const displayName = config.getName ? config.getName(record, person) : _accessText_(config.id);

  return _accessRunAudited_(auth, {
    accion: nextActive ? config.activateAction : config.deactivateAction,
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: config.entity,
    registro_id: _accessText_(config.id),
    registro_nombre: displayName,
    detalle: 'Cambio de estado de ' + config.entity.toLowerCase() + '.',
    datos_antes: record
  }, () => {
    const result = SUNARPCore.setRecordStatus(
      _accessSecuritySource_(config.sheet),
      config.keyField,
      config.id,
      'active',
      nextActive
    );
    return {
      value: {
        success: true,
        message: nextActive ? 'Registro activado correctamente.' : 'Registro desactivado correctamente.'
      },
      auditAfter: Object.assign({}, record, { active: nextActive })
    };
  });
}


function setAccessUserStatus(personaId, active) {
  return _accessChangeStatus_({
    collection: 'usuarios',
    sheet: ACCESS_MANAGEMENT_CONFIG.sheets.users,
    keyField: 'persona_id',
    id: _accessText_(personaId),
    active,
    permission: 'USUARIOS_ADMINISTRAR',
    entity: 'USUARIO',
    activateAction: 'ACTIVAR_USUARIO',
    deactivateAction: 'DESACTIVAR_USUARIO',
    getName: (record, person) => [person && person.nombres, person && person.apellidos].map(_accessText_).filter(Boolean).join(' ')
  });
}


function setAccessRoleStatus(roleId, active) {
  return _accessChangeStatus_({
    collection: 'roles',
    sheet: ACCESS_MANAGEMENT_CONFIG.sheets.roles,
    keyField: 'rol_id',
    id: _accessUpper_(roleId),
    active,
    permission: 'ROLES_ADMINISTRAR',
    entity: 'ROL',
    activateAction: 'ACTIVAR_ROL',
    deactivateAction: 'DESACTIVAR_ROL',
    getName: record => record.nombre
  });
}


function setAccessPermissionStatus(permissionId, active) {
  return _accessChangeStatus_({
    collection: 'permisos',
    sheet: ACCESS_MANAGEMENT_CONFIG.sheets.permissions,
    keyField: 'permiso_id',
    id: _accessUpper_(permissionId),
    active,
    permission: 'PERMISOS_ADMINISTRAR',
    entity: 'PERMISO',
    activateAction: 'ACTIVAR_PERMISO',
    deactivateAction: 'DESACTIVAR_PERMISO',
    getName: record => record.codigo
  });
}




/* ==========================================================================
   MIGRACIÓN DEL ESQUEMA NORMALIZADO DE ACCESOS
   --------------------------------------------------------------------------
   - No modifica ni reemplaza el contenido de Operaciones.
   - Crea/normaliza el catálogo cerrado TiposAmbito.
   - Migra AmbitosAcceso.tipo_ambito -> tipo_ambito_id.
   - Migra Permisos.operacion -> operacion_id usando Operaciones.
   - Conserva las columnas antiguas como respaldo.
   ========================================================================== */

const ACCESS_SCHEMA_MIGRATION_SCOPE_ROWS = Object.freeze([
  Object.freeze({
    tipo_ambito_id: 'TOTAL',
    nombre: 'Total',
    descripcion: 'Acceso a todos los registros del módulo',
    entidad_referencia: 'NINGUNA',
    requiere_referencia: 'NO',
    permite_descendientes: 'NO',
    active: true
  }),
  Object.freeze({
    tipo_ambito_id: 'SEDE',
    nombre: 'Sede',
    descripcion: 'Acceso a los registros pertenecientes a una sede',
    entidad_referencia: 'SEDE',
    requiere_referencia: 'SI',
    permite_descendientes: 'NO',
    active: true
  }),
  Object.freeze({
    tipo_ambito_id: 'ESTRUCTURA_ORG',
    nombre: 'Unidad orgánica',
    descripcion: 'Acceso a una unidad orgánica y, opcionalmente, a sus descendientes',
    entidad_referencia: 'ESTRUCTURA_ORG',
    requiere_referencia: 'SI',
    permite_descendientes: 'SI',
    active: true
  }),
  Object.freeze({
    tipo_ambito_id: 'LOCAL',
    nombre: 'Local directamente asignado',
    descripcion: 'Acceso a registros adscritos directamente a un local, sin unidad orgánica',
    entidad_referencia: 'LOCAL',
    requiere_referencia: 'SI',
    permite_descendientes: 'NO',
    active: true
  })
]);

const ACCESS_SCHEMA_MIGRATION_SCOPE_HEADERS = Object.freeze([
  'tipo_ambito_id',
  'nombre',
  'descripcion',
  'entidad_referencia',
  'requiere_referencia',
  'permite_descendientes',
  'active'
]);

function _accessMigrationReadSheet_(spreadsheet, sheetName, requiredHeaders) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('No existe la pestaña "' + sheetName + '" en el archivo de seguridad.');

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (!lastColumn || lastRow < 1) throw new Error('La pestaña "' + sheetName + '" no contiene encabezados.');

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const seen = new Set();
  headers.forEach(header => {
    if (!header) return;
    if (seen.has(header)) throw new Error('La pestaña "' + sheetName + '" tiene el encabezado duplicado "' + header + '".');
    seen.add(header);
  });

  const missing = (requiredHeaders || []).filter(header => !headers.includes(header));
  if (missing.length) throw new Error('La pestaña "' + sheetName + '" no contiene: ' + missing.join(', ') + '.');

  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getDisplayValues()
    : [];

  const records = rows.map((values, index) => ({
    rowNumber: index + 2,
    values,
    get: field => {
      const column = headers.indexOf(field);
      return column < 0 ? '' : String(values[column] === undefined ? '' : values[column]).trim();
    }
  })).filter(row => row.values.some(value => String(value || '').trim() !== ''));

  return { sheet, sheetName, headers, records, lastColumn, lastRow };
}

function _accessMigrationIsActive_(value) {
  const normalized = _accessUpper_(value);
  return !['FALSE', '0', 'NO', 'INACTIVO', 'INACTIVE'].includes(normalized);
}

function _accessMigrationAssertAdministrator_(securitySpreadsheet) {
  const email = SUNARPCore.getCurrentUserEmail();
  if (!email) throw new Error('No se pudo identificar tu correo institucional para ejecutar la migración.');

  const directorySource = getIntranetDataSource('DIRECTORY', 'personas', 1);
  const directorySpreadsheet = SpreadsheetApp.openById(directorySource.spreadsheetId);
  const people = _accessMigrationReadSheet_(directorySpreadsheet, 'personas', [
    'persona_id', 'correo_institucional'
  ]);
  const matchingPeople = people.records.filter(row => row.get('correo_institucional').toLowerCase() === email);
  if (matchingPeople.length !== 1) throw new Error('La migración requiere una única persona asociada a tu correo institucional.');
  const personaId = matchingPeople[0].get('persona_id');

  const users = _accessMigrationReadSheet_(securitySpreadsheet, 'Usuarios', ['persona_id', 'active']);
  const accounts = users.records.filter(row => row.get('persona_id') === personaId && _accessMigrationIsActive_(row.get('active')));
  if (accounts.length !== 1) throw new Error('La migración requiere una cuenta activa en Usuarios.');

  const modules = _accessMigrationReadSheet_(securitySpreadsheet, 'Modulos', ['modulo_id', 'codigo', 'active']);
  const accessModules = modules.records.filter(row =>
    _accessUpper_(row.get('codigo')) === ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses &&
    _accessMigrationIsActive_(row.get('active'))
  );
  if (accessModules.length !== 1) throw new Error('No se pudo resolver un único módulo ACCESOS activo.');
  const moduleId = accessModules[0].get('modulo_id');

  const roles = _accessMigrationReadSheet_(securitySpreadsheet, 'Roles', ['rol_id', 'active']);
  const adminRoles = roles.records.filter(row =>
    _accessUpper_(row.get('rol_id')) === ACCESS_MANAGEMENT_CONFIG.adminRoleId &&
    _accessMigrationIsActive_(row.get('active'))
  );
  if (adminRoles.length !== 1) throw new Error('No se encontró el rol ROL_ADMIN activo.');

  const userRoles = _accessMigrationReadSheet_(securitySpreadsheet, 'UsuarioRol', [
    'persona_id', 'modulo_id', 'rol_id', 'active'
  ]);
  const hasAdminRole = userRoles.records.some(row =>
    row.get('persona_id') === personaId &&
    row.get('modulo_id') === moduleId &&
    _accessUpper_(row.get('rol_id')) === ACCESS_MANAGEMENT_CONFIG.adminRoleId &&
    _accessMigrationIsActive_(row.get('active'))
  );
  if (!hasAdminRole) throw new Error('Solo un administrador global ROL_ADMIN puede ejecutar esta migración.');

  const permissions = _accessMigrationReadSheet_(securitySpreadsheet, 'Permisos', [
    'permiso_id', 'codigo', 'modulo_id', 'active'
  ]);
  const rolePermissions = _accessMigrationReadSheet_(securitySpreadsheet, 'RolPermiso', [
    'rol_id', 'permiso_id', 'active'
  ]);
  const adminPermissionIds = new Set(rolePermissions.records.filter(row =>
    _accessUpper_(row.get('rol_id')) === ACCESS_MANAGEMENT_CONFIG.adminRoleId &&
    _accessMigrationIsActive_(row.get('active'))
  ).map(row => row.get('permiso_id')));
  const grantedCodes = new Set(permissions.records.filter(row =>
    row.get('modulo_id') === moduleId &&
    _accessMigrationIsActive_(row.get('active')) &&
    adminPermissionIds.has(row.get('permiso_id'))
  ).map(row => _accessUpper_(row.get('codigo'))));

  const missingPermissions = ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes.filter(code => !grantedCodes.has(code));
  if (missingPermissions.length) {
    throw new Error('La migración requiere ROL_ADMIN con todos los permisos administrativos. Faltan: ' + missingPermissions.join(', ') + '.');
  }

  const scopes = _accessMigrationReadSheet_(securitySpreadsheet, 'AmbitosAcceso', [
    'persona_id', 'modulo_id', 'active'
  ]);
  const scopeTypeField = scopes.headers.includes('tipo_ambito_id')
    ? 'tipo_ambito_id'
    : scopes.headers.includes('tipo_ambito')
      ? 'tipo_ambito'
      : '';
  if (!scopeTypeField) throw new Error('AmbitosAcceso no contiene tipo_ambito ni tipo_ambito_id para validar al administrador.');
  const hasGlobalScope = scopes.records.some(row =>
    row.get('persona_id') === personaId &&
    row.get('modulo_id') === moduleId &&
    _accessUpper_(row.get(scopeTypeField)) === 'TOTAL' &&
    _accessMigrationIsActive_(row.get('active'))
  );
  if (!hasGlobalScope) throw new Error('La migración requiere que tu cuenta conserve un ámbito TOTAL activo en ACCESOS.');

  return { email, personaId };
}

function _accessMigrationPrepareColumn_(table, targetField, legacyField, resolveValue) {
  const targetIndex = table.headers.indexOf(targetField);
  const legacyIndex = table.headers.indexOf(legacyField);
  if (targetIndex < 0 && legacyIndex < 0) {
    throw new Error('La pestaña "' + table.sheetName + '" no contiene "' + targetField + '" ni el campo anterior "' + legacyField + '".');
  }

  const targetColumn = targetIndex >= 0 ? targetIndex + 1 : table.lastColumn + 1;
  const updates = table.records.map(row => {
    const current = targetIndex >= 0 ? row.get(targetField) : '';
    const legacy = legacyIndex >= 0 ? row.get(legacyField) : '';
    const source = current || legacy;
    if (!source) throw new Error('La fila ' + row.rowNumber + ' de "' + table.sheetName + '" no tiene valor para ' + targetField + '.');
    const normalized = resolveValue(source, row);
    if (!normalized) throw new Error('No se pudo normalizar ' + targetField + ' en la fila ' + row.rowNumber + ' de "' + table.sheetName + '".');
    return { rowNumber: row.rowNumber, value: normalized };
  });

  return {
    sheet: table.sheet,
    sheetName: table.sheetName,
    targetField,
    targetColumn,
    createHeader: targetIndex < 0,
    updates
  };
}

function _accessMigrationWriteColumn_(plan, markWriteStarted) {
  if (typeof markWriteStarted !== 'function') {
    throw new Error('La escritura de migración requiere el marcador de inicio de Core.');
  }
  if (plan.createHeader) {
    markWriteStarted();
    plan.sheet.getRange(1, plan.targetColumn).setValue(plan.targetField);
  }
  plan.updates.forEach(update => {
    markWriteStarted();
    plan.sheet.getRange(update.rowNumber, plan.targetColumn).setValue(update.value);
  });
}

function _accessMigrationEnsureScopeTypes_(spreadsheet, markWriteStarted) {
  if (typeof markWriteStarted !== 'function') {
    throw new Error('La normalización de TiposAmbito requiere el marcador de inicio de Core.');
  }
  const sheetName = ACCESS_MANAGEMENT_CONFIG.sheets.scopeTypes;
  let sheet = spreadsheet.getSheetByName(sheetName);
  const created = !sheet;
  if (!sheet) {
    markWriteStarted();
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (!sheet.getLastColumn() || !sheet.getLastRow()) {
    markWriteStarted();
    sheet.getRange(1, 1, 1, ACCESS_SCHEMA_MIGRATION_SCOPE_HEADERS.length)
      .setValues([ACCESS_SCHEMA_MIGRATION_SCOPE_HEADERS.slice()]);
  }

  let lastColumn = sheet.getLastColumn();
  let headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(value => String(value || '').trim());
  const seenHeaders = new Set();
  headers.forEach(header => {
    if (!header) return;
    if (seenHeaders.has(header)) throw new Error('TiposAmbito tiene el encabezado duplicado "' + header + '".');
    seenHeaders.add(header);
  });

  ACCESS_SCHEMA_MIGRATION_SCOPE_HEADERS.forEach(header => {
    if (headers.includes(header)) return;
    lastColumn += 1;
    markWriteStarted();
    sheet.getRange(1, lastColumn).setValue(header);
    headers.push(header);
  });

  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues()
    : [];
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const existing = new Map();
  const typeIdIndex = indexes.get('tipo_ambito_id');
  const legacyTypeIndex = indexes.has('tipo_ambito') ? indexes.get('tipo_ambito') : -1;
  const typeIdsByName = new Map(ACCESS_SCHEMA_MIGRATION_SCOPE_ROWS.map(item => [
    item.nombre.toLocaleLowerCase(),
    item.tipo_ambito_id
  ]));

  rows.forEach((values, index) => {
    if (!values.some(value => String(value || '').trim() !== '')) return;
    let id = _accessUpper_(values[typeIdIndex]);
    if (!id && legacyTypeIndex >= 0) {
      const legacyValue = String(values[legacyTypeIndex] || '').trim();
      const legacyToken = _accessUpper_(legacyValue);
      id = ACCESS_SCOPE_TYPE_IDS.includes(legacyToken)
        ? legacyToken
        : typeIdsByName.get(legacyValue.toLocaleLowerCase()) || '';
      if (id) {
        markWriteStarted();
        sheet.getRange(index + 2, typeIdIndex + 1).setValue(id);
      }
    }
    if (!id) throw new Error('TiposAmbito contiene un registro sin tipo_ambito_id en la fila ' + (index + 2) + '.');
    if (existing.has(id)) throw new Error('TiposAmbito contiene el identificador duplicado ' + id + '.');
    if (!ACCESS_SCOPE_TYPE_IDS.includes(id)) throw new Error('TiposAmbito contiene una categoría no admitida: ' + id + '.');
    existing.set(id, index + 2);
  });

  let added = 0;
  ACCESS_SCHEMA_MIGRATION_SCOPE_ROWS.forEach(record => {
    const rowNumber = existing.get(record.tipo_ambito_id);
    if (!rowNumber) {
      const targetRow = sheet.getLastRow() + 1;
      const values = headers.map(header =>
        Object.prototype.hasOwnProperty.call(record, header) ? record[header] : ''
      );
      markWriteStarted();
      sheet.getRange(targetRow, 1, 1, headers.length).setValues([values]);
      added += 1;
      return;
    }

    ACCESS_SCHEMA_MIGRATION_SCOPE_HEADERS.forEach(field => {
      markWriteStarted();
      sheet.getRange(rowNumber, indexes.get(field) + 1).setValue(record[field]);
    });
  });

  return { created, added };
}


/**
 * Ejecuta una sola vez la migración del esquema en el archivo Seguridad.
 * Requiere ROL_ADMIN, todos sus permisos administrativos y ámbito TOTAL.
 * Los campos anteriores se conservan para permitir una revisión posterior.
 */
function migrateAccessManagementSchema() {
  if (
    typeof SUNARPCore === 'undefined' ||
    typeof SUNARPCore.runSourceWriteBatch !== 'function'
  ) {
    throw new Error('La migración requiere SUNARP Core v10. No se ha iniciado ninguna escritura.');
  }

  const affectedSources = [
    getIntranetDataSource('SECURITY', ACCESS_MANAGEMENT_CONFIG.sheets.permissions, 1),
    getIntranetDataSource('SECURITY', ACCESS_MANAGEMENT_CONFIG.sheets.scopes, 1),
    getIntranetDataSource('SECURITY', ACCESS_MANAGEMENT_CONFIG.sheets.scopeTypes, 1)
  ];

  return SUNARPCore.runSourceWriteBatch(affectedSources, markWriteStarted => {
    const usersSource = getIntranetDataSource('SECURITY', ACCESS_MANAGEMENT_CONFIG.sheets.users, 1);
    const spreadsheet = SpreadsheetApp.openById(usersSource.spreadsheetId);
    const actor = _accessMigrationAssertAdministrator_(spreadsheet);

    const operations = _accessMigrationReadSheet_(spreadsheet, ACCESS_MANAGEMENT_CONFIG.sheets.operations, [
      'operacion_id', 'nombre'
    ]);
    const operationById = new Map();
    const operationIdsByName = new Map();
    operations.records.forEach(row => {
      const id = _accessUpper_(row.get('operacion_id'));
      const name = row.get('nombre');
      if (!id || !name) throw new Error('Operaciones contiene una fila sin operacion_id o nombre.');
      if (operationById.has(id)) throw new Error('Operaciones contiene el operacion_id duplicado ' + id + '.');
      operationById.set(id, id);
      const nameKey = name.toLocaleLowerCase();
      if (!operationIdsByName.has(nameKey)) operationIdsByName.set(nameKey, []);
      operationIdsByName.get(nameKey).push(id);
    });

    const permissions = _accessMigrationReadSheet_(spreadsheet, ACCESS_MANAGEMENT_CONFIG.sheets.permissions, [
      'permiso_id', 'codigo', 'modulo_id', 'active'
    ]);
    const permissionIds = new Set();
    const permissionCodes = new Set();
    permissions.records.forEach(row => {
      const id = row.get('permiso_id');
      const code = _accessUpper_(row.get('codigo'));
      if (!id || !code) throw new Error('Permisos tiene una fila sin permiso_id o codigo en la fila ' + row.rowNumber + '.');
      if (permissionIds.has(id)) throw new Error('Permisos tiene un permiso_id duplicado: ' + id + '.');
      if (permissionCodes.has(code)) throw new Error('Permisos tiene un codigo duplicado: ' + code + '.');
      permissionIds.add(id);
      permissionCodes.add(code);
    });

    const permissionPlan = _accessMigrationPrepareColumn_(
      permissions,
      'operacion_id',
      'operacion',
      value => {
        const token = _accessUpper_(value);
        if (operationById.has(token)) return token;
        const matches = operationIdsByName.get(String(value || '').trim().toLocaleLowerCase()) || [];
        if (matches.length === 1) return matches[0];
        if (matches.length > 1) throw new Error('El valor de operación "' + value + '" es ambiguo en Operaciones.');
        throw new Error('El valor de operación "' + value + '" no existe en la pestaña Operaciones.');
      }
    );

    const scopes = _accessMigrationReadSheet_(spreadsheet, ACCESS_MANAGEMENT_CONFIG.sheets.scopes, [
      'persona_id', 'modulo_id', 'referencia_id', 'incluir_descendientes', 'active'
    ]);
    const scopePlan = _accessMigrationPrepareColumn_(
      scopes,
      'tipo_ambito_id',
      'tipo_ambito',
      (value, row) => {
        const token = _accessUpper_(value);
        if (!ACCESS_SCOPE_TYPE_IDS.includes(token)) {
          throw new Error('El tipo de ámbito "' + value + '" no pertenece al catálogo cerrado.');
        }
        const referenceId = row.get('referencia_id');
        const includesDescendants = _accessFlag_(row.get('incluir_descendientes'));
        const requiresReference = token !== 'TOTAL';
        if (requiresReference && !referenceId) {
          throw new Error('La fila ' + row.rowNumber + ' de AmbitosAcceso requiere referencia_id para ' + token + '.');
        }
        if (!requiresReference && referenceId) {
          throw new Error('La fila ' + row.rowNumber + ' de AmbitosAcceso tiene referencia_id en TOTAL.');
        }
        if (includesDescendants && token !== 'ESTRUCTURA_ORG') {
          throw new Error('La fila ' + row.rowNumber + ' de AmbitosAcceso intenta incluir descendientes en ' + token + '.');
        }
        return token;
      }
    );

    const scopeValueByRow = new Map(scopePlan.updates.map(update => [update.rowNumber, update.value]));
    const seenScopeKeys = new Set();
    scopes.records.forEach(row => {
      const typeId = scopeValueByRow.get(row.rowNumber);
      const key = [
        row.get('persona_id'),
        row.get('modulo_id'),
        typeId,
        row.get('referencia_id')
      ].join('\\u0000');
      if (seenScopeKeys.has(key)) {
        throw new Error('AmbitosAcceso contiene ámbitos duplicados para la misma persona, módulo y referencia.');
      }
      seenScopeKeys.add(key);
    });

    // La hoja de tipos se crea/normaliza después de validar las relaciones
    // existentes, evitando cambios parciales por valores huérfanos.
    const scopeCatalogResult = _accessMigrationEnsureScopeTypes_(spreadsheet, markWriteStarted);
    _accessMigrationWriteColumn_(permissionPlan, markWriteStarted);
    _accessMigrationWriteColumn_(scopePlan, markWriteStarted);

    return {
      success: true,
      message: 'La estructura de accesos quedó normalizada. Las columnas antiguas se conservaron como respaldo.',
      actor: actor.email,
      persona_id: actor.personaId,
      permisos_migrados: permissionPlan.updates.length,
      ambitos_migrados: scopePlan.updates.length,
      tipos_ambito_creados: scopeCatalogResult.added,
      pestaña_tipos_ambito_creada: scopeCatalogResult.created
    };
  });
}
