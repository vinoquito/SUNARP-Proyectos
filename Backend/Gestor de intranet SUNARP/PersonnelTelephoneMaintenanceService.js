/**
 * CRUD de catálogos de Datos de personal y Directorio telefónico.
 *
 * Los cuatro catálogos con contrato físico confirmado se mantienen en
 * Global parameters. Las hojas operativas del Directorio se consultan
 * exclusivamente para proteger referencias; nunca se escriben desde aquí.
 */
const PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG = Object.freeze({
  sourceKey: 'MASTER_DATA',
  moduleCode: 'MANTENIMIENTOS',
  cacheTtlSeconds: 300,
  entities: Object.freeze({
    cargos: Object.freeze({
      sheetName: 'cargos',
      label: 'Cargos',
      singular: 'cargo',
      nameField: 'name',
      nameLabel: 'Nombre del cargo',
      headers: Object.freeze(['id', 'name', 'active']),
      hasActive: true,
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
      // No se habilita borrado físico hasta conocer la tabla y columna
      // exactas que contienen las referencias a tipos de teléfono.
      deletionSupported: false,
      reference: null
    })
  })
});

function _ptmText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function _ptmNormalizeKey_(value) {
  return _ptmText_(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function _ptmGetEntityConfig_(entity) {
  const key = _ptmText_(entity).toLowerCase();
  const config = PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.entities[key];
  if (!config) {
    throw new Error('El mantenimiento solicitado no está disponible.');
  }
  return { key: key, value: config };
}

function _ptmSource_(sourceKey, sheetName) {
  return getIntranetDataSource(sourceKey, sheetName, 1);
}

/**
 * Todos los mantenimientos del módulo comparten su ámbito global exclusivo.
 * La comprobación se repite en backend en lectura, alta, edición y eliminación.
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

function _ptmLoadCatalog_(entity) {
  const definition = _ptmGetEntityConfig_(entity);
  const config = definition.value;
  const source = _ptmSource_(PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.sourceKey, config.sheetName);
  const request = {
    key: definition.key,
    source: source,
    requiredHeaders: config.headers
  };
  const cached = SUNARPCore.getOrBuildCachedValue(
    'personnel-telephone-maintenance:v1:' + definition.key,
    [source],
    function () {
      return SUNARPCore.listRecordsFromSources([request]);
    },
    PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.cacheTtlSeconds
  );

  if (!cached || !cached.value || !Array.isArray(cached.value[definition.key])) {
    throw new Error('No se pudo consultar el catálogo "' + config.sheetName + '".');
  }

  const records = cached.value[definition.key].map(function (record) {
    const normalized = {};
    config.headers.forEach(function (field) {
      if (field === 'id' || field === config.nameField) {
        normalized[field] = _ptmText_(record[field]);
      } else if (field === 'active') {
        normalized[field] = _ptmIsActive_(record[field]);
      }
    });
    return normalized;
  });

  const ids = new Set();
  records.forEach(function (record) {
    if (!record.id) throw new Error('El catálogo "' + config.sheetName + '" contiene un registro sin identificador.');
    if (!record[config.nameField]) {
      throw new Error('El registro "' + record.id + '" del catálogo "' + config.sheetName + '" no tiene nombre.');
    }
    if (ids.has(record.id)) {
      throw new Error('El identificador "' + record.id + '" está duplicado en la pestaña "' + config.sheetName + '".');
    }
    ids.add(record.id);
  });

  return { config: config, source: source, records: records };
}

function _ptmIsActive_(value) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = _ptmText_(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'si' || normalized === 'sí';
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
    canDelete: config.deletionSupported && has('ELIMINAR'),
    deleteUnavailableReason: config.deletionSupported
      ? ''
      : 'La eliminación está protegida porque aún no está documentada la tabla que contiene sus referencias.'
  };
}

/** Consulta autorizada de uno de los cuatro catálogos físicos confirmados. */
function getPersonnelTelephoneMaintenanceData(entity) {
  const definition = _ptmGetEntityConfig_(entity);
  const authorization = _ptmRequirePermission_('VER');
  const loaded = _ptmLoadCatalog_(definition.key);
  return {
    entity: definition.key,
    label: loaded.config.label,
    nameField: loaded.config.nameField,
    nameLabel: loaded.config.nameLabel,
    hasActive: loaded.config.hasActive,
    records: loaded.records,
    capabilities: _ptmBuildCapabilities_(
      authorization.auth,
      authorization.moduleId,
      loaded.config
    )
  };
}

function _ptmBuildAuditEvent_(action, entity, config, record) {
  return {
    accion: action + '_CATALOGO_MANTENIMIENTO',
    modulo: PERSONNEL_TELEPHONE_MAINTENANCE_CONFIG.moduleCode,
    tipo_entidad: config.sheetName.toUpperCase(),
    registro_id: _ptmText_(record && record.id),
    registro_nombre: _ptmText_(record && record[config.nameField]),
    detalle: action === 'CREAR'
      ? 'Registro de ' + config.label + '.'
      : action === 'EDITAR'
        ? 'Actualización de ' + config.label + '.'
        : 'Eliminación física de ' + config.label + '.',
    datos_antes: action === 'CREAR' ? null : record || null
  };
}

/**
 * Busca referencias exactas en hojas operativas del Directorio.
 * Core consulta únicamente las filas candidatas de la columna conductora.
 */
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
  const loaded = _ptmLoadCatalog_(definition.key);
  const id = _ptmText_(payload.id);
  const name = _ptmText_(payload[config.nameField]);

  if (!id) throw new Error('Ingresa el código del registro.');
  if (id.length > 80) throw new Error('El código no puede superar 80 caracteres.');
  if (!name) throw new Error('Ingresa ' + config.nameLabel.toLowerCase() + '.');
  if (name.length > 150) throw new Error('El nombre no puede superar 150 caracteres.');

  const current = loaded.records.find(function (record) { return record.id === id; }) || null;
  if (action === 'create' && current) {
    throw new Error('Ya existe el código "' + id + '" en el catálogo "' + config.sheetName + '".');
  }
  if (action === 'edit' && !current) {
    throw new Error('No se encontró el registro que deseas modificar.');
  }

  const next = { id: action === 'edit' ? current.id : id };
  next[config.nameField] = name;

  if (config.hasActive) {
    if (typeof payload.active !== 'boolean') {
      throw new Error('El estado del registro debe ser verdadero o falso.');
    }
    next.active = payload.active;
  }

  // condicion_cargo se almacena en asignaciones como texto funcional.
  // No se renombra mientras alguna asignación conserve el valor anterior.
  if (action === 'edit' &&
      definition.key === 'condicion_cargo' &&
      _ptmNormalizeKey_(current.name) !== _ptmNormalizeKey_(name)) {
    const references = _ptmFindReferences_(config, current);
    if (Number(references && references.total) > 0) {
      throw new Error('No se puede cambiar el nombre de esta condición porque está utilizada en asignaciones.');
    }
  }

  const event = _ptmBuildAuditEvent_(action === 'create' ? 'CREAR' : 'EDITAR', definition.key, config, current || next);

  return _accessRunAudited_(
    authorization.auth,
    event,
    function () {
      let result;
      if (action === 'create') {
        result = SUNARPCore.insertRecord(
          loaded.source,
          next,
          { idField: 'id' }
        );
      } else {
        const updates = {};
        updates[config.nameField] = name;
        if (config.hasActive) updates.active = next.active;
        result = SUNARPCore.updateRecord(
          loaded.source,
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

function deletePersonnelTelephoneMaintenanceRecord(entity, id) {
  const definition = _ptmGetEntityConfig_(entity);
  const config = definition.value;
  const identifier = _ptmText_(id);
  if (!identifier) throw new Error('Debes indicar el código del registro que deseas eliminar.');
  if (!config.deletionSupported || !config.reference) {
    throw new Error('La eliminación está protegida porque no se ha documentado la tabla que contiene las referencias de este catálogo.');
  }

  const authorization = _ptmRequirePermission_('ELIMINAR');
  const loaded = _ptmLoadCatalog_(definition.key);
  const record = loaded.records.find(function (item) { return item.id === identifier; }) || null;
  if (!record) throw new Error('No se encontró el registro que deseas eliminar.');

  _ptmAssertNotReferenced_(config, record);

  return _accessRunAudited_(
    authorization.auth,
    _ptmBuildAuditEvent_('ELIMINAR', definition.key, config, record),
    function () {
      const result = SUNARPCore.deleteRecord(loaded.source, 'id', identifier);
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
