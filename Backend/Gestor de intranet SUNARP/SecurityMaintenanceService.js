/**
 * Mantenimiento centralizado de catálogos de autorización.
 *
 * SECURITY es la fuente física y SUNARP Core administra lectura cacheada,
 * escrituras e invalidación por generaciones. Todas las operaciones exigen
 * la política global existente de Administración de accesos.
 */
const SECURITY_MAINTENANCE_CONFIG = Object.freeze({
  sourceKey: 'SECURITY',
  moduleCode: 'ACCESOS',
  cacheKey: 'security-maintenance-catalogs:v1',
  sheets: Object.freeze({
    roles: 'Roles',
    modules: 'Modulos',
    scopeTypes: 'TiposAmbito',
    operations: 'Operaciones'
  }),
  headers: Object.freeze({
    roles: Object.freeze(['rol_id', 'nombre', 'descripcion', 'active']),
    modules: Object.freeze(['modulo_id', 'codigo', 'nombre', 'descripcion', 'active']),
    scopeTypes: Object.freeze(['tipo_ambito_id', 'nombre', 'descripcion', 'entidad_referencia', 'requiere_referencia', 'permite_descendientes', 'active']),
    operations: Object.freeze(['operacion_id', 'nombre'])
  })
});

const SECURITY_MAINTENANCE_REFERENCE_FIELDS = Object.freeze({
  roles: Object.freeze({
    userRoles: Object.freeze(['persona_id', 'modulo_id', 'rol_id', 'active']),
    rolePermissions: Object.freeze(['rol_id', 'permiso_id', 'active'])
  }),
  modules: Object.freeze({
    userRoles: Object.freeze(['persona_id', 'modulo_id', 'rol_id', 'active']),
    permissions: Object.freeze(['permiso_id', 'codigo', 'modulo_id', 'operacion_id', 'active']),
    scopes: Object.freeze(['persona_id', 'modulo_id', 'tipo_ambito_id', 'referencia_id', 'active'])
  }),
  scopeTypes: Object.freeze({
    scopes: Object.freeze(['persona_id', 'modulo_id', 'tipo_ambito_id', 'referencia_id', 'active'])
  }),
  operations: Object.freeze({
    permissions: Object.freeze(['permiso_id', 'codigo', 'modulo_id', 'operacion_id', 'active'])
  })
});

const SECURITY_MAINTENANCE_PROTECTED_MODULE_CODES = Object.freeze([
  'ACCESOS', 'MANTENIMIENTOS', 'INFORMACION_PERSONAL',
  'DOCUMENTOS_NORMATIVOS', 'AUDITORIA'
]);

const SECURITY_MAINTENANCE_PROTECTED_OPERATION_IDS = Object.freeze([
  'VER', 'CREAR', 'EDITAR', 'CAMBIAR_ESTADO',
  'PUBLICAR', 'ELIMINAR', 'ADMINISTRAR'
]);

function _securityMaintenanceText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function _securityMaintenanceSource_(sheetName) {
  return getIntranetDataSource(SECURITY_MAINTENANCE_CONFIG.sourceKey, sheetName, 1);
}

function _securityMaintenanceEntity_(entity) {
  const key = _securityMaintenanceText_(entity).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SECURITY_MAINTENANCE_CONFIG.sheets, key)) {
    throw new Error('El catálogo de seguridad solicitado no existe.');
  }
  return {
    key,
    sheetName: SECURITY_MAINTENANCE_CONFIG.sheets[key],
    headers: SECURITY_MAINTENANCE_CONFIG.headers[key],
    idField: {
      roles: 'rol_id',
      modules: 'modulo_id',
      scopeTypes: 'tipo_ambito_id',
      operations: 'operacion_id'
    }[key]
  };
}

function _securityMaintenanceRequireGlobalAdministrator_() {
  const auth = _accessGetAuthContext_();
  let allowed = false;
  try {
    allowed = _accessIsGlobalAdministrator_(auth) === true;
  } catch (error) {
    allowed = false;
  }
  if (!allowed) {
    _accessWriteAudit_(auth, {
      accion: 'AUTORIZACION_DENEGADA',
      modulo: SECURITY_MAINTENANCE_CONFIG.moduleCode,
      tipo_entidad: 'CATALOGO_SEGURIDAD',
      registro_id: 'ADMINISTRADOR_GLOBAL_REQUERIDO',
      registro_nombre: 'Seguridad',
      resultado: 'DENEGADO',
      detalle: 'La administración de catálogos de seguridad requiere ROL_ADMIN, ámbito TOTAL exclusivo y todos los permisos administrativos en ACCESOS.'
    });
    throw new Error('La administración de catálogos de Seguridad requiere un administrador global autorizado en ACCESOS.');
  }
  return auth;
}

function _securityMaintenanceScopeTypeIsSupported_(record) {
  return _accessScopeTypeIsInterpretable_(record);
}

function _securityMaintenanceNormalizeCatalogs_(raw) {
  const catalogs = {
    roles: (raw.roles || []).map(item => ({
      rol_id: _accessUpper_(item.rol_id),
      nombre: _securityMaintenanceText_(item.nombre),
      descripcion: _securityMaintenanceText_(item.descripcion),
      active: _accessIsActive_(item.active)
    })),
    modules: (raw.modules || []).map(item => ({
      modulo_id: _accessUpper_(item.modulo_id),
      codigo: _accessUpper_(item.codigo),
      nombre: _securityMaintenanceText_(item.nombre),
      descripcion: _securityMaintenanceText_(item.descripcion),
      active: _accessIsActive_(item.active)
    })),
    scopeTypes: (raw.scopeTypes || []).map(item => ({
      tipo_ambito_id: _accessUpper_(item.tipo_ambito_id),
      nombre: _securityMaintenanceText_(item.nombre),
      descripcion: _securityMaintenanceText_(item.descripcion),
      entidad_referencia: _accessUpper_(item.entidad_referencia),
      requiere_referencia: _accessFlag_(item.requiere_referencia),
      permite_descendientes: _accessFlag_(item.permite_descendientes),
      active: _accessIsActive_(item.active)
    })),
    // Operaciones declara únicamente operacion_id y nombre. No se exponen
    // ni se escriben columnas active o descripcion.
    operations: (raw.operations || []).map(item => ({
      operacion_id: _accessUpper_(item.operacion_id),
      nombre: _securityMaintenanceText_(item.nombre)
    }))
  };

  _accessValidateUnique_(catalogs.roles, ['rol_id'], 'Roles.rol_id');
  _accessValidateUnique_(catalogs.roles, ['nombre'], 'Roles.nombre');
  _accessValidateUnique_(catalogs.modules, ['modulo_id'], 'Modulos.modulo_id');
  _accessValidateUnique_(catalogs.modules, ['codigo'], 'Modulos.codigo');
  _accessValidateUnique_(catalogs.scopeTypes, ['tipo_ambito_id'], 'TiposAmbito.tipo_ambito_id');
  _accessValidateUnique_(catalogs.scopeTypes, ['nombre'], 'TiposAmbito.nombre');
  _accessValidateUnique_(catalogs.operations, ['operacion_id'], 'Operaciones.operacion_id');
  _accessValidateUnique_(catalogs.operations, ['nombre'], 'Operaciones.nombre');

  catalogs.scopeTypes.forEach(item => {
    if (!item.tipo_ambito_id || !item.nombre || !_securityMaintenanceScopeTypeIsSupported_(item)) {
      throw new Error('TiposAmbito contiene una configuración no interpretable por SUNARP Core.');
    }
  });
  ACCESS_SCOPE_TYPE_IDS.forEach(id => {
    const item = catalogs.scopeTypes.find(row => row.tipo_ambito_id === id);
    const expected = {
      TOTAL: ['NINGUNA', false, false],
      SEDE: ['SEDE', true, false],
      ESTRUCTURA_ORG: ['ESTRUCTURA_ORG', true, true],
      LOCAL: ['LOCAL', true, false]
    }[id];
    if (!item || !item.active ||
        item.entidad_referencia !== expected[0] ||
        item.requiere_referencia !== expected[1] ||
        item.permite_descendientes !== expected[2]) {
      throw new Error('El tipo de ámbito esencial ' + id + ' debe conservarse activo y con su semántica original.');
    }
  });
  catalogs.operations.forEach(item => {
    if (!item.operacion_id || !item.nombre) {
      throw new Error('Operaciones contiene una fila sin operacion_id o nombre.');
    }
  });
  return catalogs;
}

function _securityMaintenanceLoadCatalogs_() {
  const requests = Object.keys(SECURITY_MAINTENANCE_CONFIG.sheets).map(key => ({
    key,
    source: _securityMaintenanceSource_(SECURITY_MAINTENANCE_CONFIG.sheets[key]),
    requiredHeaders: SECURITY_MAINTENANCE_CONFIG.headers[key]
  }));
  const cached = SUNARPCore.getOrBuildCachedValue(
    SECURITY_MAINTENANCE_CONFIG.cacheKey,
    requests.map(item => item.source),
    () => SUNARPCore.listRecordsFromSourcesCached(requests, ACCESS_MANAGEMENT_CATALOG_CACHE_TTL_SECONDS),
    ACCESS_MANAGEMENT_CATALOG_CACHE_TTL_SECONDS
  );
  if (!cached || !cached.value) {
    throw new Error('SUNARP Core no devolvió los catálogos de Seguridad.');
  }
  return _securityMaintenanceNormalizeCatalogs_(cached.value);
}

function getSecurityMaintenanceData() {
  _securityMaintenanceRequireGlobalAdministrator_();
  const catalogs = _securityMaintenanceLoadCatalogs_();
  return {
    roles: catalogs.roles,
    modules: catalogs.modules,
    scopeTypes: catalogs.scopeTypes,
    operations: catalogs.operations,
    capabilities: {
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canChangeStatus: true
    }
  };
}

function _securityMaintenanceFind_(catalogs, entity, id) {
  const config = _securityMaintenanceEntity_(entity);
  const expected = _accessUpper_(id);
  return (catalogs[config.key] || []).find(item =>
    _accessUpper_(item[config.idField]) === expected
  ) || null;
}

function _securityMaintenanceAssertUniqueName_(records, name, field, excludedId) {
  const normalized = _accessText_(name).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const duplicate = (records || []).some(item => {
    if (_accessUpper_(item[field]) === _accessUpper_(excludedId)) return false;
    const current = _accessText_(item.nombre || item.name)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    return current === normalized;
  });
  if (duplicate) throw new Error('Ya existe un registro con ese nombre en el catálogo.');
}

function _securityMaintenanceReferenceRequests_(entity) {
  const config = _securityMaintenanceEntity_(entity);
  const definitions = SECURITY_MAINTENANCE_REFERENCE_FIELDS[config.key];
  return Object.keys(definitions).map(key => ({
    key,
    source: _securityMaintenanceSource_({
      userRoles: 'UsuarioRol',
      rolePermissions: 'RolPermiso',
      permissions: 'Permisos',
      scopes: 'AmbitosAcceso'
    }[key]),
    requiredHeaders: definitions[key]
  }));
}

function _securityMaintenanceFindReferences_(entity, id) {
  const requests = _securityMaintenanceReferenceRequests_(entity);
  const result = SUNARPCore.listRecordsFromSourcesCached(
    requests,
    ACCESS_MANAGEMENT_CATALOG_CACHE_TTL_SECONDS
  );
  const expected = _accessUpper_(id);
  const fieldsByEntity = {
    roles: { userRoles: 'rol_id', rolePermissions: 'rol_id' },
    modules: { userRoles: 'modulo_id', permissions: 'modulo_id', scopes: 'modulo_id' },
    scopeTypes: { scopes: 'tipo_ambito_id' },
    operations: { permissions: 'operacion_id' }
  }[entity];
  const matches = [];
  Object.keys(fieldsByEntity).forEach(key => {
    const field = fieldsByEntity[key];
    (result[key] || []).forEach(row => {
      if (_accessUpper_(row[field]) === expected) {
        matches.push({ source: key, field, record: row });
      }
    });
  });
  return matches;
}

function _securityMaintenanceAssertNoReferences_(entity, id) {
  const matches = _securityMaintenanceFindReferences_(entity, id);
  if (matches.length) {
    const labels = {
      roles: 'UsuarioRol o RolPermiso',
      modules: 'UsuarioRol, Permisos o AmbitosAcceso',
      scopeTypes: 'AmbitosAcceso',
      operations: 'Permisos'
    };
    throw new Error('No se puede eliminar ni desactivar el registro porque tiene referencias en ' + labels[entity] + '.');
  }
}

function _securityMaintenanceIsProtected_(entity, record) {
  if (!record) return false;
  if (entity === 'roles') return _accessUpper_(record.rol_id) === ACCESS_MANAGEMENT_CONFIG.adminRoleId;
  if (entity === 'modules') {
    return SECURITY_MAINTENANCE_PROTECTED_MODULE_CODES.includes(_accessUpper_(record.codigo));
  }
  if (entity === 'scopeTypes') return ACCESS_SCOPE_TYPE_IDS.includes(_accessUpper_(record.tipo_ambito_id));
  if (entity === 'operations') {
    return SECURITY_MAINTENANCE_PROTECTED_OPERATION_IDS.includes(_accessUpper_(record.operacion_id));
  }
  return false;
}

function _securityMaintenanceBuildRecord_(entity, payload, action, existing, catalogs) {
  const config = _securityMaintenanceEntity_(entity);
  const name = _securityMaintenanceText_(payload.nombre || payload.name);
  if (!name) throw new Error('Ingresa el nombre del registro.');
  if (name.length > 150) throw new Error('El nombre no puede superar 150 caracteres.');

  if (config.key === 'roles') {
    _securityMaintenanceAssertUniqueName_(catalogs.roles, name, 'rol_id', existing && existing.rol_id);
    const id = existing
      ? _accessUpper_(existing.rol_id)
      : _accessGenerateUniqueIdentifier_('ROL_', name, catalogs.roles, 'rol_id', 50);
    return {
      rol_id: id,
      nombre: name,
      descripcion: _securityMaintenanceText_(payload.descripcion),
      active: existing ? existing.active : true
    };
  }

  if (config.key === 'modules') {
    const code = existing ? _accessUpper_(existing.codigo) : _accessIdentifierToken_(payload.codigo);
    if (!code || !/^[A-Z][A-Z0-9_]{1,59}$/.test(code)) {
      throw new Error('El código del módulo debe usar letras, números y guion bajo, y comenzar con una letra.');
    }
    if (!existing && catalogs.modules.some(item => item.codigo === code)) {
      throw new Error('Ya existe un módulo con ese código.');
    }
    if (existing && _accessIdentifierToken_(payload.codigo || existing.codigo) !== existing.codigo) {
      throw new Error('El código de un módulo existente es inmutable.');
    }
    _securityMaintenanceAssertUniqueName_(catalogs.modules, name, 'modulo_id', existing && existing.modulo_id);
    const id = existing
      ? _accessUpper_(existing.modulo_id)
      : _accessGenerateUniqueIdentifier_('MOD_', code, catalogs.modules, 'modulo_id', 70);
    return {
      modulo_id: id,
      codigo: code,
      nombre: name,
      descripcion: _securityMaintenanceText_(payload.descripcion),
      active: existing ? existing.active : true
    };
  }

  if (config.key === 'operations') {
    _securityMaintenanceAssertUniqueName_(catalogs.operations, name, 'operacion_id', existing && existing.operacion_id);
    const id = existing
      ? _accessUpper_(existing.operacion_id)
      : _accessGenerateUniqueIdentifier_('', name, catalogs.operations, 'operacion_id', 50);
    return { operacion_id: id, nombre: name };
  }

  if (config.key === 'scopeTypes') {
    _securityMaintenanceAssertUniqueName_(catalogs.scopeTypes, name, 'tipo_ambito_id', existing && existing.tipo_ambito_id);
    if (existing) {
      // La semántica que usa Core no se modifica después de crear el tipo.
      return {
        tipo_ambito_id: _accessUpper_(existing.tipo_ambito_id),
        nombre: name,
        descripcion: _securityMaintenanceText_(payload.descripcion),
        entidad_referencia: existing.entidad_referencia,
        requiere_referencia: existing.requiere_referencia ? 'SI' : 'NO',
        permite_descendientes: existing.permite_descendientes ? 'SI' : 'NO',
        active: existing.active
      };
    }
    const entity = _accessUpper_(payload.entidad_referencia);
    if (!['SEDE', 'ESTRUCTURA_ORG', 'LOCAL'].includes(entity)) {
      throw new Error('El tipo adicional debe usar una entidad de referencia interpretada por SUNARP Core: SEDE, ESTRUCTURA_ORG o LOCAL.');
    }
    const permitsDescendants = entity === 'ESTRUCTURA_ORG' &&
      _accessFlag_(payload.permite_descendientes);
    const record = {
      tipo_ambito_id: _accessGenerateUniqueIdentifier_('TIPO_AMBITO_', name, catalogs.scopeTypes, 'tipo_ambito_id', 70),
      nombre: name,
      descripcion: _securityMaintenanceText_(payload.descripcion),
      entidad_referencia: entity,
      requiere_referencia: 'SI',
      permite_descendientes: permitsDescendants ? 'SI' : 'NO',
      active: true
    };
    if (!_securityMaintenanceScopeTypeIsSupported_(record)) {
      throw new Error('La configuración propuesta no es interpretable de forma segura por SUNARP Core.');
    }
    return record;
  }
  throw new Error('El catálogo de seguridad solicitado no admite esta operación.');
}

function saveSecurityCatalogRecord(payload) {
  const auth = _securityMaintenanceRequireGlobalAdministrator_();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('No se recibieron los datos del catálogo de seguridad.');
  }
  const config = _securityMaintenanceEntity_(payload.entity);
  const action = _securityMaintenanceText_(payload.action).toLowerCase();
  if (!['create', 'edit'].includes(action)) throw new Error('La operación solicitada no es válida.');

  const catalogs = _securityMaintenanceLoadCatalogs_();
  const originalId = action === 'edit' ? _accessUpper_(payload.id || payload.originalId) : '';
  const existing = action === 'edit'
    ? _securityMaintenanceFind_(catalogs, config.key, originalId)
    : null;
  if (action === 'edit' && !existing) throw new Error('No se encontró el registro que deseas modificar.');
  if (action === 'create' && config.key === 'modules' && !payload.codigo) {
    throw new Error('Ingresa el código único del módulo.');
  }
  const next = _securityMaintenanceBuildRecord_(config.key, payload, action, existing, catalogs);
  const id = next[config.idField];
  if (action === 'create' && _securityMaintenanceFind_(catalogs, config.key, id)) {
    throw new Error('El identificador generado ya existe. Actualiza el nombre o código y vuelve a intentar.');
  }

  return _accessRunAudited_(auth, {
    accion: (action === 'create' ? 'CREAR_' : 'EDITAR_') + config.key.toUpperCase(),
    modulo: SECURITY_MAINTENANCE_CONFIG.moduleCode,
    tipo_entidad: config.sheetName.toUpperCase(),
    registro_id: id,
    registro_nombre: next.nombre,
    detalle: action === 'create'
      ? 'Alta del catálogo de seguridad ' + config.sheetName + '.'
      : 'Edición del catálogo de seguridad ' + config.sheetName + '.',
    datos_antes: existing || null
  }, () => {
    const source = _securityMaintenanceSource_(config.sheetName);
    if (action === 'create') {
      const uniqueFields = config.key === 'roles' || config.key === 'operations' || config.key === 'scopeTypes'
        ? ['nombre']
        : ['codigo'];
      SUNARPCore.insertRecord(source, next, {
        idField: config.idField,
        uniqueFields
      });
    } else {
      const updates = Object.assign({}, next);
      delete updates[config.idField];
      SUNARPCore.updateRecord(source, config.idField, originalId, updates, {
        uniqueFields: config.key === 'modules'
          ? ['codigo']
          : ['nombre']
      });
    }
    return {
      value: {
        success: true,
        entity: config.key,
        id,
        record: next,
        message: action === 'create' ? 'Registro creado correctamente.' : 'Registro actualizado correctamente.'
      },
      auditAfter: next
    };
  });
}

function setSecurityCatalogStatus(entity, id, active) {
  const auth = _securityMaintenanceRequireGlobalAdministrator_();
  const config = _securityMaintenanceEntity_(entity);
  if (config.key === 'operations') {
    throw new Error('Operaciones no tiene columna active; no admite cambios de estado.');
  }
  const nextActive = _accessNormalizeActive_(active, 'El estado solicitado');
  const catalogs = _securityMaintenanceLoadCatalogs_();
  const record = _securityMaintenanceFind_(catalogs, config.key, id);
  if (!record) throw new Error('No se encontró el registro que deseas actualizar.');
  if (record.active === nextActive) {
    return { success: true, id: record[config.idField], active: nextActive, message: 'El registro ya tiene el estado solicitado.' };
  }
  if (!nextActive) {
    if (_securityMaintenanceIsProtected_(config.key, record)) {
      throw new Error('El elemento es esencial para la autorización y no puede desactivarse.');
    }
    _securityMaintenanceAssertNoReferences_(config.key, record[config.idField]);
  }

  const next = Object.assign({}, record, { active: nextActive });
  return _accessRunAudited_(auth, {
    accion: nextActive ? 'ACTIVAR_' + config.key.toUpperCase() : 'DESACTIVAR_' + config.key.toUpperCase(),
    modulo: SECURITY_MAINTENANCE_CONFIG.moduleCode,
    tipo_entidad: config.sheetName.toUpperCase(),
    registro_id: record[config.idField],
    registro_nombre: record.nombre,
    detalle: 'Cambio de estado del catálogo de seguridad ' + config.sheetName + '.',
    datos_antes: record
  }, () => {
    SUNARPCore.setRecordStatus(
      _securityMaintenanceSource_(config.sheetName),
      config.idField,
      record[config.idField],
      'active',
      nextActive
    );
    return {
      value: { success: true, id: record[config.idField], active: nextActive, record: next, message: nextActive ? 'Registro activado correctamente.' : 'Registro desactivado correctamente.' },
      auditAfter: next
    };
  });
}

function deleteSecurityCatalogRecord(entity, id) {
  const auth = _securityMaintenanceRequireGlobalAdministrator_();
  const config = _securityMaintenanceEntity_(entity);
  const catalogs = _securityMaintenanceLoadCatalogs_();
  const record = _securityMaintenanceFind_(catalogs, config.key, id);
  if (!record) throw new Error('No se encontró el registro que deseas eliminar.');
  if (_securityMaintenanceIsProtected_(config.key, record)) {
    throw new Error('El elemento es esencial para la autorización y no puede eliminarse.');
  }
  _securityMaintenanceAssertNoReferences_(config.key, record[config.idField]);

  return _accessRunAudited_(auth, {
    accion: 'ELIMINAR_' + config.key.toUpperCase(),
    modulo: SECURITY_MAINTENANCE_CONFIG.moduleCode,
    tipo_entidad: config.sheetName.toUpperCase(),
    registro_id: record[config.idField],
    registro_nombre: record.nombre,
    detalle: 'Eliminación física del catálogo de seguridad ' + config.sheetName + '.',
    datos_antes: record
  }, () => {
    const result = SUNARPCore.deleteRecord(
      _securityMaintenanceSource_(config.sheetName),
      config.idField,
      record[config.idField]
    );
    return {
      value: {
        success: true,
        id: record[config.idField],
        message: result && result.message || 'El registro se eliminó correctamente.'
      },
      auditAfter: null
    };
  });
}
