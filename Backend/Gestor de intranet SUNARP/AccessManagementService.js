/**
 * GESTOR DE INTRANET SUNARP
 * Servicio: Administración de accesos.
 *
 * Hojas: Usuarios, Roles, Permisos, RolPermiso, AmbitosAcceso y Auditoria.
 * Los catálogos sede y estructura_org se leen desde las pestañas espejo
 * Sedes y EstructuraOrg de la fuente SECURITY (IMPORTRANGE de MASTER_DATA).
 * Las escrituras de datos se delegan a SUNARP Core.
 */

const ACCESS_MANAGEMENT_CONFIG = Object.freeze({
  sourceKey: 'SECURITY',

  sheets: Object.freeze({
    users: 'Usuarios',
    roles: 'Roles',
    permissions: 'Permisos',
    rolePermissions: 'RolPermiso',
    scopes: 'AmbitosAcceso',
    audit: 'Auditoria'
  }),

  statusActive: 'ACTIVO',
  statusInactive: 'INACTIVO',

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
  users: Object.freeze([
    'correo_institucional',
    'nombres',
    'apellidos',
    'estado',
    'rol_id',
    'estructura_org_id'
  ]),

  roles: Object.freeze([
    'rol_id',
    'nombre',
    'descripcion',
    'estado'
  ]),

  permissions: Object.freeze([
    'permiso_id',
    'codigo',
    'modulo',
    'operacion',
    'descripcion',
    'estado'
  ]),

  rolePermissions: Object.freeze([
    'rol_id',
    'permiso_id',
    'estado'
  ]),

  scopes: Object.freeze([
    'correo_institucional',
    'modulo',
    'tipo_ambito',
    'referencia_id',
    'incluir_descendientes',
    'estado'
  ]),

  audit: Object.freeze([
    'evento_id',
    'fecha_hora',
    'actor_correo',
    'actor_nombre',
    'accion',
    'modulo',
    'tipo_entidad',
    'registro_id',
    'registro_nombre',
    'resultado',
    'detalle',
    'datos_antes',
    'datos_despues',
    'ambito_modulo',
    'ambito_tipo',
    'ambito_referencia_id'
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
  return [
    'ACTIVO',
    'ACTIVE',
    'TRUE',
    'VERDADERO',
    '1',
    'SI',
    'SÍ'
  ].includes(_accessUpper_(value));
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
    {
      key: 'usuarios',
      source: _accessSecuritySource_(s.users)
    },
    {
      key: 'roles',
      source: _accessSecuritySource_(s.roles)
    },
    {
      key: 'permisos',
      source: _accessSecuritySource_(s.permissions)
    },
    {
      key: 'rolPermiso',
      source: _accessSecuritySource_(s.rolePermissions)
    },
    {
      key: 'ambitosAcceso',
      source: _accessSecuritySource_(s.scopes)
    }
  ];

  const data = SUNARPCore.listRecordsFromSources(requests);

  _accessValidateHeaders_();
  _accessValidateSnapshot_(data);

  return data;
}


/**
 * Comprueba que existan los encabezados mínimos requeridos.
 */
function _accessValidateHeaders_() {
  const s = ACCESS_MANAGEMENT_CONFIG.sheets;
  const required = ACCESS_MANAGEMENT_FIELDS;

  const keys = [
    'users',
    'roles',
    'permissions',
    'rolePermissions',
    'scopes'
  ];

  keys.forEach(key => {
    const source = _accessSecuritySource_(s[key]);
    const info = SUNARPCore.getSourceInfo(source);

    const missing = required[key].filter(header =>
      !info.headers.includes(header)
    );

    if (missing.length) {
      throw new Error(
        `La pestaña "${s[key]}" no tiene los encabezados requeridos: ${missing.join(', ')}.`
      );
    }
  });
}


/**
 * Detecta claves duplicadas en los catálogos de seguridad.
 */
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
  _accessValidateUnique_(
    data.usuarios,
    ['correo_institucional'],
    'Usuarios'
  );

  _accessValidateUnique_(
    data.roles,
    ['rol_id'],
    'Roles'
  );

  _accessValidateUnique_(
    data.permisos,
    ['permiso_id'],
    'Permisos'
  );

  _accessValidateUnique_(
    data.permisos,
    ['codigo'],
    'Permisos.codigo'
  );

  _accessValidateUnique_(
    data.rolPermiso,
    ['rol_id', 'permiso_id'],
    'RolPermiso'
  );

  _accessValidateUnique_(
    data.ambitosAcceso,
    [
      'correo_institucional',
      'modulo',
      'tipo_ambito',
      'referencia_id'
    ],
    'AmbitosAcceso'
  );

  const roleIds = new Set(
    data.roles.map(row => _accessText_(row.rol_id))
  );

  const permissionIds = new Set(
    data.permisos.map(row => _accessText_(row.permiso_id))
  );

  data.usuarios.forEach(user => {
    if (
      _accessText_(user.rol_id) &&
      !roleIds.has(_accessText_(user.rol_id))
    ) {
      throw new Error(
        `El usuario ${user.correo_institucional} referencia un rol inexistente.`
      );
    }
  });

  data.rolPermiso.forEach(item => {
    if (!roleIds.has(_accessText_(item.rol_id))) {
      throw new Error(
        `RolPermiso referencia el rol inexistente ${item.rol_id}.`
      );
    }

    if (!permissionIds.has(_accessText_(item.permiso_id))) {
      throw new Error(
        `RolPermiso referencia el permiso inexistente ${item.permiso_id}.`
      );
    }
  });
}


/**
 * Lee los catálogos espejo de Global parameters.
 * No consulta Directorios telefónicos para estos datos.
 */
function _accessOrgCatalog_() {
  const requests = [
    {
      key: 'sedes',
      source: getIntranetDataSource('SECURITY', 'Sedes', 1)
    },
    {
      key: 'estructuraOrg',
      source: getIntranetDataSource('SECURITY', 'EstructuraOrg', 1)
    }
  ];

  return SUNARPCore.listRecordsFromSources(requests);
}


/**
 * Obtiene la identidad y resuelve su contexto de autorización.
 */
function _accessGetAuthContext_() {
  const email = SUNARPCore.getCurrentUserEmail();

  if (!email) {
    throw new Error(
      'No se pudo identificar tu cuenta institucional. Verifica la implementación de la aplicación web.'
    );
  }

  const data = _accessLoadSecurityData_();

  const context = SUNARPCore.resolveAuthorizationContext({
    email,
    users: data.usuarios,
    roles: data.roles,
    permissions: data.permisos,
    rolePermissions: data.rolPermiso,
    scopes: data.ambitosAcceso
  });

  if (!context.authenticated) {
    _accessWriteAudit_(
      {
        email,
        name: ''
      },
      {
        accion: 'AUTENTICACION_DENEGADA',
        modulo: 'ACCESOS',
        tipo_entidad: 'USUARIO',
        registro_id: email,
        registro_nombre: email,
        resultado: 'DENEGADO',
        detalle: 'La cuenta no está registrada como usuario activo o no tiene un rol activo.'
      }
    );

    throw new Error(
      'Tu cuenta no está habilitada para utilizar el gestor de intranet.'
    );
  }

  const user = context.user;

  const name = [
    user.nombres,
    user.apellidos
  ]
    .map(_accessText_)
    .filter(Boolean)
    .join(' ');

  return Object.assign({}, context, {
    name,
    roleId: _accessText_(user.rol_id),
    roleName: _accessText_(context.role.nombre),
    structureOrgId: _accessText_(user.estructura_org_id)
  });
}


/**
 * Contexto de autenticación reutilizable dentro de la aplicación.
 */
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
function _accessRequirePermission_(permissionCode, moduleCode, record) {
  const auth = _accessGetAuthContext_();
  const code = _accessUpper_(permissionCode);

  if (!SUNARPCore.authorizationHasPermission(auth, code)) {
    _accessWriteAudit_(auth, {
      accion: 'AUTORIZACION_DENEGADA',
      modulo: moduleCode || 'ACCESOS',
      tipo_entidad: 'PERMISO',
      registro_id: code,
      registro_nombre: code,
      resultado: 'DENEGADO',
      detalle: `La cuenta no tiene el permiso ${code}.`
    });

    throw new Error(
      'No tienes autorización para realizar esta operación.'
    );
  }

  if (moduleCode && record) {
    const catalogs = _accessOrgCatalog_();

    const allowed = SUNARPCore.authorizationIsRecordInScope(
      auth,
      moduleCode,
      record,
      catalogs.estructuraOrg
    );

    if (!allowed) {
      _accessWriteAudit_(auth, {
        accion: 'AUTORIZACION_DENEGADA',
        modulo: moduleCode,
        tipo_entidad: 'REGISTRO',
        registro_id: _accessText_(record.id),
        registro_nombre: _accessText_(record.nombre),
        resultado: 'DENEGADO',
        detalle: 'El registro se encuentra fuera de los ámbitos de acceso asignados.'
      });

      throw new Error(
        'No tienes ámbito de acceso para operar sobre este registro.'
      );
    }
  }

  return auth;
}


/**
 * Función pública para que otros servicios de la aplicación
 * comprueben permisos y ámbitos.
 */
function requirePermission_(permissionCode, moduleCode, record) {
  return _accessRequirePermission_(
    permissionCode,
    moduleCode,
    record
  );
}


function _accessRecordIsAllowed_(auth, moduleCode, record, structures) {
  return SUNARPCore.authorizationIsRecordInScope(
    auth,
    moduleCode,
    record,
    structures || []
  );
}


/**
 * Comprueba si un rol tiene al menos una capacidad privilegiada.
 */
function _accessRoleHasPrivilegedPermissions_(data, roleId) {
  const privilegedCodes = new Set(
    ACCESS_MANAGEMENT_CONFIG.privilegedRolePermissionCodes
  );

  const permissionCodesById = new Map(
    data.permisos
      .filter(permission => _accessIsActive_(permission.estado))
      .map(permission => [
        _accessText_(permission.permiso_id),
        _accessUpper_(permission.codigo)
      ])
  );

  return data.rolPermiso.some(assignment => {
    if (
      !_accessIsActive_(assignment.estado) ||
      _accessText_(assignment.rol_id) !== _accessText_(roleId)
    ) {
      return false;
    }

    return privilegedCodes.has(
      permissionCodesById.get(
        _accessText_(assignment.permiso_id)
      )
    );
  });
}


/**
 * Cuenta los usuarios activos cuyo rol conserva todos
 * los permisos administrativos requeridos.
 */
function _accessCountAdministrators_(data) {
  const activeRoles = new Set(
    data.roles
      .filter(row => _accessIsActive_(row.estado))
      .map(row => _accessText_(row.rol_id))
  );

  const activePermissionsById = new Map(
    data.permisos
      .filter(row => _accessIsActive_(row.estado))
      .map(row => [
        _accessText_(row.permiso_id),
        _accessUpper_(row.codigo)
      ])
  );

  const codesByRole = new Map();

  data.rolPermiso.forEach(item => {
    if (!_accessIsActive_(item.estado)) return;

    const roleId = _accessText_(item.rol_id);

    const code = activePermissionsById.get(
      _accessText_(item.permiso_id)
    );

    if (!code || !activeRoles.has(roleId)) return;

    if (!codesByRole.has(roleId)) {
      codesByRole.set(roleId, new Set());
    }

    codesByRole.get(roleId).add(code);
  });

  return data.usuarios.filter(user => {
    if (!_accessIsActive_(user.estado)) return false;

    const roleId = _accessText_(user.rol_id);

    if (!activeRoles.has(roleId)) return false;

    const codes = codesByRole.get(roleId) || new Set();

    return ACCESS_MANAGEMENT_CONFIG.adminPermissionCodes.every(
      code => codes.has(code)
    );
  }).length;
}


/**
 * Impide que una operación elimine al último administrador de seguridad.
 */
function _accessAssertAdministratorContinuity_(before, after) {
  const currentCount = _accessCountAdministrators_(before);
  const nextCount = _accessCountAdministrators_(after);

  if (currentCount > 0 && nextCount === 0) {
    throw new Error(
      'La operación dejaría el gestor sin administradores de seguridad activos. Conserva al menos una cuenta con todos los permisos administrativos.'
    );
  }
}


/**
 * Copia las colecciones de seguridad para simular el estado posterior
 * antes de aplicar una modificación.
 */
function _accessCopyData_(data) {
  return {
    usuarios: data.usuarios.map(row => Object.assign({}, row)),
    roles: data.roles.map(row => Object.assign({}, row)),
    permisos: data.permisos.map(row => Object.assign({}, row)),
    rolPermiso: data.rolPermiso.map(row => Object.assign({}, row)),
    ambitosAcceso: data.ambitosAcceso.map(row => Object.assign({}, row))
  };
}


/**
 * Devuelve metadatos de una pestaña de seguridad.
 */
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

  if (!structure || !_accessIsActive_(structure.active)) {
    throw new Error(
      'La unidad orgánica seleccionada no existe o está inactiva en Global parameters.'
    );
  }
}

/**
 * Crea o actualiza un usuario.
 */
function _accessRecordUser_(auth, payload, action) {
  const source = _accessSecuritySource_(
    ACCESS_MANAGEMENT_CONFIG.sheets.users
  );

  const email = _accessText_(
    payload.correo_institucional
  ).toLowerCase();

  const names = _accessText_(payload.nombres);
  const surnames = _accessText_(payload.apellidos);
  const roleId = _accessText_(payload.rol_id).toUpperCase();
  const status = _accessUpper_(payload.estado);
  const structureId = _accessText_(payload.estructura_org_id);

  const originalEmail = _accessText_(
    payload.correo_original ||
    payload.originalEmail ||
    email
  ).toLowerCase();

  _accessValidateEmail_(email);

  if (!names) {
    throw new Error('Ingresa los nombres del usuario.');
  }

  if (!roleId) {
    throw new Error('Selecciona un rol.');
  }

  if (!['ACTIVO', 'INACTIVO'].includes(status)) {
    throw new Error('El estado del usuario no es válido.');
  }

  if (
    email === _accessText_(auth.email).toLowerCase() &&
    status === 'INACTIVO'
  ) {
    throw new Error(
      'No puedes desactivar tu propia cuenta mientras administras el gestor.'
    );
  }

  const data = _accessLoadSecurityData_();

  const role = data.roles.find(row =>
    _accessText_(row.rol_id) === roleId &&
    _accessIsActive_(row.estado)
  );

  if (!role) {
    throw new Error('El rol seleccionado no existe o está inactivo.');
  }

  if (
    _accessRoleHasPrivilegedPermissions_(data, roleId) &&
    !SUNARPCore.authorizationHasPermission(auth, 'ROLES_ADMINISTRAR')
  ) {
    throw new Error(
      'Para asignar un rol con capacidades de administración o auditoría también necesitas el permiso ROLES_ADMINISTRAR.'
    );
  }

  const catalogs = _accessOrgCatalog_();

  _accessValidateOrgStructure_(
    structureId,
    catalogs
  );

  const existing = _accessFindBy_(
    data.usuarios,
    'correo_institucional',
    originalEmail
  );

  const existingEmailKey = existing
    ? _accessText_(existing.correo_institucional)
    : originalEmail;

  if (
    action === 'create' &&
    _accessFindBy_(data.usuarios, 'correo_institucional', email)
  ) {
    throw new Error(
      'Ya existe un usuario registrado con ese correo institucional.'
    );
  }

  if (action === 'edit' && !existing) {
    throw new Error(
      'No se encontró el usuario que deseas actualizar.'
    );
  }

  if (action === 'edit' && email !== originalEmail) {
    throw new Error(
      'El correo institucional es la clave de la cuenta y no puede modificarse. Registra una nueva cuenta, reasigna sus ámbitos y luego desactiva la anterior.'
    );
  }

  const after = _accessCopyData_(data);

  const afterUser = {
    correo_institucional: email,
    nombres: names,
    apellidos: surnames,
    estado: status,
    rol_id: roleId,
    estructura_org_id: structureId
  };

  if (action === 'edit') {
    const index = after.usuarios.findIndex(row =>
      _accessText_(row.correo_institucional).toLowerCase() === originalEmail
    );

    after.usuarios[index] = Object.assign(
      {},
      after.usuarios[index],
      afterUser
    );

  } else {
    after.usuarios.push(afterUser);
  }

  _accessAssertAdministratorContinuity_(
    data,
    after
  );

  const event = {
    accion: action === 'create'
      ? 'CREAR_USUARIO'
      : 'EDITAR_USUARIO',

    modulo: 'ACCESOS',
    tipo_entidad: 'USUARIO',
    registro_id: email,

    registro_nombre: [
      names,
      surnames
    ].filter(Boolean).join(' '),

    detalle: 'Administración de cuenta institucional.',
    datos_antes: existing || null
  };

  return _accessRunAudited_(auth, event, () => {
    const payloadRecord = _accessAddMetadata_(
      ACCESS_MANAGEMENT_CONFIG.sheets.users,
      afterUser,
      action === 'create',
      auth
    );

    let result;

    if (action === 'create') {
      result = SUNARPCore.insertRecord(
        source,
        payloadRecord,
        {
          idField: 'correo_institucional'
        }
      );

    } else {
      const updates = Object.assign({}, payloadRecord);

      delete updates.correo_institucional;

      result = SUNARPCore.updateRecord(
        source,
        'correo_institucional',
        existingEmailKey,
        updates
      );
    }

    return {
      value: {
        success: true,
        message: action === 'create'
          ? 'Usuario registrado correctamente.'
          : 'Usuario actualizado correctamente.'
      },

      auditAfter: afterUser
    };
  });
}


/**
 * Punto de entrada para crear o editar usuarios.
 */
function saveAccessUser(payload) {
  const auth = _accessRequirePermission_(
    'USUARIOS_ADMINISTRAR'
  );

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error('No se recibieron los datos del usuario.');
  }

  const action = _accessText_(payload.action).toLowerCase();

  if (!['create', 'edit'].includes(action)) {
    throw new Error('La operación del usuario no es válida.');
  }

  return _accessRecordUser_(
    auth,
    payload,
    action
  );
}


/**
 * Crea o actualiza roles.
 */
function saveAccessRole(payload) {
  const auth = _accessRequirePermission_(
    'ROLES_ADMINISTRAR'
  );

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error('No se recibieron los datos del rol.');
  }

  const action = _accessText_(payload.action).toLowerCase();

  const roleId = _accessUpper_(
    payload.rol_id || payload.roleId
  );

  const name = _accessText_(
    payload.nombre || payload.name
  );

  const description = _accessText_(
    payload.descripcion || payload.description
  );

  const status = _accessUpper_(
    payload.estado || payload.status
  );

  const originalId = _accessUpper_(
    payload.rol_id_original ||
    payload.originalRoleId ||
    roleId
  );

  if (!['create', 'edit'].includes(action)) {
    throw new Error('La operación del rol no es válida.');
  }

  if (!/^[A-Z0-9_-]{2,50}$/.test(roleId)) {
    throw new Error(
      'El ID del rol solo admite letras, números, guion y guion bajo.'
    );
  }

  if (!name) {
    throw new Error('Ingresa el nombre del rol.');
  }

  if (!['ACTIVO', 'INACTIVO'].includes(status)) {
    throw new Error('El estado del rol no es válido.');
  }

  if (action === 'edit' && roleId !== originalId) {
    throw new Error(
      'No está permitido cambiar el ID de un rol existente.'
    );
  }

  const data = _accessLoadSecurityData_();

  const existing = _accessFindBy_(
    data.roles,
    'rol_id',
    action === 'edit' ? originalId : roleId
  );

  if (action === 'create' && existing) {
    throw new Error('Ya existe un rol con ese ID.');
  }

  if (action === 'edit' && !existing) {
    throw new Error('No se encontró el rol que deseas actualizar.');
  }

  const duplicateName = data.roles.some(row =>
    _accessText_(row.rol_id) !== originalId &&
    _accessText_(row.nombre).toLocaleLowerCase() ===
    name.toLocaleLowerCase()
  );

  if (duplicateName) {
    throw new Error('Ya existe un rol con ese nombre.');
  }

  if (
    action === 'edit' &&
    status === 'INACTIVO' &&
    data.usuarios.some(user =>
      _accessText_(user.rol_id) === originalId &&
      _accessIsActive_(user.estado)
    )
  ) {
    throw new Error(
      'No puedes desactivar un rol asignado a usuarios activos. Reasigna primero esas cuentas.'
    );
  }

  const after = _accessCopyData_(data);

  const nextRole = {
    rol_id: roleId,
    nombre: name,
    descripcion: description,
    estado: status
  };

  if (action === 'edit') {
    const index = after.roles.findIndex(row =>
      _accessText_(row.rol_id) === originalId
    );

    after.roles[index] = Object.assign(
      {},
      after.roles[index],
      nextRole
    );

  } else {
    after.roles.push(nextRole);
  }

  _accessAssertAdministratorContinuity_(
    data,
    after
  );

  return _accessRunAudited_(auth, {
    accion: action === 'create'
      ? 'CREAR_ROL'
      : 'EDITAR_ROL',

    modulo: 'ACCESOS',
    tipo_entidad: 'ROL',
    registro_id: roleId,
    registro_nombre: name,
    detalle: 'Administración de rol.',
    datos_antes: existing || null

  }, () => {
    const source = _accessSecuritySource_(
      ACCESS_MANAGEMENT_CONFIG.sheets.roles
    );

    const record = _accessAddMetadata_(
      ACCESS_MANAGEMENT_CONFIG.sheets.roles,
      nextRole,
      action === 'create',
      auth
    );

    if (action === 'create') {
      SUNARPCore.insertRecord(
        source,
        record,
        { idField: 'rol_id' }
      );

    } else {
      const updates = Object.assign({}, record);

      delete updates.rol_id;

      SUNARPCore.updateRecord(
        source,
        'rol_id',
        originalId,
        updates
      );
    }

    return {
      value: {
        success: true,
        message: action === 'create'
          ? 'Rol creado correctamente.'
          : 'Rol actualizado correctamente.'
      },

      auditAfter: nextRole
    };
  });
}


/**
 * Crea o actualiza permisos.
 */
function saveAccessPermission(payload) {
  const auth = _accessRequirePermission_(
    'PERMISOS_ADMINISTRAR'
  );

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error('No se recibieron los datos del permiso.');
  }

  const action = _accessText_(payload.action).toLowerCase();

  const permissionId = _accessUpper_(
    payload.permiso_id || payload.permissionId
  );

  const code = _accessUpper_(
    payload.codigo || payload.code
  );

  const moduleCode = _accessUpper_(
    payload.modulo || payload.module
  );

  const operation = _accessUpper_(
    payload.operacion || payload.operation
  );

  const description = _accessText_(
    payload.descripcion ||
    payload.description ||
    payload.nombre ||
    payload.name
  );

  const status = _accessUpper_(
    payload.estado || payload.status
  );

  if (!['create', 'edit'].includes(action)) {
    throw new Error('La operación del permiso no es válida.');
  }

  if (!/^[A-Z0-9_]{3,80}$/.test(code)) {
    throw new Error(
      'El código del permiso no tiene un formato válido.'
    );
  }

  if (!permissionId) {
    throw new Error('Ingresa el ID del permiso.');
  }

  if (!moduleCode || !operation || !description) {
    throw new Error(
      'Completa módulo, operación y descripción del permiso.'
    );
  }

  if (!['ACTIVO', 'INACTIVO'].includes(status)) {
    throw new Error('El estado del permiso no es válido.');
  }

  const data = _accessLoadSecurityData_();

  const existing = _accessFindBy_(
    data.permisos,
    'permiso_id',
    permissionId
  );

  if (action === 'create' && existing) {
    throw new Error('Ya existe un permiso con ese ID.');
  }

  if (action === 'edit' && !existing) {
    throw new Error('No se encontró el permiso que deseas actualizar.');
  }

  if (
    action === 'edit' &&
    code !== _accessUpper_(existing.codigo)
  ) {
    throw new Error(
      'El código de un permiso existente es inmutable. Crea otro permiso si necesitas un código distinto.'
    );
  }

  if (data.permisos.some(row =>
    _accessUpper_(row.codigo) === code &&
    _accessText_(row.permiso_id) !== permissionId
  )) {
    throw new Error('Ya existe un permiso con ese código.');
  }

  const nextPermission = {
    permiso_id: permissionId,
    codigo: code,
    modulo: moduleCode,
    operacion: operation,
    descripcion: description,
    estado: status
  };

  const after = _accessCopyData_(data);

  if (action === 'edit') {
    const index = after.permisos.findIndex(row =>
      _accessText_(row.permiso_id) === permissionId
    );

    after.permisos[index] = Object.assign(
      {},
      after.permisos[index],
      nextPermission
    );

  } else {
    after.permisos.push(nextPermission);
  }

  _accessAssertAdministratorContinuity_(
    data,
    after
  );

  return _accessRunAudited_(auth, {
    accion: action === 'create'
      ? 'CREAR_PERMISO'
      : 'EDITAR_PERMISO',

    modulo: 'ACCESOS',
    tipo_entidad: 'PERMISO',
    registro_id: permissionId,
    registro_nombre: code,
    detalle: 'Administración de permiso.',
    datos_antes: existing || null

  }, () => {
    const source = _accessSecuritySource_(
      ACCESS_MANAGEMENT_CONFIG.sheets.permissions
    );

    const record = _accessFilterPayload_(
      ACCESS_MANAGEMENT_CONFIG.sheets.permissions,
      nextPermission,
      [
        'permiso_id',
        'codigo',
        'modulo',
        'operacion',
        'estado'
      ]
    );

    if (action === 'create') {
      SUNARPCore.insertRecord(
        source,
        record,
        { idField: 'permiso_id' }
      );

    } else {
      const updates = Object.assign({}, record);

      delete updates.permiso_id;

      SUNARPCore.updateRecord(
        source,
        'permiso_id',
        permissionId,
        updates
      );
    }

    return {
      value: {
        success: true,
        message: action === 'create'
          ? 'Permiso creado correctamente.'
          : 'Permiso actualizado correctamente.'
      },

      auditAfter: nextPermission
    };
  });
}


/**
 * Actualiza las asignaciones de permisos de un rol.
 * Los permisos retirados quedan INACTIVOS en lugar de eliminarse.
 */
function saveRolePermissions(payload) {
  const auth = _accessRequirePermission_(
    'ROLES_ADMINISTRAR'
  );

  if (
    !SUNARPCore.authorizationHasPermission(
      auth,
      'PERMISOS_ADMINISTRAR'
    )
  ) {
    throw new Error(
      'También necesitas el permiso PERMISOS_ADMINISTRAR para asignar permisos a roles.'
    );
  }

  const roleId = _accessUpper_(
    payload && (payload.rol_id || payload.roleId)
  );

  const selected = Array.isArray(payload && payload.permiso_ids)
    ? payload.permiso_ids
    : Array.isArray(payload && payload.permissionIds)
      ? payload.permissionIds
      : [];

  if (!roleId) {
    throw new Error('Selecciona un rol.');
  }

  const data = _accessLoadSecurityData_();

  const role = data.roles.find(row =>
    _accessText_(row.rol_id) === roleId &&
    _accessIsActive_(row.estado)
  );

  if (!role) {
    throw new Error('El rol no existe o está inactivo.');
  }

  const permissionIds = [
    ...new Set(
      selected.map(_accessUpper_).filter(Boolean)
    )
  ];

  const activePermissions = new Set(
    data.permisos
      .filter(row => _accessIsActive_(row.estado))
      .map(row => _accessText_(row.permiso_id))
  );

  const invalid = permissionIds.filter(id =>
    !activePermissions.has(id)
  );

  if (invalid.length) {
    throw new Error(
      `Hay permisos inexistentes o inactivos: ${invalid.join(', ')}.`
    );
  }

  const after = _accessCopyData_(data);

  after.rolPermiso = after.rolPermiso.filter(row =>
    _accessText_(row.rol_id) !== roleId
  );

  permissionIds.forEach(id => {
    after.rolPermiso.push({
      rol_id: roleId,
      permiso_id: id,
      estado: 'ACTIVO'
    });
  });

  _accessAssertAdministratorContinuity_(
    data,
    after
  );

  return _accessRunAudited_(auth, {
    accion: 'ACTUALIZAR_ASIGNACION_PERMISOS',
    modulo: 'ACCESOS',
    tipo_entidad: 'ROL_PERMISO',
    registro_id: roleId,
    registro_nombre: _accessText_(role.nombre),
    detalle: 'Actualización de permisos asignados al rol.',

    datos_antes: data.rolPermiso.filter(row =>
      _accessText_(row.rol_id) === roleId
    )

  }, () => {
    const result = SUNARPCore.syncRecordsByKey(
      _accessSecuritySource_(
        ACCESS_MANAGEMENT_CONFIG.sheets.rolePermissions
      ),
      { rol_id: roleId },
      ['permiso_id'],
      permissionIds.map(id => ({
        permiso_id: id
      })),
      'estado',
      'ACTIVO',
      'INACTIVO'
    );

    return {
      value: {
        success: true,
        message: 'Asignaciones actualizadas correctamente.',
        ...result
      },

      auditAfter: permissionIds
    };
  });
}


/**
 * Actualiza los ámbitos de acceso de un usuario para un módulo.
 * El conjunto de ámbitos activos se interpreta como unión.
 */
function saveAccessScopes(payload) {
  const auth = _accessRequirePermission_(
    'AMBITOS_ACCESO_ADMINISTRAR'
  );

  const email = _accessText_(
    payload && (
      payload.correo_institucional ||
      payload.email
    )
  ).toLowerCase();

  const moduleCode = _accessUpper_(
    payload && (
      payload.modulo ||
      payload.module
    )
  );

  const scopesInput = Array.isArray(payload && payload.ambitos)
    ? payload.ambitos
    : Array.isArray(payload && payload.scopes)
      ? payload.scopes
      : [];

  _accessValidateEmail_(email);

  if (!moduleCode) {
    throw new Error('Selecciona un módulo.');
  }

  const data = _accessLoadSecurityData_();

  const user = _accessFindBy_(
    data.usuarios,
    'correo_institucional',
    email
  );

  if (!user) {
    throw new Error(
      'El usuario no existe en la hoja Usuarios.'
    );
  }

  const knownModules = new Set(
    data.permisos
      .map(row => _accessUpper_(row.modulo))
      .filter(Boolean)
  );

  if (!knownModules.has(moduleCode)) {
    throw new Error(
      'El módulo no existe en el catálogo de permisos.'
    );
  }

  const catalogs = _accessOrgCatalog_();

  const normalized = scopesInput.map(item => {
    const type = _accessUpper_(
      item.tipo_ambito ||
      item.scopeType
    );

    const referenceId = _accessText_(
      item.referencia_id ||
      item.referenceId
    );

    let descendants = _accessUpper_(
      item.incluir_descendientes ||
      item.includeDescendants ||
      'NO'
    );

    if (!['TOTAL', 'SEDE', 'ESTRUCTURA_ORG'].includes(type)) {
      throw new Error(
        `Tipo de ámbito no válido: ${type || '(vacío)'}.`
      );
    }

    if (type === 'TOTAL') {
      if (referenceId) {
        throw new Error(
          'Un ámbito TOTAL debe tener referencia_id vacío.'
        );
      }

      descendants = 'NO';

    } else if (type === 'SEDE') {
      if (
        !referenceId ||
        !_accessFindBy_(catalogs.sedes, 'id', referenceId)
      ) {
        throw new Error(
          `La sede "${referenceId}" no existe en Global parameters.`
        );
      }

      descendants = 'NO';

    } else {
      const structure = _accessFindBy_(
        catalogs.estructuraOrg,
        'id',
        referenceId
      );

      if (
        !referenceId ||
        !structure ||
        !_accessIsActive_(structure.active)
      ) {
        throw new Error(
          `La estructura orgánica "${referenceId}" no existe o está inactiva en Global parameters.`
        );
      }

      if (!['SI', 'SÍ', 'NO'].includes(descendants)) {
        throw new Error(
          'incluir_descendientes debe ser SI o NO.'
        );
      }

      descendants = descendants === 'SÍ'
        ? 'SI'
        : descendants;
    }

    return {
      tipo_ambito: type,
      referencia_id: referenceId,
      incluir_descendientes: descendants
    };
  });

  const totalScopes = normalized.filter(item =>
    item.tipo_ambito === 'TOTAL'
  );

  if (totalScopes.length && normalized.length > 1) {
    throw new Error(
      'El ámbito TOTAL es exclusivo: no puede combinarse con SEDE o ESTRUCTURA_ORG para el mismo usuario y módulo.'
    );
  }

  const unique = new Set();

  normalized.forEach(item => {
    const key =
      `${item.tipo_ambito}\u0000${item.referencia_id}`;

    if (unique.has(key)) {
      throw new Error('Has seleccionado un ámbito duplicado.');
    }

    unique.add(key);
  });

  const before = data.ambitosAcceso.filter(row =>
    _accessText_(row.correo_institucional).toLowerCase() === email &&
    _accessUpper_(row.modulo) === moduleCode
  );

  return _accessRunAudited_(auth, {
    accion: 'ACTUALIZAR_AMBITOS',
    modulo: 'ACCESOS',
    tipo_entidad: 'AMBITO_ACCESO',
    registro_id: email,
    registro_nombre: `${email} — ${moduleCode}`,
    detalle: 'Actualización de ámbitos de acceso.',
    ambito_modulo: moduleCode,
    datos_antes: before

  }, () => {
    const result = SUNARPCore.syncRecordsByKey(
      _accessSecuritySource_(
        ACCESS_MANAGEMENT_CONFIG.sheets.scopes
      ),
      {
        correo_institucional: email,
        modulo: moduleCode
      },
      [
        'tipo_ambito',
        'referencia_id'
      ],
      normalized,
      'estado',
      'ACTIVO',
      'INACTIVO',
      {
        allowEmptyKeyFields: ['referencia_id']
      }
    );

    return {
      value: {
        success: true,
        message: 'Ámbitos de acceso actualizados correctamente.',
        ...result
      },

      auditAfter: normalized
    };
  });
}


/**
 * Devuelve datos del módulo según las capacidades del usuario.
 * Los datos no autorizados no se envían al navegador.
 */
function getAccessManagementData() {
  const auth = _accessGetAuthContext_();

  const capabilities = {
    users: SUNARPCore.authorizationHasPermission(
      auth,
      'USUARIOS_ADMINISTRAR'
    ),

    roles: SUNARPCore.authorizationHasPermission(
      auth,
      'ROLES_ADMINISTRAR'
    ),

    permissions: SUNARPCore.authorizationHasPermission(
      auth,
      'PERMISOS_ADMINISTRAR'
    ),

    scopes: SUNARPCore.authorizationHasPermission(
      auth,
      'AMBITOS_ACCESO_ADMINISTRAR'
    ),

    audit: SUNARPCore.authorizationHasPermission(
      auth,
      'AUDITORIA_VER'
    )
  };

  capabilities.assignments =
    capabilities.roles &&
    capabilities.permissions;

  if (!Object.values(capabilities).some(Boolean)) {
    throw new Error(
      'No tienes permisos para administrar accesos ni consultar auditoría.'
    );
  }

  const data = _accessLoadSecurityData_();

  // Catálogos maestros para obtener la sede
  // correspondiente a la unidad orgánica del usuario.
  const needsOrgCatalog =
    capabilities.users || capabilities.scopes;

  const orgCatalogs = needsOrgCatalog
    ? _accessOrgCatalog_()
    : {
      sedes: [],
      estructuraOrg: []
    };

  const structureMap = new Map(
    orgCatalogs.estructuraOrg.map(item => [
      _accessText_(item.id),
      item
    ])
  );

  const sedeMap = new Map(
    orgCatalogs.sedes.map(item => [
      _accessText_(item.id),
      item
    ])
  );

  const response = {
    currentUser: {
      email: auth.email,
      name: auth.name,
      roleId: auth.roleId,
      roleName: auth.roleName
    },

    capabilities,

    users: (
      capabilities.users ||
      capabilities.scopes
    ) ? data.usuarios.map(row => {

      const structure = structureMap.get(
        _accessText_(row.estructura_org_id)
      );

      const sede = structure
        ? sedeMap.get(_accessText_(structure.sede_id))
        : null;

      return {
        correo_institucional: _accessText_(row.correo_institucional),
        nombres: _accessText_(row.nombres),
        apellidos: _accessText_(row.apellidos),

        nombre_completo: [
          _accessText_(row.nombres),
          _accessText_(row.apellidos)
        ].filter(Boolean).join(' '),

        estado: _accessUpper_(row.estado),
        rol_id: _accessText_(row.rol_id),

        estructura_org_id: _accessText_(row.estructura_org_id),

        // Datos derivados del catálogo maestro.
        sede_id: sede
          ? _accessText_(sede.id)
          : '',

        sede_name: sede
          ? _accessText_(sede.name)
          : ''
      };

    }) : [],

    roles: (
      capabilities.roles ||
      capabilities.users
    ) ? data.roles.map(row => ({
      rol_id: _accessText_(row.rol_id),
      nombre: _accessText_(row.nombre),
      descripcion: _accessText_(row.descripcion),
      estado: _accessUpper_(row.estado)
    })) : [],

    permissions: capabilities.permissions
      ? data.permisos.map(row => ({
        permiso_id: _accessText_(row.permiso_id),
        codigo: _accessUpper_(row.codigo),
        modulo: _accessUpper_(row.modulo),
        operacion: _accessUpper_(row.operacion),

        nombre: _accessText_(
          row.nombre ||
          row.nombre_permiso ||
          row.descripcion
        ),

        descripcion: _accessText_(row.descripcion),
        estado: _accessUpper_(row.estado)
      }))
      : [],

    rolePermissions: capabilities.assignments
      ? data.rolPermiso.map(row => ({
        rol_id: _accessText_(row.rol_id),
        permiso_id: _accessText_(row.permiso_id),
        estado: _accessUpper_(row.estado)
      }))
      : [],

    scopes: capabilities.scopes
      ? data.ambitosAcceso.map(row => ({
        correo_institucional: _accessText_(row.correo_institucional),
        modulo: _accessUpper_(row.modulo),
        tipo_ambito: _accessUpper_(row.tipo_ambito),
        referencia_id: _accessText_(row.referencia_id),
        incluir_descendientes: _accessUpper_(row.incluir_descendientes),
        estado: _accessUpper_(row.estado)
      }))
      : []
  };

  response.modules = [
    ...new Set(
      data.permisos
        .map(row => _accessUpper_(row.modulo))
        .filter(Boolean)
    )
  ].sort();

  if (capabilities.users || capabilities.scopes) {
    const catalogs = orgCatalogs;

    response.catalogs = {
      sedes: catalogs.sedes.map(row => ({
        id: _accessText_(row.id),
        name: _accessText_(row.name)
      })),

      estructuraOrg: catalogs.estructuraOrg
        .filter(row => _accessIsActive_(row.active))
        .map(row => ({
          id: _accessText_(row.id),
          sede_id: _accessText_(row.sede_id),
          parent_id: _accessText_(row.parent_id),
          name: _accessText_(row.name),
          order: row.order
        }))
    };
  }

  return response;
}


/**
 * Consulta el historial de auditoría con filtros y paginación.
 */
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

    // El historial del directorio solamente incluye
    // eventos del módulo DIRECTORIOS.
    if (
      entityType === 'SERVIDOR' &&
      eventModule !== 'DIRECTORIOS'
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

  const nextStatus = _accessUpper_(config.status);

  if (!['ACTIVO', 'INACTIVO'].includes(nextStatus)) {
    throw new Error('El estado solicitado no es válido.');
  }

  const data = _accessLoadSecurityData_();

  const record = _accessFindBy_(
    data[config.collection],
    config.keyField,
    config.id
  );

  if (!record) {
    throw new Error(`No se encontró el registro "${config.id}".`);
  }

  const currentStatus = _accessIsActive_(record.estado)
    ? 'ACTIVO'
    : 'INACTIVO';

  if (currentStatus === nextStatus) {
    return {
      success: true,
      message: `El registro ya se encuentra ${nextStatus.toLowerCase()}.`
    };
  }

  // Impedir la desactivación de la propia cuenta.
  if (
    config.collection === 'usuarios' &&
    nextStatus === 'INACTIVO' &&
    _accessText_(record.correo_institucional).toLowerCase() ===
    auth.email.toLowerCase()
  ) {
    throw new Error('No puedes desactivar tu propia cuenta.');
  }

  // Impedir desactivar roles asignados a usuarios activos.
  if (
    config.collection === 'roles' &&
    nextStatus === 'INACTIVO'
  ) {
    const assignedUsers = data.usuarios.filter(user =>
      _accessText_(user.rol_id) === _accessText_(record.rol_id) &&
      _accessIsActive_(user.estado)
    );

    if (assignedUsers.length > 0) {
      throw new Error(
        `No puedes desactivar este rol porque tiene ${assignedUsers.length} usuario(s) activo(s) asignado(s). Reasigna primero esas cuentas.`
      );
    }
  }

  // Proteger la continuidad de la administración.
  const after = _accessCopyData_(data);

  const afterRecord = _accessFindBy_(
    after[config.collection],
    config.keyField,
    config.id
  );

  afterRecord.estado = nextStatus;

  _accessAssertAdministratorContinuity_(data, after);

  const displayName = config.getName
    ? config.getName(record)
    : _accessText_(config.id);

  return _accessRunAudited_(auth, {
    accion: nextStatus === 'ACTIVO'
      ? config.activateAction
      : config.deactivateAction,

    modulo: 'ACCESOS',
    tipo_entidad: config.entity,
    registro_id: _accessText_(config.id),
    registro_nombre: displayName,
    detalle: `Cambio de estado de ${config.entity.toLowerCase()}.`,
    datos_antes: record

  }, () => {
    const result = SUNARPCore.setRecordStatus(
      _accessSecuritySource_(config.sheet),
      config.keyField,
      config.id,
      'estado',
      nextStatus
    );

    return {
      value: {
        success: true,
        message: nextStatus === 'ACTIVO'
          ? 'Registro activado correctamente.'
          : 'Registro desactivado correctamente.'
      },

      auditAfter: Object.assign(
        {},
        record,
        { estado: nextStatus }
      )
    };
  });
}


/**
 * Activar / desactivar usuarios.
 */
function setAccessUserStatus(email, status) {
  return _accessChangeStatus_({
    collection: 'usuarios',
    sheet: ACCESS_MANAGEMENT_CONFIG.sheets.users,
    keyField: 'correo_institucional',
    id: _accessText_(email).toLowerCase(),
    status,
    permission: 'USUARIOS_ADMINISTRAR',
    entity: 'USUARIO',
    activateAction: 'ACTIVAR_USUARIO',
    deactivateAction: 'DESACTIVAR_USUARIO',

    getName: record => [
      record.nombres,
      record.apellidos
    ].map(_accessText_).filter(Boolean).join(' ')
  });
}


/**
 * Activar / desactivar roles.
 */
function setAccessRoleStatus(roleId, status) {
  return _accessChangeStatus_({
    collection: 'roles',
    sheet: ACCESS_MANAGEMENT_CONFIG.sheets.roles,
    keyField: 'rol_id',
    id: _accessUpper_(roleId),
    status,
    permission: 'ROLES_ADMINISTRAR',
    entity: 'ROL',
    activateAction: 'ACTIVAR_ROL',
    deactivateAction: 'DESACTIVAR_ROL',
    getName: record => record.nombre
  });
}


/**
 * Activar / desactivar permisos.
 */
function setAccessPermissionStatus(permissionId, status) {
  return _accessChangeStatus_({
    collection: 'permisos',
    sheet: ACCESS_MANAGEMENT_CONFIG.sheets.permissions,
    keyField: 'permiso_id',
    id: _accessUpper_(permissionId),
    status,
    permission: 'PERMISOS_ADMINISTRAR',
    entity: 'PERMISO',
    activateAction: 'ACTIVAR_PERMISO',
    deactivateAction: 'DESACTIVAR_PERMISO',
    getName: record => record.codigo
  });
}
