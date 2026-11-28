/**
 * Mantenimiento de Sedes y locales y Organización institucional.
 *
 * Los cinco catálogos maestros y la relación contextual estructura_local se
 * consultan en un solo lote de SUNARP Core. La relación se usa exclusivamente
 * para validar dependencias: nunca se expone como CRUD independiente.
 *
 * Core es responsable de lecturas, escrituras e invalidación de generaciones.
 */
const SITE_ORGANIZATION_MAINTENANCE_CONFIG = Object.freeze({
  sourceKey: 'MASTER_DATA',
  moduleCode: 'MANTENIMIENTOS',
  cacheTtlSeconds: 300,
  sheets: Object.freeze({
    sede: 'sede',
    tipos_local: 'tipos_local',
    locales: 'locales',
    tipos_estructura: 'tipos_estructura',
    estructura_org: 'estructura_org',
    estructura_local: 'estructura_local'
  }),
  headers: Object.freeze({
    sede: Object.freeze(['id', 'name']),
    tipos_local: Object.freeze(['id', 'name', 'active']),
    locales: Object.freeze(['id', 'sede_id', 'tipo_local_id', 'name', 'parent_id', 'order', 'active']),
    tipos_estructura: Object.freeze(['id', 'name', 'active']),
    estructura_org: Object.freeze(['id', 'sede_id', 'parent_id', 'tipo_estructura_id', 'name', 'order', 'active']),
    estructura_local: Object.freeze(['id', 'estructura_id', 'local_id', 'referencia', 'active'])
  }),
  entities: Object.freeze({
    sede: Object.freeze({
      sheetName: 'sede', label: 'Sedes', singular: 'sede',
      nameField: 'name', nameLabel: 'Nombre de la sede',
      headers: Object.freeze(['id', 'name']), hasActive: false,
      auditType: 'SEDE', idKind: 'sede', scopeFields: Object.freeze([])
    }),
    tipos_local: Object.freeze({
      sheetName: 'tipos_local', label: 'Tipos de local', singular: 'tipo de local',
      nameField: 'name', nameLabel: 'Nombre del tipo de local',
      headers: Object.freeze(['id', 'name', 'active']), hasActive: true,
      auditType: 'TIPO_LOCAL', idKind: 'token', scopeFields: Object.freeze([])
    }),
    locales: Object.freeze({
      sheetName: 'locales', label: 'Locales', singular: 'local',
      nameField: 'name', nameLabel: 'Nombre del local',
      headers: Object.freeze(['id', 'sede_id', 'tipo_local_id', 'name', 'parent_id', 'order', 'active']),
      hasActive: true, hasOrder: true, auditType: 'LOCAL', idKind: 'local',
      scopeFields: Object.freeze(['sede_id', 'parent_id'])
    }),
    tipos_estructura: Object.freeze({
      sheetName: 'tipos_estructura', label: 'Tipos de estructura', singular: 'tipo de estructura',
      nameField: 'name', nameLabel: 'Nombre del tipo de estructura',
      headers: Object.freeze(['id', 'name', 'active']), hasActive: true,
      auditType: 'TIPO_ESTRUCTURA', idKind: 'token', scopeFields: Object.freeze([])
    }),
    estructura_org: Object.freeze({
      sheetName: 'estructura_org', label: 'Estructura orgánica', singular: 'estructura orgánica',
      nameField: 'name', nameLabel: 'Nombre de la estructura orgánica',
      headers: Object.freeze(['id', 'sede_id', 'parent_id', 'tipo_estructura_id', 'name', 'order', 'active']),
      hasActive: true, hasOrder: true, auditType: 'ESTRUCTURA_ORG', idKind: 'organization',
      scopeFields: Object.freeze(['sede_id', 'parent_id'])
    })
  })
});

function _somText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function _somToken_(value) {
  return _somText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function _somNameKey_(value) {
  return _somText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function _somIsActive_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return ['TRUE', '1', 'SI', 'SÍ', 'YES'].includes(_somText_(value).toUpperCase());
}

function _somGetEntityConfig_(entity) {
  const key = _somText_(entity).toLowerCase();
  const config = SITE_ORGANIZATION_MAINTENANCE_CONFIG.entities[key];
  if (!config) throw new Error('El mantenimiento institucional indicado no existe.');
  return { key: key, value: config };
}

function _somSource_(sheetName, sourceKey) {
  return getIntranetDataSource(
    sourceKey || SITE_ORGANIZATION_MAINTENANCE_CONFIG.sourceKey,
    sheetName,
    1
  );
}

/**
 * Estos catálogos institucionales son compartidos. Se requiere permiso efectivo
 * y un único ámbito TOTAL sin referencia, sin relajar las reglas de MANTENIMIENTOS.
 */
function _somRequirePermission_(operation) {
  const code = 'MANTENIMIENTOS_' + _somText_(operation).toUpperCase();
  const auth = _accessRequirePermission_(code, SITE_ORGANIZATION_MAINTENANCE_CONFIG.moduleCode);
  const moduleId = _accessResolveModuleId_(auth, SITE_ORGANIZATION_MAINTENANCE_CONFIG.moduleCode);
  const moduleAccess = _accessGetModuleAccess_(auth, moduleId);
  const scopes = moduleAccess && Array.isArray(moduleAccess.scopes) ? moduleAccess.scopes : [];
  const exclusiveTotal = scopes.length === 1 &&
    _somText_(scopes[0].tipo_ambito_id || scopes[0].tipo_ambito).toUpperCase() === 'TOTAL' &&
    !_somText_(scopes[0].referencia_id);
  const inGlobalScope = exclusiveTotal &&
    SUNARPCore.authorizationIsRecordInScope(auth, moduleId, {}, []);

  if (!inGlobalScope) {
    _accessWriteAudit_(auth, {
      accion: 'AUTORIZACION_DENEGADA',
      modulo: SITE_ORGANIZATION_MAINTENANCE_CONFIG.moduleCode,
      tipo_entidad: 'CATALOGO_MANTENIMIENTO',
      registro_id: code,
      registro_nombre: code,
      resultado: 'DENEGADO',
      detalle: 'La administración de catálogos institucionales requiere un ámbito TOTAL exclusivo en MANTENIMIENTOS.'
    });
    throw new Error('No tienes un ámbito TOTAL autorizado para administrar los catálogos institucionales.');
  }
  return { auth: auth, moduleId: moduleId };
}

function _somNormalizeRecords_(entity, records) {
  const headers = SITE_ORGANIZATION_MAINTENANCE_CONFIG.headers[entity];
  const ids = new Set();
  return (records || []).map(function (record) {
    const normalized = {};
    headers.forEach(function (field) {
      if (field === 'active') {
        normalized[field] = _somIsActive_(record[field]);
      } else if (field === 'order') {
        const raw = _somText_(record[field]);
        if (!raw) normalized[field] = '';
        else {
          const numeric = Number(raw);
          if (!Number.isInteger(numeric) || numeric < 1) {
            throw new Error('El campo order contiene un valor no entero o menor que 1 en la pestaña "' +
              SITE_ORGANIZATION_MAINTENANCE_CONFIG.sheets[entity] + '".');
          }
          normalized[field] = numeric;
        }
      } else {
        normalized[field] = _somText_(record[field]);
      }
    });

    if (!normalized.id) {
      throw new Error('La pestaña "' + SITE_ORGANIZATION_MAINTENANCE_CONFIG.sheets[entity] +
        '" contiene un registro sin identificador.');
    }
    if (!normalized.name && entity !== 'estructura_local') {
      throw new Error('El registro "' + normalized.id + '" de "' +
        SITE_ORGANIZATION_MAINTENANCE_CONFIG.sheets[entity] + '" no tiene nombre.');
    }
    if (ids.has(normalized.id)) {
      throw new Error('El identificador "' + normalized.id + '" está duplicado en la pestaña "' +
        SITE_ORGANIZATION_MAINTENANCE_CONFIG.sheets[entity] + '".');
    }
    ids.add(normalized.id);
    return normalized;
  });
}

/**
 * Carga una única instantánea compartida. estructura_local solo se incorpora
 * para controles de integridad y referencias; no es una pestaña de CRUD.
 */
function _somLoadCatalogs_() {
  const entities = Object.keys(SITE_ORGANIZATION_MAINTENANCE_CONFIG.sheets);
  const requests = entities.map(function (entity) {
    return {
      key: entity,
      source: _somSource_(SITE_ORGANIZATION_MAINTENANCE_CONFIG.sheets[entity]),
      requiredHeaders: SITE_ORGANIZATION_MAINTENANCE_CONFIG.headers[entity],
      valueMode: 'display'
    };
  });
  const sources = requests.map(function (request) { return request.source; });
  const cached = SUNARPCore.getOrBuildCachedValue(
    'site-organization-maintenance:display:v1',
    sources,
    function () { return SUNARPCore.listRecordsFromSources(requests); },
    SITE_ORGANIZATION_MAINTENANCE_CONFIG.cacheTtlSeconds
  );
  if (!cached || !cached.value) {
    throw new Error('No se pudieron consultar los catálogos de Sedes y organización institucional.');
  }

  const catalogs = {};
  entities.forEach(function (entity) {
    const records = cached.value[entity];
    if (!Array.isArray(records)) {
      throw new Error('SUNARP Core no devolvió la pestaña "' +
        SITE_ORGANIZATION_MAINTENANCE_CONFIG.sheets[entity] + '".');
    }
    catalogs[entity] = _somNormalizeRecords_(entity, records);
  });
  return catalogs;
}

function _somFindById_(records, id) {
  const expected = _somText_(id);
  return (records || []).find(function (record) {
    return _somText_(record.id) === expected;
  }) || null;
}

function _somHasPermission_(auth, moduleId, operation) {
  return SUNARPCore.authorizationHasPermission(
    auth,
    'MANTENIMIENTOS_' + operation,
    moduleId
  ) === true;
}

function _somBuildCapabilities_(auth, moduleId, config) {
  return {
    canCreate: _somHasPermission_(auth, moduleId, 'CREAR'),
    canEdit: _somHasPermission_(auth, moduleId, 'EDITAR'),
    canChangeStatus: config.hasActive && _somHasPermission_(auth, moduleId, 'CAMBIAR_ESTADO'),
    canDelete: _somHasPermission_(auth, moduleId, 'ELIMINAR'),
    canViewHistory: _somHasPermission_(auth, moduleId, 'VER')
  };
}

function getSiteOrganizationMaintenanceData() {
  const authorization = _somRequirePermission_('VER');
  const catalogs = _somLoadCatalogs_();
  const entities = {};
  Object.keys(SITE_ORGANIZATION_MAINTENANCE_CONFIG.entities).forEach(function (entity) {
    const config = SITE_ORGANIZATION_MAINTENANCE_CONFIG.entities[entity];
    entities[entity] = {
      entity: entity,
      label: config.label,
      singular: config.singular,
      nameField: config.nameField,
      nameLabel: config.nameLabel,
      hasActive: config.hasActive,
      hasOrder: config.hasOrder === true,
      capabilities: _somBuildCapabilities_(authorization.auth, authorization.moduleId, config)
    };
  });
  return { catalogs: catalogs, entities: entities };
}

function _somFindSitePrefix_(siteId, catalogs) {
  const site = _somFindById_(catalogs.sede || [], siteId);
  const id = _somText_(siteId).toUpperCase();
  if (id === 'SEDE_CENTRAL' || _somNameKey_(site && site.name) === 'sede central') return 'SC';
  if (id.indexOf('ZR_') === 0) return id;
  return 'SEDE_' + (_somToken_(id) || _somToken_(site && site.name) || 'SIN_CODIGO');
}

function _somLocalNameToken_(name, tipoLocalId, catalogs) {
  let token = _somToken_(name);
  const type = _somFindById_(catalogs.tipos_local || [], tipoLocalId);
  const typeToken = _somToken_(type && type.name);
  if (typeToken && token.indexOf(typeToken + '_') === 0) {
    token = token.slice(typeToken.length + 1);
  } else if (typeToken && token === typeToken) {
    token = '';
  }
  token = token
    .replace(/^DE_/, '')
    .replace(/_SEDE_PRINCIPAL$/, '')
    .replace(/_SEDE_CENTRAL$/, '')
    .replace(/^SEDE_PRINCIPAL_/, '');
  return token || _somToken_(name);
}

function _somStructureNameToken_(name) {
  let token = _somToken_(name);
  if (token.indexOf('UNIDAD_FUNCIONAL_DE_') === 0) {
    token = 'UF_' + token.slice('UNIDAD_FUNCIONAL_DE_'.length);
  }
  return token;
}

function _somUniqueCode_(base, records) {
  const maximumLength = 80;
  const normalizedBase = _somText_(base).slice(0, maximumLength);
  if (!normalizedBase) throw new Error('Ingresa un nombre válido para generar el código.');
  const used = new Set((records || []).map(function (record) {
    return _somText_(record.id).toUpperCase();
  }));
  if (!used.has(normalizedBase.toUpperCase())) return normalizedBase;
  for (let suffixNumber = 2; suffixNumber < 10000; suffixNumber++) {
    const suffix = '_' + suffixNumber;
    const candidate = normalizedBase.slice(0, maximumLength - suffix.length) + suffix;
    if (!used.has(candidate.toUpperCase())) return candidate;
  }
  throw new Error('No se pudo generar un identificador único para el registro.');
}

/** Generador determinista también utilizado por la vista para mostrar una vista previa. */
function _somGenerateIdentifier_(entity, payload, catalogs) {
  const definition = _somGetEntityConfig_(entity);
  const config = definition.value;
  const name = _somText_(payload && payload.name);
  if (!name) return '';
  let base = '';
  if (config.idKind === 'sede') {
    const lowered = _somNameKey_(name);
    if (lowered.indexOf('zona registral') === 0) {
      let tail = _somToken_(name.replace(/^zona\s+registral\s*/i, '')).replace(/^N_?/, '');
      base = 'ZR_' + tail;
    } else {
      base = 'SEDE_' + _somToken_(name);
    }
  } else if (config.idKind === 'token') {
    base = _somToken_(name);
  } else if (config.idKind === 'local') {
    const sitePrefix = _somFindSitePrefix_(payload.sede_id, catalogs);
    const nameToken = _somLocalNameToken_(name, payload.tipo_local_id, catalogs);
    base = sitePrefix + '_' + nameToken;
  } else if (config.idKind === 'organization') {
    const sitePrefix = _somFindSitePrefix_(payload.sede_id, catalogs);
    base = sitePrefix + '_' + _somStructureNameToken_(name);
  }
  return _somUniqueCode_(base, catalogs[definition.key] || []);
}

function _somAssertUniqueName_(entity, name, payload, records, excludedId) {
  const definition = _somGetEntityConfig_(entity);
  const config = definition.value;
  const expected = _somNameKey_(name);
  const duplicate = (records || []).some(function (record) {
    if (_somText_(record.id) === _somText_(excludedId)) return false;
    if (_somNameKey_(record[config.nameField]) !== expected) return false;
    return config.scopeFields.every(function (field) {
      return _somText_(record[field]) === _somText_(payload[field]);
    });
  });
  if (duplicate) {
    throw new Error(config.scopeFields.length
      ? 'Ya existe un registro con ese nombre dentro de la sede y nivel jerárquico seleccionados.'
      : 'Ya existe un registro con ese nombre en el catálogo.');
  }
}

function _somParseOrder_(value) {
  const raw = _somText_(value);
  if (!raw) return '';
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('El orden debe ser un número entero mayor o igual que 1, o quedar vacío.');
  }
  return number;
}

function _somAssertUsableReference_(records, id, oldId, label) {
  const identifier = _somText_(id);
  if (!identifier) throw new Error('Selecciona ' + label + '.');
  const record = _somFindById_(records, identifier);
  if (!record) {
    if (identifier === _somText_(oldId)) return;
    throw new Error('La referencia seleccionada de ' + label + ' no existe en el catálogo.');
  }
  if (record.active === false && identifier !== _somText_(oldId)) {
    throw new Error('No puedes asociar un nuevo registro a un elemento inactivo de ' + label + '.');
  }
}

function _somAssertSameSiteParent_(entity, parentId, siteId, catalogs, currentId) {
  const identifier = _somText_(parentId);
  if (!identifier) return;
  const parent = _somFindById_(catalogs[entity] || [], identifier);
  if (!parent) throw new Error('El elemento padre seleccionado ya no existe.');
  if (_somText_(parent.sede_id) !== _somText_(siteId)) {
    throw new Error('El elemento padre debe pertenecer a la misma sede.');
  }
  if (identifier === _somText_(currentId)) {
    throw new Error('Un registro no puede ser su propio elemento padre.');
  }
  let cursor = parent;
  const visited = new Set([_somText_(currentId)]);
  while (cursor) {
    const cursorId = _somText_(cursor.id);
    if (visited.has(cursorId)) {
      throw new Error('La relación jerárquica generaría un ciclo. Selecciona otro elemento padre.');
    }
    visited.add(cursorId);
    cursor = _somText_(cursor.parent_id)
      ? _somFindById_(catalogs[entity] || [], cursor.parent_id)
      : null;
  }
}

function _somBuildNextRecord_(entity, payload, action, current, catalogs) {
  const definition = _somGetEntityConfig_(entity);
  const config = definition.value;
  const name = _somText_(payload.name);
  if (!name) throw new Error('Ingresa ' + config.nameLabel.toLowerCase() + '.');
  if (name.length > 150) throw new Error('El nombre no puede superar 150 caracteres.');

  const next = { id: action === 'edit' ? current.id : _somText_(payload.id) };
  next.name = name;

  if (entity === 'locales' || entity === 'estructura_org') {
    const siteId = _somText_(payload.sede_id || (current && current.sede_id));
    if (!siteId || !_somFindById_(catalogs.sede, siteId)) {
      throw new Error('Selecciona una sede existente.');
    }
    if (action === 'edit' && siteId !== _somText_(current.sede_id)) {
      throw new Error('La sede de un registro existente no se puede cambiar porque forma parte de su código y de sus referencias.');
    }
    next.sede_id = siteId;

    const parentId = _somText_(payload.parent_id);
    next.parent_id = parentId;
    _somAssertSameSiteParent_(
      entity === 'locales' ? 'locales' : 'estructura_org',
      parentId,
      siteId,
      catalogs,
      current && current.id
    );

    if (entity === 'locales') {
      const typeId = _somText_(payload.tipo_local_id);
      _somAssertUsableReference_(catalogs.tipos_local, typeId, current && current.tipo_local_id, 'un tipo de local');
      next.tipo_local_id = typeId;
    } else {
      const typeId = _somText_(payload.tipo_estructura_id);
      _somAssertUsableReference_(catalogs.tipos_estructura, typeId, current && current.tipo_estructura_id, 'un tipo de estructura');
      next.tipo_estructura_id = typeId;
    }
    next.order = _somParseOrder_(payload.order);
  }

  _somAssertUniqueName_(entity, name, next, catalogs[entity] || [], current && current.id);
  if (config.hasActive) next.active = action === 'create' ? true : current.active === true;
  return next;
}

function _somAuditEvent_(action, entity, record) {
  const config = _somGetEntityConfig_(entity).value;
  return {
    accion: action + '_CATALOGO_MANTENIMIENTO',
    modulo: SITE_ORGANIZATION_MAINTENANCE_CONFIG.moduleCode,
    tipo_entidad: config.auditType,
    registro_id: _somText_(record && record.id),
    registro_nombre: _somText_(record && record.name),
    detalle: action === 'CREAR'
      ? 'Registro de ' + config.label + ' (' + config.sheetName + ').'
      : action === 'EDITAR'
        ? 'Actualización de ' + config.label + ' (' + config.sheetName + ').'
        : action === 'CAMBIAR_ESTADO'
          ? 'Cambio de estado de ' + config.label + ' (' + config.sheetName + ').'
          : 'Eliminación física de ' + config.label + ' (' + config.sheetName + ').',
    datos_antes: action === 'CREAR' ? null : record || null
  };
}

function saveSiteOrganizationMaintenanceRecord(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('No se recibieron los datos del mantenimiento institucional.');
  }
  const definition = _somGetEntityConfig_(payload.entity);
  const entity = definition.key;
  const config = definition.value;
  const action = _somText_(payload.action).toLowerCase();
  if (action !== 'create' && action !== 'edit') throw new Error('La operación solicitada no es válida.');

  const authorization = _somRequirePermission_(action === 'create' ? 'CREAR' : 'EDITAR');
  const catalogs = _somLoadCatalogs_();
  const records = catalogs[entity] || [];
  const id = _somText_(payload.id);
  const current = action === 'edit' ? _somFindById_(records, id) : null;
  if (action === 'edit' && (!id || !current)) throw new Error('No se encontró el registro que deseas modificar.');

  const next = _somBuildNextRecord_(entity, payload, action, current, catalogs);
  if (action === 'create') {
    const expectedId = _somGenerateIdentifier_(entity, next, catalogs);
    if (!id || id !== expectedId) {
      throw new Error('El código generado cambió o no corresponde al nombre y las relaciones seleccionadas. Actualiza los datos y vuelve a guardar.');
    }
    if (_somFindById_(records, id)) throw new Error('Ya existe el código "' + id + '" en el catálogo.');
  }

  const event = _somAuditEvent_(action === 'create' ? 'CREAR' : 'EDITAR', entity, current || next);
  return _accessRunAudited_(authorization.auth, event, function () {
    let result;
    if (action === 'create') {
      result = SUNARPCore.insertRecord(
        _somSource_(config.sheetName),
        next,
        { idField: 'id' }
      );
    } else {
      const updates = {};
      config.headers.forEach(function (field) {
        if (field !== 'id' && field !== 'active') updates[field] = next[field];
      });
      result = SUNARPCore.updateRecord(
        _somSource_(config.sheetName),
        'id',
        id,
        updates
      );
    }
    return {
      value: Object.assign({}, result, {
        success: true,
        record: next,
        message: action === 'create' ? 'El registro se creó correctamente.' : 'El registro se actualizó correctamente.'
      }),
      auditAfter: next
    };
  });
}

function setSiteOrganizationMaintenanceStatus(entity, id, active) {
  const definition = _somGetEntityConfig_(entity);
  const config = definition.value;
  const identifier = _somText_(id);
  if (!identifier) throw new Error('Debes indicar el código del registro.');
  if (!config.hasActive) throw new Error('Este catálogo no tiene un campo de estado.');
  if (typeof active !== 'boolean') throw new Error('El estado debe ser verdadero o falso.');

  const authorization = _somRequirePermission_('CAMBIAR_ESTADO');
  const catalogs = _somLoadCatalogs_();
  const record = _somFindById_(catalogs[definition.key] || [], identifier);
  if (!record) throw new Error('No se encontró el registro cuyo estado deseas cambiar.');
  if (record.active === active) {
    return { success: true, unchanged: true, record: record, message: 'El registro ya tiene ese estado.' };
  }

  const next = Object.assign({}, record, { active: active });
  return _accessRunAudited_(
    authorization.auth,
    _somAuditEvent_('CAMBIAR_ESTADO', definition.key, record),
    function () {
      const result = SUNARPCore.updateRecord(
        _somSource_(config.sheetName),
        'id',
        identifier,
        { active: active }
      );
      return {
        value: Object.assign({}, result, {
          success: true,
          record: next,
          message: active ? 'El registro se activó correctamente.' : 'El registro se desactivó correctamente.'
        }),
        auditAfter: next
      };
    }
  );
}

function _somInternalDeleteBlockReason_(entity, record, catalogs) {
  const id = _somText_(record && record.id);
  if (entity === 'sede') {
    if ((catalogs.locales || []).some(item => _somText_(item.sede_id) === id)) {
      return 'tiene locales asociados.';
    }
    if ((catalogs.estructura_org || []).some(item => _somText_(item.sede_id) === id)) {
      return 'tiene estructuras orgánicas asociadas.';
    }
  } else if (entity === 'tipos_local') {
    if ((catalogs.locales || []).some(item => _somText_(item.tipo_local_id) === id)) {
      return 'está utilizado por uno o más locales.';
    }
  } else if (entity === 'locales') {
    if ((catalogs.locales || []).some(item => _somText_(item.parent_id) === id)) {
      return 'tiene locales dependientes.';
    }
    if ((catalogs.estructura_local || []).some(item => _somText_(item.local_id) === id)) {
      return 'está vinculado a la relación estructura_local.';
    }
  } else if (entity === 'tipos_estructura') {
    if ((catalogs.estructura_org || []).some(item => _somText_(item.tipo_estructura_id) === id)) {
      return 'está utilizado por una o más estructuras orgánicas.';
    }
  } else if (entity === 'estructura_org') {
    if ((catalogs.estructura_org || []).some(item => _somText_(item.parent_id) === id)) {
      return 'tiene estructuras orgánicas dependientes.';
    }
    if ((catalogs.estructura_local || []).some(item => _somText_(item.estructura_id) === id)) {
      return 'está vinculado a la relación estructura_local.';
    }
  }
  return '';
}

function _somAssertNoDirectoryAssignments_(localId) {
  const source = _somSource_('asignaciones', 'DIRECTORY');
  const headers = ['asignacion_id', 'local_id'];
  const result = SUNARPCore.findRecordsByFields(
    source,
    { local_id: _somText_(localId) },
    {
      searchField: 'local_id',
      matchCase: true,
      requiredHeaders: headers,
      projectionFields: headers
    }
  );
  if (Number(result && result.total) > 0) {
    throw new Error('No se puede eliminar el local porque está utilizado en asignaciones del Directorio telefónico.');
  }
}

function deleteSiteOrganizationMaintenanceRecord(entity, id) {
  const definition = _somGetEntityConfig_(entity);
  const config = definition.value;
  const identifier = _somText_(id);
  if (!identifier) throw new Error('Debes indicar el código del registro que deseas eliminar.');

  const authorization = _somRequirePermission_('ELIMINAR');
  const catalogs = _somLoadCatalogs_();
  const record = _somFindById_(catalogs[definition.key] || [], identifier);
  if (!record) throw new Error('No se encontró el registro que deseas eliminar.');

  const reason = _somInternalDeleteBlockReason_(definition.key, record, catalogs);
  if (reason) {
    throw new Error('No se puede eliminar ' + config.singular + ' "' + record.name + '" porque ' + reason);
  }
  if (definition.key === 'locales') _somAssertNoDirectoryAssignments_(identifier);

  return _accessRunAudited_(
    authorization.auth,
    _somAuditEvent_('ELIMINAR', definition.key, record),
    function () {
      const result = SUNARPCore.deleteRecord(_somSource_(config.sheetName), 'id', identifier);
      return {
        value: Object.assign({}, result, {
          success: true,
          message: 'El registro se eliminó correctamente.'
        }),
        auditAfter: null
      };
    }
  );
}
