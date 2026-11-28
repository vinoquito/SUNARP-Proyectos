/**
 * Mantenimientos de Datos de personal y Directorio telefónico.
 *
 * La pantalla carga cada grupo como una instantánea única, cacheada por
 * generaciones de SUNARP Core. El navegador conserva esa instantánea al
 * navegar entre pantallas y pestañas; las mutaciones actualizan el estado
 * local y Core invalida la caché de la fuente escrita.
 *
 * Las operaciones de hoja, caché e invalidación se delegan a SUNARP Core.
 * La interfaz utiliza los componentes compartidos de SUNARP UI.
 */
const PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG = Object.freeze({
  sourceKey: 'MASTER_DATA',
  moduleCode: 'MANTENIMIENTOS',
  cacheTtlSeconds: 300,
  groups: Object.freeze({
    'datos-personal': Object.freeze([
      'cargos',
      'condicion_cargo',
      'tipo_documento_identidad'
    ]),
    'directorio-telefonico': Object.freeze([
      'tipo_telefono'
    ])
  }),
  entities: Object.freeze({
    cargos: Object.freeze({
      sheetName: 'cargos',
      label: 'Cargos',
      singular: 'cargo',
      nameField: 'name',
      nameLabel: 'Nombre del cargo',
      headers: Object.freeze(['id', 'name', 'active']),
      hasActive: true,
      idPrefix: 'CARGO_',
      deletionSupported: true,
      reference: Object.freeze({
        sourceKey: 'DIRECTORY',
        sheetName: 'asignaciones',
        field: 'cargo_id',
        headers: Object.freeze(['asignacion_id', 'cargo_id']),
        match: 'id'
      })
    }),
    condicion_cargo: Object.freeze({
      sheetName: 'condicion_cargo',
      label: 'Condiciones de cargo',
      singular: 'condición de cargo',
      nameField: 'name',
      nameLabel: 'Nombre de la condición',
      headers: Object.freeze(['id', 'name', 'active']),
      hasActive: true,
      idPrefix: 'CONDICION_',
      deletionSupported: true,
      reference: Object.freeze({
        sourceKey: 'DIRECTORY',
        sheetName: 'asignaciones',
        field: 'condicion_cargo',
        headers: Object.freeze(['asignacion_id', 'condicion_cargo']),
        match: 'name-or-id'
      })
    }),
    tipo_documento_identidad: Object.freeze({
      sheetName: 'tipo_documento_identidad',
      label: 'Tipos de documento de identidad',
      singular: 'tipo de documento de identidad',
      nameField: 'name',
      nameLabel: 'Nombre del tipo de documento',
      headers: Object.freeze(['id', 'name']),
      hasActive: false,
      idStrategy: 'sequential-document-type',
      deletionSupported: true,
      reference: Object.freeze({
        sourceKey: 'DIRECTORY',
        sheetName: 'servidores datos personales',
        field: 'tipo_documento',
        headers: Object.freeze(['servidor_id', 'tipo_documento']),
        match: 'id'
      })
    }),
    tipo_telefono: Object.freeze({
      sheetName: 'tipo_telefono',
      label: 'Tipos de teléfono',
      singular: 'tipo de teléfono',
      nameField: 'nombre',
      nameLabel: 'Nombre del tipo de teléfono',
      headers: Object.freeze(['id', 'nombre', 'active']),
      hasActive: true,
      idPrefix: '',
      stripPhonePrefix: true,
      // El contrato de telefonos y su campo de referencia todavía no están
      // documentados; no se habilita la eliminación hasta verificarlo.
      deletionSupported: false,
      reference: null
    })
  })
});

function _ptmText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function _ptmNormalizeKey_(value) {
  return _ptmText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function _ptmIdentifierToken_(value) {
  return _ptmText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function _ptmGetEntityConfig_(entity) {
  const key = _ptmText_(entity).toLowerCase();
  const config = PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.entities[key];
  if (!config) {
    throw new Error('El mantenimiento solicitado no está disponible.');
  }
  return { key: key, value: config };
}

function _ptmGetGroupEntities_(group) {
  const key = _ptmText_(group).toLowerCase();
  const entities = PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.groups[key];
  if (!entities) throw new Error('El grupo de mantenimiento solicitado no está disponible.');
  return { key: key, entities: Array.from(entities) };
}

function _ptmSource_(sourceKey, sheetName) {
  return getIntranetDataSource(sourceKey, sheetName, 1);
}

/**
 * Todos los mantenimientos del módulo son catálogos institucionales
 * compartidos: exigen permiso efectivo y ámbito TOTAL exclusivo.
 */
function _ptmRequirePermission_(operation) {
  const code = 'MANTENIMIENTOS_' + _ptmText_(operation).toUpperCase();
  const auth = _accessRequirePermission_(code, PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.moduleCode);
  const moduleId = _accessResolveModuleId_(auth, PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.moduleCode);
  const moduleAccess = _accessGetModuleAccess_(auth, moduleId);
  const scopes = moduleAccess && Array.isArray(moduleAccess.scopes) ? moduleAccess.scopes : [];
  const exclusiveTotal = scopes.length === 1 &&
    _ptmText_(scopes[0].tipo_ambito_id || scopes[0].tipo_ambito).toUpperCase() === 'TOTAL' &&
    !_ptmText_(scopes[0].referencia_id);
  const inGlobalScope = exclusiveTotal &&
    SUNARPCore.authorizationIsRecordInScope(auth, moduleId, {}, []);

  if (!inGlobalScope) {
    _accessWriteAudit_(auth, {
      accion: 'AUTORIZACION_DENEGADA',
      modulo: PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.moduleCode,
      tipo_entidad: 'CATALOGO_MANTENIMIENTO',
      registro_id: code,
      registro_nombre: code,
      resultado: 'DENEGADO',
      detalle: 'La administración de catálogos requiere un ámbito TOTAL exclusivo en MANTENIMIENTOS.'
    });
    throw new Error('No tienes un ámbito TOTAL autorizado para administrar los catálogos de mantenimiento.');
  }

  return { auth: auth, moduleId: moduleId };
}

function _ptmIsActive_(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return ['TRUE', '1', 'SI', 'SÍ', 'YES'].includes(_ptmText_(value).toUpperCase());
}

function _ptmNormalizeRecords_(entity, records) {
  const config = _ptmGetEntityConfig_(entity).value;
  const ids = new Set();

  return (records || []).map(function (record) {
    const normalized = {};
    config.headers.forEach(function (field) {
      if (field === 'id' || field === config.nameField) {
        normalized[field] = _ptmText_(record[field]);
      } else if (field === 'active') {
        normalized[field] = _ptmIsActive_(record[field]);
      }
    });

    if (!normalized.id) {
      throw new Error('El catálogo "' + config.sheetName + '" contiene un registro sin identificador.');
    }
    if (!normalized[config.nameField]) {
      throw new Error('El registro "' + normalized.id + '" del catálogo "' + config.sheetName + '" no tiene nombre.');
    }
    if (ids.has(normalized.id)) {
      throw new Error('El identificador "' + normalized.id + '" está duplicado en la pestaña "' + config.sheetName + '".');
    }
    ids.add(normalized.id);
    return normalized;
  });
}

/**
 * Una sola llamada de Core carga todos los catálogos de la pantalla.
 * Cada caché depende de las generaciones de sus fuentes maestras.
 */
function _ptmLoadGroup_(group) {
  const definition = _ptmGetGroupEntities_(group);
  const requests = definition.entities.map(function (entity) {
    const config = _ptmGetEntityConfig_(entity).value;
    return {
      key: entity,
      source: _ptmSource_(PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.sourceKey, config.sheetName),
      requiredHeaders: config.headers,
      valueMode: 'display'
    };
  });
  const sources = requests.map(function (request) { return request.source; });
  const cacheKey = 'personnel-telephone-maintenance:display:v2:' + definition.key;
  const cached = SUNARPCore.getOrBuildCachedValue(
    cacheKey,
    sources,
    function () {
      return SUNARPCore.listRecordsFromSources(requests);
    },
    PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.cacheTtlSeconds
  );

  if (!cached || !cached.value) {
    throw new Error('No se pudieron consultar los catálogos del grupo "' + definition.key + '".');
  }

  const catalogs = {};
  definition.entities.forEach(function (entity) {
    const sourceResult = cached.value[entity];
    if (!Array.isArray(sourceResult)) {
      throw new Error('SUNARP Core no devolvió el catálogo "' + entity + '".');
    }
    catalogs[entity] = _ptmNormalizeRecords_(entity, sourceResult);
  });
  return catalogs;
}

function _ptmBuildCapabilities_(auth, moduleId, config) {
  const has = function (operation) {
    return SUNARPCore.authorizationHasPermission(
      auth,
      'MANTENIMIENTOS_' + operation,
      moduleId
    ) === true;
  };
  return {
    canCreate: has('CREAR'),
    canEdit: has('EDITAR'),
    canChangeStatus: config.hasActive && has('CAMBIAR_ESTADO'),
    canDeletePermission: has('ELIMINAR'),
    canDelete: config.deletionSupported && has('ELIMINAR'),
    canViewHistory: has('VER'),
    deleteUnavailableReason: config.deletionSupported
      ? ''
      : 'La eliminación está protegida porque todavía no se ha documentado la tabla que contiene las referencias de este catálogo.'
  };
}

/** Consulta autorizada de todos los catálogos de una pantalla en una sola carga. */
function getPersonnelTelephoneMaintenanceData(group) {
  const authorization = _ptmRequirePermission_('VER');
  const definition = _ptmGetGroupEntities_(group);
  const catalogs = _ptmLoadGroup_(definition.key);
  const result = {
    group: definition.key,
    entities: {}
  };

  definition.entities.forEach(function (entity) {
    const config = _ptmGetEntityConfig_(entity).value;
    result.entities[entity] = {
      entity: entity,
      label: config.label,
      nameField: config.nameField,
      nameLabel: config.nameLabel,
      hasActive: config.hasActive,
      records: catalogs[entity],
      capabilities: _ptmBuildCapabilities_(
        authorization.auth,
        authorization.moduleId,
        config
      )
    };
  });
  return result;
}

function _ptmBuildAuditEvent_(action, config, record) {
  return {
    accion: action + '_CATALOGO_MANTENIMIENTO',
    modulo: PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.moduleCode,
    tipo_entidad: 'CATALOGO_MANTENIMIENTO',
    registro_id: _ptmText_(record && record.id),
    registro_nombre: _ptmText_(record && record[config.nameField]),
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

function _ptmFindReferences_(config, record) {
  const reference = config.reference;
  if (!reference) return { records: [], total: 0 };

  const source = _ptmSource_(reference.sourceKey, reference.sheetName);
  const nameValue = _ptmText_(record && record[config.nameField]);
  const idValue = _ptmText_(record && record.id);
  const values = reference.match === 'name-or-id'
    ? Array.from(new Set([nameValue, idValue].filter(Boolean)))
    : [idValue];

  if (!values.length) return { records: [], total: 0 };

  return SUNARPCore.findRecordsByFields(
    source,
    { [reference.field]: values },
    {
      searchField: reference.field,
      matchCase: true,
      requiredHeaders: reference.headers,
      projectionFields: reference.headers
    }
  );
}

function _ptmAssertNotReferenced_(config, record) {
  const matches = _ptmFindReferences_(config, record);
  if (Number(matches && matches.total) > 0) {
    throw new Error(
      'No se puede eliminar ' + config.singular +
      ' "' + _ptmText_(record[config.nameField]) +
      '" porque está utilizado en ' + config.reference.sheetName + '.'
    );
  }
}

function _ptmGenerateIdentifier_(entity, name, records) {
  const definition = _ptmGetEntityConfig_(entity);
  const config = definition.value;
  const currentRecords = records || [];

  if (config.idStrategy === 'sequential-document-type') {
    let maximum = 0;
    currentRecords.forEach(function (record) {
      const match = _ptmText_(record.id).match(/^TD_(\d+)$/i);
      if (match) maximum = Math.max(maximum, Number(match[1]));
    });
    return 'TD_' + String(maximum + 1).padStart(3, '0');
  }

  let token = _ptmIdentifierToken_(name);
  if (config.stripPhonePrefix) token = token.replace(/^TELEFONO_/, '');
  if (!token) throw new Error('Ingresa un nombre válido para generar el código.');

  const prefix = config.idPrefix || '';
  const maximumLength = 80;
  const base = (prefix + token).slice(0, maximumLength);
  const used = new Set(currentRecords.map(function (record) {
    return _ptmText_(record.id).toUpperCase();
  }));
  if (!used.has(base.toUpperCase())) return base;

  for (let suffixNumber = 2; suffixNumber < 10000; suffixNumber++) {
    const suffix = '_' + suffixNumber;
    const candidate = base.slice(0, maximumLength - suffix.length) + suffix;
    if (!used.has(candidate.toUpperCase())) return candidate;
  }
  throw new Error('No se pudo generar un código único para el registro.');
}

function _ptmAssertUniqueName_(records, name, nameField, excludedId) {
  const expected = _ptmNormalizeKey_(name);
  const duplicate = (records || []).some(function (record) {
    if (_ptmText_(record.id) === _ptmText_(excludedId)) return false;
    return _ptmNormalizeKey_(record[nameField]) === expected;
  });
  if (duplicate) throw new Error('Ya existe un registro con ese nombre en el catálogo.');
}

function savePersonnelTelephoneMaintenanceRecord(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('No se recibieron los datos del mantenimiento.');
  }

  const definition = _ptmGetEntityConfig_(payload.entity);
  const config = definition.value;
  const action = _ptmText_(payload.action).toLowerCase();
  if (action !== 'create' && action !== 'edit') {
    throw new Error('La operación del mantenimiento no es válida.');
  }

  const authorization = _ptmRequirePermission_(action === 'create' ? 'CREAR' : 'EDITAR');
  const catalogs = _ptmLoadGroup_(
    definition.key === 'tipo_telefono' ? 'directorio-telefonico' : 'datos-personal'
  );
  const records = catalogs[definition.key] || [];
  const id = _ptmText_(payload.id);
  const name = _ptmText_(payload[config.nameField]);

  if (!name) throw new Error('Ingresa ' + config.nameLabel.toLowerCase() + '.');
  if (name.length > 150) throw new Error('El nombre no puede superar 150 caracteres.');

  const current = records.find(function (record) { return record.id === id; }) || null;
  if (action === 'create') {
    const expectedId = _ptmGenerateIdentifier_(definition.key, name, records);
    if (!id || id !== expectedId) {
      throw new Error('El código generado cambió o no corresponde al nombre. Actualiza el nombre y vuelve a guardar.');
    }
    if (records.some(function (record) { return record.id === id; })) {
      throw new Error('Ya existe el código "' + id + '" en el catálogo "' + config.sheetName + '".');
    }
    _ptmAssertUniqueName_(records, name, config.nameField, '');
  } else {
    if (!id || !current) throw new Error('No se encontró el registro que deseas modificar.');
    _ptmAssertUniqueName_(records, name, config.nameField, id);
  }

  if (action === 'edit' &&
      definition.key === 'condicion_cargo' &&
      _ptmNormalizeKey_(current.name) !== _ptmNormalizeKey_(name)) {
    const references = _ptmFindReferences_(config, current);
    if (Number(references && references.total) > 0) {
      throw new Error('No se puede cambiar el nombre de esta condición porque está utilizada en asignaciones.');
    }
  }

  const next = { id: action === 'edit' ? current.id : id };
  next[config.nameField] = name;
  if (config.hasActive) {
    // Los registros nuevos nacen activos. El estado se cambia desde la celda.
    next.active = action === 'create' ? true : current.active === true;
  }

  const event = _ptmBuildAuditEvent_(action === 'create' ? 'CREAR' : 'EDITAR', config, current || next);
  return _accessRunAudited_(
    authorization.auth,
    event,
    function () {
      let result;
      if (action === 'create') {
        result = SUNARPCore.insertRecord(
          _ptmSource_(PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.sourceKey, config.sheetName),
          next,
          { idField: 'id' }
        );
      } else {
        const updates = {};
        updates[config.nameField] = name;
        result = SUNARPCore.updateRecord(
          _ptmSource_(PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.sourceKey, config.sheetName),
          'id',
          current.id,
          updates
        );
      }
      return {
        value: Object.assign({}, result, { record: next }),
        auditAfter: next
      };
    }
  );
}

function setPersonnelTelephoneMaintenanceStatus(entity, id, active) {
  const definition = _ptmGetEntityConfig_(entity);
  const config = definition.value;
  const identifier = _ptmText_(id);
  if (!identifier) throw new Error('Debes indicar el código del registro.');
  if (!config.hasActive) throw new Error('Este catálogo no tiene un campo de estado.');
  if (typeof active !== 'boolean') throw new Error('El estado debe ser verdadero o falso.');

  const authorization = _ptmRequirePermission_('CAMBIAR_ESTADO');
  const group = definition.key === 'tipo_telefono' ? 'directorio-telefonico' : 'datos-personal';
  const catalogs = _ptmLoadGroup_(group);
  const record = (catalogs[definition.key] || []).find(function (item) {
    return item.id === identifier;
  }) || null;
  if (!record) throw new Error('No se encontró el registro cuyo estado deseas cambiar.');
  if (record.active === active) {
    return { success: true, unchanged: true, record: record, message: 'El registro ya tiene ese estado.' };
  }

  const next = Object.assign({}, record, { active: active });
  return _accessRunAudited_(
    authorization.auth,
    _ptmBuildAuditEvent_('CAMBIAR_ESTADO', config, record),
    function () {
      const result = SUNARPCore.updateRecord(
        _ptmSource_(PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.sourceKey, config.sheetName),
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

function deletePersonnelTelephoneMaintenanceRecord(entity, id) {
  const definition = _ptmGetEntityConfig_(entity);
  const config = definition.value;
  const identifier = _ptmText_(id);
  if (!identifier) throw new Error('Debes indicar el código del registro que deseas eliminar.');
  if (!config.deletionSupported || !config.reference) {
    throw new Error('La eliminación está protegida porque no se ha documentado la tabla que contiene las referencias de este catálogo.');
  }

  const authorization = _ptmRequirePermission_('ELIMINAR');
  const group = definition.key === 'tipo_telefono' ? 'directorio-telefonico' : 'datos-personal';
  const catalogs = _ptmLoadGroup_(group);
  const record = (catalogs[definition.key] || []).find(function (item) {
    return item.id === identifier;
  }) || null;
  if (!record) throw new Error('No se encontró el registro que deseas eliminar.');

  _ptmAssertNotReferenced_(config, record);

  return _accessRunAudited_(
    authorization.auth,
    _ptmBuildAuditEvent_('ELIMINAR', config, record),
    function () {
      const result = SUNARPCore.deleteRecord(
        _ptmSource_(PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.sourceKey, config.sheetName),
        'id',
        identifier
      );
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
