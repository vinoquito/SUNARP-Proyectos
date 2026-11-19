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
    rolePermissions: 'RolPermiso',
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
  privilegedRolePermissionCodes: Object.freeze([
    'USUARIOS_ADMINISTRAR',
    'ROLES_ADMINISTRAR',
    'PERMISOS_ADMINISTRAR',
    'AMBITOS_ACCESO_ADMINISTRAR',
    'AUDITORIA_VER'
  ])
});

const ACCESS_MANAGEMENT_FIELDS = Object.freeze({
  users: Object.freeze(['persona_id', 'active']),
  modules: Object.freeze(['modulo_id', 'codigo', 'nombre', 'descripcion', 'active']),
  roles: Object.freeze(['rol_id', 'nombre', 'descripcion', 'active']),
  userRoles: Object.freeze(['persona_id', 'modulo_id', 'rol_id', 'active']),
  permissions: Object.freeze(['permiso_id', 'codigo', 'modulo_id', 'operacion', 'descripcion', 'active']),
  rolePermissions: Object.freeze(['rol_id', 'permiso_id', 'active']),
  scopes: Object.freeze(['persona_id', 'modulo_id', 'tipo_ambito', 'referencia_id', 'incluir_descendientes', 'active']),
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
 * Carga los datos de seguridad necesarios para autorización y gestión.
 */
function _accessLoadSecurityData_() {
  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const requests = [
    { key: 'usuarios', source: _accessSecuritySource_(s.users), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.users },
    { key: 'modulos', source: _accessSecuritySource_(s.modules), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.modules },
    { key: 'roles', source: _accessSecuritySource_(s.roles), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.roles },
    { key: 'usuarioRol', source: _accessSecuritySource_(s.userRoles), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.userRoles },
    { key: 'permisos', source: _accessSecuritySource_(s.permissions), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.permissions },
    { key: 'rolPermiso', source: _accessSecuritySource_(s.rolePermissions), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.rolePermissions },
    { key: 'ambitosAcceso', source: _accessSecuritySource_(s.scopes), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.scopes },
    { key: 'personas', source: _accessDirectorySource_(s.people), requiredHeaders: ACCESS_MANAGEMENT_FIELDS.people }
  ];

  const data = SUNARPCore.listRecordsFromSourcesCached(requests, 15);
  _accessValidateSnapshot_(data);
  return data;
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
    ['personas', ['persona_id'], 'personas.persona_id'],
    ['usuarios', ['persona_id'], 'Usuarios.persona_id'],
    ['modulos', ['modulo_id'], 'Modulos.modulo_id'],
    ['modulos', ['codigo'], 'Modulos.codigo'],
    ['roles', ['rol_id'], 'Roles.rol_id'],
    ['permisos', ['permiso_id'], 'Permisos.permiso_id'],
    ['permisos', ['codigo'], 'Permisos.codigo'],
    ['usuarioRol', ['persona_id', 'modulo_id', 'rol_id'], 'UsuarioRol.persona_id+modulo_id+rol_id'],
    ['rolPermiso', ['rol_id', 'permiso_id'], 'RolPermiso.rol_id+permiso_id'],
    ['ambitosAcceso', ['persona_id', 'modulo_id', 'tipo_ambito', 'referencia_id'], 'AmbitosAcceso']
  ];

  unique.forEach(([collection, fields, label]) =>
    _accessValidateUnique_(data[collection] || [], fields, label)
  );

  const personIds = new Set(data.personas.map(row => _accessText_(row.persona_id)));
  const moduleIds = new Set(data.modulos.map(row => _accessText_(row.modulo_id)));
  const roleIds = new Set(data.roles.map(row => _accessText_(row.rol_id)));
  const permissionIds = new Set(data.permisos.map(row => _accessText_(row.permiso_id)));
  const userIds = new Set(data.usuarios.map(row => _accessText_(row.persona_id)));

  data.usuarios.forEach(user => {
    if (!personIds.has(_accessText_(user.persona_id))) {
      throw new Error('Usuarios referencia una persona inexistente: ' + _accessText_(user.persona_id) + '.');
    }
  });

  data.usuarioRol.forEach(item => {
    if (!personIds.has(_accessText_(item.persona_id))) throw new Error('UsuarioRol referencia una persona inexistente.');
    if (!userIds.has(_accessText_(item.persona_id))) throw new Error('UsuarioRol referencia una cuenta inexistente en Usuarios.');
    if (!moduleIds.has(_accessText_(item.modulo_id))) throw new Error('UsuarioRol referencia un módulo inexistente.');
    if (!roleIds.has(_accessText_(item.rol_id))) throw new Error('UsuarioRol referencia un rol inexistente.');
  });

  data.permisos.forEach(permission => {
    if (!moduleIds.has(_accessText_(permission.modulo_id))) {
      throw new Error('El permiso ' + _accessText_(permission.permiso_id) + ' referencia un modulo_id inexistente.');
    }
  });

  data.rolPermiso.forEach(item => {
    if (!roleIds.has(_accessText_(item.rol_id))) throw new Error('RolPermiso referencia un rol inexistente.');
    if (!permissionIds.has(_accessText_(item.permiso_id))) throw new Error('RolPermiso referencia un permiso inexistente.');
  });

  data.ambitosAcceso.forEach(item => {
    if (!personIds.has(_accessText_(item.persona_id))) throw new Error('AmbitosAcceso referencia una persona inexistente.');
    if (!moduleIds.has(_accessText_(item.modulo_id))) throw new Error('AmbitosAcceso referencia un módulo inexistente.');
  });

  const codes = new Set();
  data.modulos.filter(row => _accessIsActive_(row.active)).forEach(module => {
    const code = _accessUpper_(module.codigo);
    if (!code) throw new Error('Existe un módulo activo sin código.');
    if (codes.has(code)) throw new Error('Existe un código duplicado en Modulos: ' + code + '.');
    codes.add(code);
  });
}


function _accessOrgCatalog_() {
  const requests = [
    { key: 'sedes', source: getIntranetDataSource('SECURITY', 'Sedes', 1) },
    { key: 'estructuraOrg', source: getIntranetDataSource('SECURITY', 'EstructuraOrg', 1) },
    { key: 'locales', source: getIntranetDataSource('DIRECTORY', 'locales', 1) }
  ];
  return SUNARPCore.listRecordsFromSourcesCached(requests, 30);
}


function _accessGetAuthContext_() {
  const email = SUNARPCore.getCurrentUserEmail();
  if (!email) {
    throw new Error('No se pudo identificar tu cuenta institucional. Verifica la implementación de la aplicación web.');
  }

  const data = _accessLoadSecurityData_();
  const matchingPeople = data.personas.filter(person =>
    _accessText_(person.correo_institucional).toLowerCase() === email
  );

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

  return Object.assign({}, context, {
    email,
    name: [person.nombres, person.apellidos].map(_accessText_).filter(Boolean).join(' '),
    person,
    personasCatalog: data.personas,
    modules: data.modulos,
    permissionsCatalog: data.permisos,
    rolesCatalog: data.roles
  });
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

    const info = SUNARPCore.getSourceInfo(source);
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
  const moduleId = _accessResolveModuleId_(auth, moduleIdOrCode || ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses);
  const accessModuleId = _accessResolveModuleId_(auth, ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses);
  const code = _accessUpper_(permissionCode);

  if (moduleId === accessModuleId && !_accessIsGlobalAdministrator_(auth)) {
    _accessWriteAudit_(auth, {
      accion: 'AUTORIZACION_DENEGADA',
      modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
      tipo_entidad: 'ADMINISTRACION',
      registro_id: code,
      registro_nombre: code,
      resultado: 'DENEGADO',
      detalle: 'La administración de accesos exige ROL_ADMIN y ámbito TOTAL en el módulo ACCESOS.'
    });
    throw new Error('La administración de accesos requiere ROL_ADMIN y ámbito TOTAL en el módulo Accesos.');
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
    const allowed = SUNARPCore.authorizationIsRecordInScope(auth, moduleId, record, catalogs.estructuraOrg);
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


function _accessRecordIsAllowed_(auth, moduleId, record, structures) {
  const resolvedModuleId = _accessResolveModuleId_(auth, moduleId);
  return SUNARPCore.authorizationIsRecordInScope(auth, resolvedModuleId, record, structures || []);
}


function _accessRoleHasPrivilegedPermissions_(data, roleId) {
  const accessModule = data.modulos.find(module =>
    _accessUpper_(module.codigo) === ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses &&
    _accessIsActive_(module.active)
  );
  if (!accessModule) return false;
  const permissionCodesById = new Map(data.permisos
    .filter(permission =>
      _accessIsActive_(permission.active) &&
      _accessText_(permission.modulo_id) === _accessText_(accessModule.modulo_id)
    )
    .map(permission => [_accessText_(permission.permiso_id), _accessUpper_(permission.codigo)]));
  return data.rolPermiso.some(assignment =>
    _accessIsActive_(assignment.active) &&
    _accessText_(assignment.rol_id) === _accessText_(roleId) &&
    ACCESS_MANAGEMENT_CONFIG.privilegedRolePermissionCodes.includes(
      permissionCodesById.get(_accessText_(assignment.permiso_id))
    )
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
    .filter(scope => _accessIsActive_(scope.active) && _accessText_(scope.modulo_id) === moduleId && _accessUpper_(scope.tipo_ambito) === 'TOTAL')
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
    personas: (data.personas || []).map(row => Object.assign({}, row)),
    usuarios: (data.usuarios || []).map(row => Object.assign({}, row)),
    modulos: (data.modulos || []).map(row => Object.assign({}, row)),
    roles: (data.roles || []).map(row => Object.assign({}, row)),
    usuarioRol: (data.usuarioRol || []).map(row => Object.assign({}, row)),
    permisos: (data.permisos || []).map(row => Object.assign({}, row)),
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
 * Crea o actualiza un usuario.
 */
function _accessRecordUser_(auth, payload, action) {
  const source = _accessSecuritySource_(ACCESS_MANAGEMENT_CONFIG.sheets.users);
  const personaId = _accessText_(payload.persona_id);
  const active = _accessNormalizeActive_(payload.active, 'El estado de la cuenta');
  if (!personaId) throw new Error('Selecciona una persona del directorio.');
  const person = _accessFindBy_(auth.personasCatalog, 'persona_id', personaId);
  if (!person) throw new Error('La persona seleccionada no existe en personas.');
  _accessValidateEmail_(person.correo_institucional);
  if (personaId === _accessText_(auth.personaId) && !active) {
    throw new Error('No puedes desactivar tu propia cuenta mientras administras el gestor.');
  }

  const data = _accessLoadSecurityData_();
  const existing = _accessFindBy_(data.usuarios, 'persona_id', personaId);
  if (action === 'create' && existing) throw new Error('La persona ya tiene una cuenta registrada.');
  if (action === 'edit' && !existing) throw new Error('No se encontró la cuenta que deseas actualizar.');

  const nextUser = { persona_id: personaId, active };
  const after = _accessCopyData_(data);
  if (action === 'edit') {
    const index = after.usuarios.findIndex(row => _accessText_(row.persona_id) === personaId);
    after.usuarios[index] = nextUser;
  } else after.usuarios.push(nextUser);
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

  const data = _accessLoadSecurityData_();
  if (!data.usuarios.some(row => _accessText_(row.persona_id) === personaId && _accessIsActive_(row.active))) {
    throw new Error('La persona no tiene una cuenta activa.');
  }
  const module = data.modulos.find(row => _accessText_(row.modulo_id) === moduleId && _accessIsActive_(row.active));
  if (!module) throw new Error('El módulo no existe o está inactivo.');

  if (active) {
    const role = data.roles.find(row => _accessText_(row.rol_id) === roleId && _accessIsActive_(row.active));
    if (!role) throw new Error('El rol seleccionado no existe o está inactivo.');
    if (_accessRoleHasPrivilegedPermissions_(data, roleId)) {
      const accessModule = data.modulos.find(row => _accessUpper_(row.codigo) === ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses);
      if (_accessText_(module.modulo_id) !== _accessText_(accessModule && accessModule.modulo_id) ||
          roleId !== ACCESS_MANAGEMENT_CONFIG.adminRoleId) {
        throw new Error('Los permisos administrativos solo pueden asignarse mediante ROL_ADMIN dentro del módulo ACCESOS.');
      }
    }
  }

  const after = _accessCopyData_(data);
  const previous = after.usuarioRol.filter(item => _accessText_(item.persona_id) === personaId && _accessText_(item.modulo_id) === moduleId);
  after.usuarioRol = after.usuarioRol.filter(item => !(_accessText_(item.persona_id) === personaId && _accessText_(item.modulo_id) === moduleId));
  if (active) after.usuarioRol.push({ persona_id: personaId, modulo_id: moduleId, rol_id: roleId, active: true });
  _accessAssertAdministratorContinuity_(data, after);

  const person = _accessFindBy_(data.personas, 'persona_id', personaId);
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
  const roleId = _accessUpper_(payload.rol_id || payload.roleId);
  const name = _accessText_(payload.nombre || payload.name);
  const description = _accessText_(payload.descripcion || payload.description);
  const active = _accessNormalizeActive_(payload.active === undefined ? true : payload.active, 'El estado del rol');
  const originalId = _accessUpper_(payload.rol_id_original || payload.originalRoleId || roleId);

  if (!['create', 'edit'].includes(action)) throw new Error('La operación del rol no es válida.');
  if (!/^[A-Z0-9_-]{2,50}$/.test(roleId)) throw new Error('El ID del rol solo admite letras, números, guion y guion bajo.');
  if (!name) throw new Error('Ingresa el nombre del rol.');
  if (action === 'edit' && roleId !== originalId) throw new Error('No está permitido cambiar el ID de un rol existente.');

  const data = _accessLoadSecurityData_();
  const existing = _accessFindBy_(data.roles, 'rol_id', action === 'edit' ? originalId : roleId);
  if (action === 'create' && existing) throw new Error('Ya existe un rol con ese ID.');
  if (action === 'edit' && !existing) throw new Error('No se encontró el rol que deseas actualizar.');
  if (data.roles.some(row => _accessText_(row.rol_id) !== originalId &&
      _accessText_(row.nombre).toLowerCase() === name.toLowerCase())) {
    throw new Error('Ya existe un rol con ese nombre.');
  }
  if (action === 'edit' && !active && data.usuarioRol.some(item =>
      _accessText_(item.rol_id) === originalId && _accessIsActive_(item.active))) {
    throw new Error('No puedes desactivar un rol asignado a personas. Retira primero esas asignaciones.');
  }

  const nextRole = { rol_id: roleId, nombre: name, descripcion: description, active };
  const after = _accessCopyData_(data);
  if (action === 'edit') {
    const index = after.roles.findIndex(row => _accessText_(row.rol_id) === originalId);
    after.roles[index] = Object.assign({}, after.roles[index], nextRole);
  } else after.roles.push(nextRole);
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
    if (action === 'create') SUNARPCore.insertRecord(source, record, { idField: 'rol_id' });
    else {
      const updates = Object.assign({}, record);
      delete updates.rol_id;
      SUNARPCore.updateRecord(source, 'rol_id', originalId, updates);
    }
    return {
      value: { success: true, message: action === 'create' ? 'Rol creado correctamente.' : 'Rol actualizado correctamente.' },
      auditAfter: nextRole
    };
  });
}


function saveAccessPermission(payload) {
  const auth = _accessRequirePermission_('PERMISOS_ADMINISTRAR');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('No se recibieron los datos del permiso.');

  const action = _accessText_(payload.action).toLowerCase();
  const permissionId = _accessUpper_(payload.permiso_id || payload.permissionId);
  const code = _accessUpper_(payload.codigo || payload.code);
  const moduleId = _accessText_(payload.modulo_id || payload.moduleId);
  const operation = _accessUpper_(payload.operacion || payload.operation);
  const description = _accessText_(payload.descripcion || payload.description);
  const active = _accessNormalizeActive_(payload.active === undefined ? true : payload.active, 'El estado del permiso');

  if (!['create', 'edit'].includes(action)) throw new Error('La operación del permiso no es válida.');
  if (!/^[A-Z0-9_]{3,80}$/.test(code)) throw new Error('El código del permiso no tiene un formato válido.');
  if (!permissionId) throw new Error('Ingresa el ID del permiso.');
  if (!moduleId || !operation || !description) throw new Error('Completa modulo_id, operación y descripción del permiso.');

  const data = _accessLoadSecurityData_();
  const module = data.modulos.find(item => _accessText_(item.modulo_id) === moduleId && _accessIsActive_(item.active));
  if (!module) throw new Error('El módulo no existe o está inactivo.');

  const existing = _accessFindBy_(data.permisos, 'permiso_id', permissionId);
  if (action === 'create' && existing) throw new Error('Ya existe un permiso con ese ID.');
  if (action === 'edit' && !existing) throw new Error('No se encontró el permiso que deseas actualizar.');
  if (existing && code !== _accessUpper_(existing.codigo)) throw new Error('El código de un permiso existente es inmutable.');
  if (existing && moduleId !== _accessText_(existing.modulo_id)) throw new Error('El modulo_id de un permiso existente es inmutable. Crea otro permiso y reasigna sus relaciones.');
  if (data.permisos.some(row => _accessUpper_(row.codigo) === code && _accessText_(row.permiso_id) !== permissionId)) {
    throw new Error('Ya existe un permiso con ese código.');
  }

  const nextPermission = { permiso_id: permissionId, codigo: code, modulo_id: moduleId, operacion: operation, descripcion: description, active };
  const after = _accessCopyData_(data);
  if (action === 'edit') {
    const index = after.permisos.findIndex(row => _accessText_(row.permiso_id) === permissionId);
    after.permisos[index] = Object.assign({}, after.permisos[index], nextPermission);
  } else after.permisos.push(nextPermission);
  _accessAssertAdministratorContinuity_(data, after);

  return _accessRunAudited_(auth, {
    accion: action === 'create' ? 'CREAR_PERMISO' : 'EDITAR_PERMISO',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'PERMISO',
    registro_id: permissionId,
    registro_nombre: code,
    detalle: 'Administración de permiso.',
    datos_antes: existing || null
  }, () => {
    const sheet = ACCESS_MANAGEMENT_CONFIG.sheets.permissions;
    const source = _accessSecuritySource_(sheet);
    const record = _accessFilterPayload_(sheet, nextPermission, [
      'permiso_id', 'codigo', 'modulo_id', 'operacion', 'descripcion', 'active'
    ]);
    if (action === 'create') SUNARPCore.insertRecord(source, record, { idField: 'permiso_id' });
    else {
      const updates = Object.assign({}, record);
      delete updates.permiso_id;
      SUNARPCore.updateRecord(source, 'permiso_id', permissionId, updates);
    }
    return {
      value: { success: true, message: action === 'create' ? 'Permiso creado correctamente.' : 'Permiso actualizado correctamente.' },
      auditAfter: nextPermission
    };
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
  const data = _accessLoadSecurityData_();
  const role = data.roles.find(row => _accessText_(row.rol_id) === roleId && _accessIsActive_(row.active));
  if (!role) throw new Error('El rol no existe o está inactivo.');

  const activePermissionIds = new Set(data.permisos.filter(row => _accessIsActive_(row.active)).map(row => _accessText_(row.permiso_id)));
  const invalid = permissionIds.filter(id => !activePermissionIds.has(id));
  if (invalid.length) throw new Error('Hay permisos inexistentes o inactivos: ' + invalid.join(', ') + '.');

  const after = _accessCopyData_(data);
  after.rolPermiso = after.rolPermiso.filter(row => _accessText_(row.rol_id) !== roleId);
  permissionIds.forEach(id => after.rolPermiso.push({ rol_id: roleId, permiso_id: id, active: true }));
  _accessAssertAdministratorContinuity_(data, after);

  return _accessRunAudited_(auth, {
    accion: 'ACTUALIZAR_ASIGNACION_PERMISOS',
    modulo: ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses,
    tipo_entidad: 'ROL_PERMISO',
    registro_id: roleId,
    registro_nombre: _accessText_(role.nombre),
    detalle: 'Actualización de permisos asignados al rol.',
    datos_antes: data.rolPermiso.filter(row => _accessText_(row.rol_id) === roleId)
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

  const data = _accessLoadSecurityData_();
  const user = data.usuarios.find(row =>
    _accessText_(row.persona_id) === personaId && _accessIsActive_(row.active)
  );
  if (!user) throw new Error('La persona no tiene una cuenta activa.');

  const userRole = data.usuarioRol.find(row =>
    _accessText_(row.persona_id) === personaId &&
    _accessText_(row.modulo_id) === moduleId &&
    _accessIsActive_(row.active)
  );
  if (!userRole) throw new Error('La persona debe tener un rol activo en el módulo antes de asignarle ámbitos.');

  const module = data.modulos.find(row =>
    _accessText_(row.modulo_id) === moduleId && _accessIsActive_(row.active)
  );
  if (!module) throw new Error('El módulo no existe o está inactivo.');

  const catalogs = _accessOrgCatalog_();
  const structures = catalogs.estructuraOrg || [];
  const sites = catalogs.sedes || [];
  const locals = catalogs.locales || [];

  const normalized = scopesInput.map(item => {
    const type = _accessUpper_(item.tipo_ambito || item.scopeType);
    const referenceId = _accessText_(item.referencia_id || item.referenceId);
    const includeInput = item.incluir_descendientes !== undefined
      ? item.incluir_descendientes
      : item.includeDescendants;

    if (!['TOTAL', 'SEDE', 'ESTRUCTURA_ORG', 'LOCAL'].includes(type)) {
      throw new Error('Tipo de ámbito no válido: ' + (type || '(vacío)') + '.');
    }

    if (type === 'TOTAL') {
      if (referenceId) throw new Error('Un ámbito TOTAL debe tener referencia_id vacío.');
      return { tipo_ambito: type, referencia_id: '', incluir_descendientes: 'NO', _siteId: '' };
    }

    if (!referenceId) throw new Error('El ámbito ' + type + ' requiere una referencia.');

    if (type === 'SEDE') {
      const site = _accessFindBy_(sites, 'id', referenceId);
      if (!site || !_accessCatalogIsActive_(site)) throw new Error('La sede "' + referenceId + '" no existe o está inactiva.');
      return { tipo_ambito: type, referencia_id: referenceId, incluir_descendientes: 'NO', _siteId: referenceId };
    }

    if (type === 'ESTRUCTURA_ORG') {
      const structure = _accessFindBy_(structures, 'id', referenceId);
      if (!structure || !_accessCatalogIsActive_(structure)) throw new Error('La estructura orgánica "' + referenceId + '" no existe o está inactiva.');
      const descendants = includeInput === true ||
        _accessUpper_(includeInput) === 'SI' ||
        _accessUpper_(includeInput) === 'SÍ' ||
        _accessUpper_(includeInput) === 'TRUE';
      return {
        tipo_ambito: type,
        referencia_id: referenceId,
        incluir_descendientes: descendants ? 'SI' : 'NO',
        _siteId: _accessText_(structure.sede_id)
      };
    }

    const local = _accessFindBy_(locals, 'id', referenceId);
    if (!local || !_accessCatalogIsActive_(local)) throw new Error('El local "' + referenceId + '" no existe o está inactivo.');
    return {
      tipo_ambito: 'LOCAL',
      referencia_id: referenceId,
      incluir_descendientes: 'NO',
      _siteId: _accessText_(local.sede_id)
    };
  });

  if (normalized.some(item => item.tipo_ambito === 'TOTAL') && normalized.length > 1) {
    throw new Error('TOTAL es exclusivo dentro del mismo módulo.');
  }

  const seen = new Set();
  normalized.forEach(item => {
    const key = item.tipo_ambito + '\\u0000' + item.referencia_id;
    if (seen.has(key)) throw new Error('Has seleccionado un ámbito duplicado.');
    seen.add(key);
  });

  // Los ámbitos específicos se restringen a una sola sede en todos los módulos.
  // TOTAL solo es exclusivo dentro del módulo al que pertenece.
  const siteIds = new Set();
  const existingSpecific = data.ambitosAcceso.filter(scope =>
    _accessText_(scope.persona_id) === personaId &&
    _accessText_(scope.modulo_id) !== moduleId &&
    _accessIsActive_(scope.active) &&
    _accessUpper_(scope.tipo_ambito) !== 'TOTAL'
  );

  existingSpecific.forEach(scope => {
    const type = _accessUpper_(scope.tipo_ambito);
    const refId = _accessText_(scope.referencia_id);
    let siteId = '';
    if (type === 'SEDE') siteId = refId;
    if (type === 'ESTRUCTURA_ORG') {
      const structure = _accessFindBy_(structures, 'id', refId);
      siteId = structure ? _accessText_(structure.sede_id) : '';
    }
    if (type === 'LOCAL') {
      const local = _accessFindBy_(locals, 'id', refId);
      siteId = local ? _accessText_(local.sede_id) : '';
    }
    if (!siteId) throw new Error('Existe un ámbito específico previo con referencia inválida. Corrige ese ámbito antes de continuar.');
    siteIds.add(siteId);
  });

  normalized.forEach(scope => {
    if (scope.tipo_ambito !== 'TOTAL') {
      if (!scope._siteId) throw new Error('No se pudo determinar la sede del ámbito.');
      siteIds.add(scope._siteId);
    }
  });

  if (siteIds.size > 1) {
    throw new Error('Los ámbitos específicos de una persona deben pertenecer a una sola sede, aunque correspondan a módulos distintos.');
  }

  const recordsToSync = normalized.map(scope => ({
    tipo_ambito: scope.tipo_ambito,
    referencia_id: scope.referencia_id,
    incluir_descendientes: scope.incluir_descendientes
  }));

  const before = data.ambitosAcceso.filter(row =>
    _accessText_(row.persona_id) === personaId &&
    _accessText_(row.modulo_id) === moduleId
  );
  const person = _accessFindBy_(data.personas, 'persona_id', personaId);

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
      ['tipo_ambito', 'referencia_id'],
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


function getAccessManagementData() {
  const auth = _accessGetAuthContext_();
  const accessModuleId = _accessResolveModuleId_(auth, ACCESS_MANAGEMENT_CONFIG.moduleCodes.accesses);

  if (!_accessIsGlobalAdministrator_(auth)) {
    throw new Error('La administración de accesos requiere ROL_ADMIN y ámbito TOTAL en el módulo ACCESOS.');
  }

  const capabilities = {
    users: _accessHasPermission_(auth, 'USUARIOS_ADMINISTRAR', accessModuleId),
    roles: _accessHasPermission_(auth, 'ROLES_ADMINISTRAR', accessModuleId),
    permissions: _accessHasPermission_(auth, 'PERMISOS_ADMINISTRAR', accessModuleId),
    scopes: _accessHasPermission_(auth, 'AMBITOS_ACCESO_ADMINISTRAR', accessModuleId),
    audit: _accessHasPermission_(auth, 'AUDITORIA_VER', accessModuleId)
  };
  capabilities.assignments = capabilities.roles && capabilities.permissions;
  capabilities.userRoles = capabilities.users && capabilities.roles;

  if (!Object.values(capabilities).some(Boolean)) {
    throw new Error('Tu cuenta no tiene capacidades de administración de accesos.');
  }

  const data = _accessLoadSecurityData_();
  const needsCatalogs = capabilities.users || capabilities.scopes;
  const catalogs = needsCatalogs
    ? _accessOrgCatalog_()
    : { sedes: [], estructuraOrg: [], locales: [] };

  const personById = new Map(data.personas.map(person => [
    _accessText_(person.persona_id),
    person
  ]));

  const userRolesByPerson = new Map();
  data.usuarioRol.forEach(assignment => {
    const personaId = _accessText_(assignment.persona_id);
    if (!userRolesByPerson.has(personaId)) userRolesByPerson.set(personaId, []);
    userRolesByPerson.get(personaId).push(assignment);
  });

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

    users: capabilities.users || capabilities.scopes || capabilities.userRoles
      ? data.usuarios.map(user => {
          const person = personById.get(_accessText_(user.persona_id)) || {};
          return {
            persona_id: _accessText_(user.persona_id),
            correo_institucional: _accessText_(person.correo_institucional),
            nombres: _accessText_(person.nombres),
            apellidos: _accessText_(person.apellidos),
            nombre_completo: [_accessText_(person.nombres), _accessText_(person.apellidos)].filter(Boolean).join(' '),
            active: _accessIsActive_(user.active),
            roles: (userRolesByPerson.get(_accessText_(user.persona_id)) || [])
              .filter(item => _accessIsActive_(item.active))
              .map(item => ({ modulo_id: _accessText_(item.modulo_id), rol_id: _accessText_(item.rol_id) }))
          };
        })
      : [],

    availablePeople: capabilities.users
      ? data.personas.filter(person =>
          _accessText_(person.correo_institucional) &&
          !data.usuarios.some(user => _accessText_(user.persona_id) === _accessText_(person.persona_id))
        ).map(person => ({
          persona_id: _accessText_(person.persona_id),
          correo_institucional: _accessText_(person.correo_institucional),
          nombres: _accessText_(person.nombres),
          apellidos: _accessText_(person.apellidos),
          nombre_completo: [_accessText_(person.nombres), _accessText_(person.apellidos)].filter(Boolean).join(' ')
        }))
      : [],

    modules: capabilities.permissions || capabilities.scopes || capabilities.userRoles
      ? data.modulos.map(module => ({
          modulo_id: _accessText_(module.modulo_id),
          codigo: _accessUpper_(module.codigo),
          nombre: _accessText_(module.nombre),
          descripcion: _accessText_(module.descripcion),
          active: _accessIsActive_(module.active)
        }))
      : [],

    roles: capabilities.roles || capabilities.users
      ? data.roles.map(role => ({
          rol_id: _accessText_(role.rol_id),
          nombre: _accessText_(role.nombre),
          descripcion: _accessText_(role.descripcion),
          active: _accessIsActive_(role.active)
        }))
      : [],

    permissions: capabilities.permissions
      ? data.permisos.map(permission => {
          const module = data.modulos.find(item => _accessText_(item.modulo_id) === _accessText_(permission.modulo_id)) || {};
          return {
            permiso_id: _accessText_(permission.permiso_id),
            codigo: _accessUpper_(permission.codigo),
            modulo_id: _accessText_(permission.modulo_id),
            modulo_codigo: _accessUpper_(module.codigo),
            modulo_nombre: _accessText_(module.nombre),
            operacion: _accessUpper_(permission.operacion),
            descripcion: _accessText_(permission.descripcion),
            active: _accessIsActive_(permission.active)
          };
        })
      : [],

    rolePermissions: capabilities.assignments
      ? data.rolPermiso.map(item => ({
          rol_id: _accessText_(item.rol_id),
          permiso_id: _accessText_(item.permiso_id),
          active: _accessIsActive_(item.active)
        }))
      : [],

    userRoles: capabilities.userRoles
      ? data.usuarioRol.map(item => ({
          persona_id: _accessText_(item.persona_id),
          modulo_id: _accessText_(item.modulo_id),
          rol_id: _accessText_(item.rol_id),
          active: _accessIsActive_(item.active)
        }))
      : [],

    scopes: capabilities.scopes
      ? data.ambitosAcceso.map(item => ({
          persona_id: _accessText_(item.persona_id),
          modulo_id: _accessText_(item.modulo_id),
          tipo_ambito: _accessUpper_(item.tipo_ambito),
          referencia_id: _accessText_(item.referencia_id),
          incluir_descendientes: _accessText_(item.incluir_descendientes),
          active: _accessIsActive_(item.active)
        }))
      : [],

    catalogs: {
      sedes: (catalogs.sedes || []).filter(_accessCatalogIsActive_)
        .map(row => ({ id: _accessText_(row.id), name: _accessText_(row.name) })),
      estructuraOrg: (catalogs.estructuraOrg || []).filter(_accessCatalogIsActive_)
        .map(row => ({
          id: _accessText_(row.id),
          sede_id: _accessText_(row.sede_id),
          parent_id: _accessText_(row.parent_id),
          name: _accessText_(row.name),
          order: row.order
        })),
      locales: (catalogs.locales || []).filter(_accessCatalogIsActive_)
        .map(row => ({ id: _accessText_(row.id), name: _accessText_(row.name), sede_id: _accessText_(row.sede_id) }))
    }
  };
}


function getAccessAuditHistory(filters) {
  _accessRequirePermission_('AUDITORIA_VER');

  filters = filters && typeof filters === 'object'
    ? filters
    : {};

  const source = _accessSecuritySource_(
    ACCESS_MANAGEMENT_CONFIG.sheets.audit
  );

  const result = SUNARPCore.listRecords(source, {
    sortBy: 'fecha_hora',
    sortDirection: 'desc'
  });

  const actor = _accessText_(
    filters.actor || filters.actorEmail
  ).toLowerCase();

  const moduleCode = _accessUpper_(
    filters.modulo || filters.module
  );

  const action = _accessUpper_(
    filters.accion || filters.action
  );

  const outcome = _accessUpper_(
    filters.resultado || filters.result
  );

  const recordId = _accessText_(
    filters.registro_id || filters.recordId
  ).toLowerCase();

  const query = _accessText_(
    filters.search || filters.query
  ).toLocaleLowerCase();

  const from = _accessText_(
    filters.desde || filters.from
  );

  const to = _accessText_(
    filters.hasta || filters.to
  );

  let records = result.records.filter(row => {
    if (
      actor &&
      !_accessText_(row.actor_correo).toLowerCase().includes(actor)
    ) {
      return false;
    }

    if (
      moduleCode &&
      _accessUpper_(row.modulo) !== moduleCode
    ) {
      return false;
    }

    if (
      action &&
      _accessUpper_(row.accion) !== action
    ) {
      return false;
    }

    if (
      outcome &&
      _accessUpper_(row.resultado) !== outcome
    ) {
      return false;
    }

    if (
      recordId &&
      !_accessText_(row.registro_id).toLowerCase().includes(recordId)
    ) {
      return false;
    }

    if (from || to) {
      const date = row.fecha_hora instanceof Date
        ? row.fecha_hora
        : new Date(row.fecha_hora);

      if (Number.isNaN(date.getTime())) {
        return false;
      }

      if (from && date < new Date(`${from}T00:00:00`)) {
        return false;
      }

      if (to && date > new Date(`${to}T23:59:59`)) {
        return false;
      }
    }

    if (query) {
      const haystack = [
        row.actor_correo,
        row.actor_nombre,
        row.accion,
        row.modulo,
        row.tipo_entidad,
        row.registro_id,
        row.registro_nombre,
        row.resultado,
        row.detalle
      ]
        .map(_accessText_)
        .join(' ')
        .toLocaleLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });

  const total = records.length;

  const page = Math.max(
    1,
    Number.parseInt(filters.page, 10) || 1
  );

  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(filters.pageSize, 10) || 25
    )
  );

  const offset = (page - 1) * pageSize;

  records = records.slice(
    offset,
    offset + pageSize
  );

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

    totalPages: Math.max(
      1,
      Math.ceil(total / pageSize)
    )
  };
}

/**
 * Convierte el contenido JSON de un evento de auditoría
 * en un valor utilizable para buscar sus relaciones.
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
    throw new Error(
      'Debes indicar el tipo y el identificador del registro.'
    );
  }

  const relatedTypes = {
    USUARIO: ['USUARIO', 'AMBITO_ACCESO'],
    ROL: ['ROL', 'ROL_PERMISO'],
    PERMISO: ['PERMISO', 'ROL_PERMISO'],
    SERVIDOR: ['SERVIDOR']
  };

  if (!relatedTypes[entityType]) {
    throw new Error(
      `No está habilitada la consulta de historial para "${entityType}".`
    );
  }

  const source = _accessSecuritySource_(
    ACCESS_MANAGEMENT_CONFIG.sheets.audit
  );

  const result = SUNARPCore.listRecords(source, {
    sortBy: 'fecha_hora',
    sortDirection: 'desc'
  });

  let records = result.records.filter(event => {
    const eventType = _accessUpper_(event.tipo_entidad);
    const eventId = _accessText_(event.registro_id);
    const eventModule = _accessUpper_(event.modulo);

    // Conserva la consulta de eventos históricos DIRECTORIOS y admite
    // los nuevos eventos del módulo INFORMACION_PERSONAL.
    if (
      entityType === 'SERVIDOR' &&
      !['DIRECTORIOS', 'INFORMACION_PERSONAL'].includes(eventModule)
    ) {
      return false;
    }

    // Coincidencia directa por tipo e identificador.
    if (
      relatedTypes[entityType].includes(eventType) &&
      eventId === recordId
    ) {
      return true;
    }

    // Las asignaciones de permisos guardan el rol
    // como registro_id. Se comprueba el permiso dentro
    // de los datos anteriores y posteriores.
    if (
      entityType === 'PERMISO' &&
      eventType === 'ROL_PERMISO'
    ) {
      return _accessAuditContainsPermission_(
        event,
        recordId
      );
    }

    return false;
  });

  const total = records.length;

  const page = Math.max(
    1,
    Number.parseInt(payload.page, 10) || 1
  );

  const pageSize = Math.min(
    100,
    Math.max(
      1,
      Number.parseInt(payload.pageSize, 10) || 20
    )
  );

  const offset = (page - 1) * pageSize;

  records = records.slice(
    offset,
    offset + pageSize
  );

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
        ambito_referencia_id: _accessText_(
          event.ambito_referencia_id
        )
      };
    }),

    total,
    page,
    pageSize,

    totalPages: Math.max(
      1,
      Math.ceil(total / pageSize)
    )
  };
}

/**
 * Cambia el estado de un registro de seguridad.
 * Utiliza baja lógica y registra la operación en Auditoria.
 */
function _accessChangeStatus_(config) {
  const auth = _accessRequirePermission_(config.permission);
  const nextActive = _accessNormalizeActive_(config.active, 'El estado solicitado');
  const data = _accessLoadSecurityData_();
  const record = _accessFindBy_(data[config.collection], config.keyField, config.id);
  if (!record) throw new Error('No se encontró el registro "' + config.id + '".');

  const currentActive = _accessIsActive_(record.active);
  if (currentActive === nextActive) {
    return { success: true, message: 'El registro ya se encuentra ' + (nextActive ? 'activo' : 'inactivo') + '.' };
  }

  if (config.collection === 'usuarios' && !nextActive &&
      _accessText_(record.persona_id) === _accessText_(auth.personaId)) {
    throw new Error('No puedes desactivar tu propia cuenta.');
  }

  if (config.collection === 'roles' && !nextActive) {
    const assignments = data.usuarioRol.filter(item =>
      _accessText_(item.rol_id) === _accessText_(record.rol_id) && _accessIsActive_(item.active)
    );
    if (assignments.length) throw new Error('No puedes desactivar un rol que tiene asignaciones activas.');
  }

  const after = _accessCopyData_(data);
  const afterRecord = _accessFindBy_(after[config.collection], config.keyField, config.id);
  afterRecord.active = nextActive;
  _accessAssertAdministratorContinuity_(data, after);

  const person = config.collection === 'usuarios'
    ? _accessFindBy_(data.personas, 'persona_id', record.persona_id)
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


