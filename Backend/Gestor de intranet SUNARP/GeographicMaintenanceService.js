/**
 * Mantenimiento centralizado de catálogos geográficos.
 *
 * Las fuentes maestras son las pestañas plurales de Global parameters.
 * Se leen sus valores visibles para conservar códigos UBIGEO con ceros
 * iniciales (01, 0101, 010101). Core administra las generaciones de caché
 * y ejecuta todas las escrituras.
 */
const GEOGRAPHIC_MAINTENANCE_CONFIG = Object.freeze({
  sourceKey: 'MASTER_DATA',
  moduleCode: 'MANTENIMIENTOS',
  sheets: Object.freeze({
    departments: 'departamentos',
    provinces: 'provincias',
    districts: 'distritos'
  }),
  headers: Object.freeze({
    departments: Object.freeze(['id', 'name']),
    provinces: Object.freeze(['id', 'name', 'id_departamento']),
    districts: Object.freeze(['id', 'name', 'id_provincia'])
  }),
  idWidths: Object.freeze({
    departments: 2,
    provinces: 4,
    districts: 6
  })
});

const GEOGRAPHIC_MAINTENANCE_CACHE_TTL_SECONDS = 300;

function _geoText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

/**
 * Core v16 devuelve valores brutos en listRecordsFromSources. En las fuentes
 * geográficas, algunas celdas numéricas se muestran con ceros iniciales.
 * Reconstruye el ancho UBIGEO conocido sin convertir cadenas ya formateadas.
 */
function _geoNormalizeCode_(value, width) {
  const code = _geoText_(value);
  if (!/^\d+$/.test(code) || code.length > width) return code;
  return code.padStart(width, '0');
}

function _geoNameKey_(value) {
  return _geoText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function _geoGetEntityConfig_(entity) {
  const key = _geoText_(entity).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(GEOGRAPHIC_MAINTENANCE_CONFIG.sheets, key)) {
    throw new Error('El mantenimiento geográfico indicado no existe.');
  }
  return {
    key: key,
    sheetName: GEOGRAPHIC_MAINTENANCE_CONFIG.sheets[key],
    headers: GEOGRAPHIC_MAINTENANCE_CONFIG.headers[key],
    idWidth: GEOGRAPHIC_MAINTENANCE_CONFIG.idWidths[key],
    parentField: key === 'provinces'
      ? 'id_departamento'
      : key === 'districts'
        ? 'id_provincia'
        : ''
  };
}

function _geoSource_(entity) {
  const config = _geoGetEntityConfig_(entity);
  return getIntranetDataSource(
    GEOGRAPHIC_MAINTENANCE_CONFIG.sourceKey,
    config.sheetName,
    1
  );
}

/**
 * Exige el permiso de la operación y un ámbito TOTAL exclusivo.
 * Los catálogos geográficos son compartidos y no admiten ámbitos parciales.
 */
function _geoRequirePermission_(operation) {
  const code = 'MANTENIMIENTOS_' + _geoText_(operation).toUpperCase();
  const auth = _accessRequirePermission_(code, GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode);
  const moduleId = _accessResolveModuleId_(auth, GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode);
  const moduleAccess = _accessGetModuleAccess_(auth, moduleId);
  const scopes = moduleAccess && Array.isArray(moduleAccess.scopes)
    ? moduleAccess.scopes
    : [];
  const exclusiveTotal = scopes.length === 1 &&
    _geoText_(scopes[0].tipo_ambito_id || scopes[0].tipo_ambito).toUpperCase() === 'TOTAL' &&
    !_geoText_(scopes[0].referencia_id);
  const inGlobalScope = exclusiveTotal &&
    SUNARPCore.authorizationIsRecordInScope(auth, moduleId, {}, []);

  if (!inGlobalScope) {
    _accessWriteAudit_(auth, {
      accion: 'AUTORIZACION_DENEGADA',
      modulo: GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode,
      tipo_entidad: 'CATALOGO_GEOGRAFICO',
      registro_id: code,
      registro_nombre: code,
      resultado: 'DENEGADO',
      detalle: 'La administración de catálogos geográficos requiere un ámbito TOTAL exclusivo en MANTENIMIENTOS.'
    });
    throw new Error('No tienes un ámbito TOTAL autorizado para administrar los catálogos geográficos.');
  }

  return {
    auth: auth,
    moduleId: moduleId
  };
}

function _geoGetSources_() {
  return [
    _geoSource_('departments'),
    _geoSource_('provinces'),
    _geoSource_('districts')
  ];
}

/**
 * Core aporta una caché derivada de las tres generaciones de fuente.
 * La lectura de valores visibles es necesaria porque los códigos territoriales
 * pueden tener formato numérico con ceros iniciales.
 */
function _geoLoadCatalogs_() {
  const requests = Object.keys(GEOGRAPHIC_MAINTENANCE_CONFIG.sheets).map(entity => ({
    key: entity,
    source: _geoSource_(entity),
    requiredHeaders: GEOGRAPHIC_MAINTENANCE_CONFIG.headers[entity],
    valueMode: 'display'
  }));
  const sources = requests.map(request => request.source);
  const cached = SUNARPCore.getOrBuildCachedValue(
    'geographic-maintenance-display-catalogs-v1',
    sources,
    function () {
      return SUNARPCore.listRecordsFromSources(requests);
    },
    GEOGRAPHIC_MAINTENANCE_CACHE_TTL_SECONDS
  );

  if (!cached || !cached.value) {
    throw new Error('No se pudieron consultar los catálogos geográficos.');
  }

  const catalogs = {};
  requests.forEach(request => {
    catalogs[request.key] = (cached.value[request.key] || []).map(record => {
      const normalized = {};
      const definition = _geoGetEntityConfig_(request.key);
      request.requiredHeaders.forEach(field => {
        if (field === 'id') {
          normalized[field] = _geoNormalizeCode_(record[field], definition.idWidth);
        } else if (field === 'id_departamento') {
          normalized[field] = _geoNormalizeCode_(record[field], 2);
        } else if (field === 'id_provincia') {
          normalized[field] = _geoNormalizeCode_(record[field], 4);
        } else {
          normalized[field] = _geoText_(record[field]);
        }
      });
      return normalized;
    });
  });

  // Verificar integridad referencial antes de entregar o modificar datos.
  const departmentsById = new Map();
  (catalogs.departments || []).forEach(record => {
    const id = _geoText_(record.id);
    if (!_geoText_(record.name)) {
      throw new Error('El departamento "' + id + '" no tiene un nombre válido.');
    }
    if (!/^\d{2}$/.test(id)) {
      throw new Error('El identificador del departamento "' + id +
        '" no tiene el formato geográfico de dos dígitos.');
    }
    if (departmentsById.has(id)) {
      throw new Error('El identificador "' + id + '" está duplicado en la pestaña "departamentos".');
    }
    departmentsById.set(id, record);
  });

  const provincesById = new Map();
  (catalogs.provinces || []).forEach(record => {
    const id = _geoText_(record.id);
    if (!_geoText_(record.name)) {
      throw new Error('La provincia "' + id + '" no tiene un nombre válido.');
    }
    if (provincesById.has(id)) {
      throw new Error('El identificador "' + id + '" está duplicado en la pestaña "provincias".');
    }
    const parent = departmentsById.get(_geoText_(record.id_departamento));
    if (!parent) {
      throw new Error('La provincia "' + id + '" referencia un departamento inexistente: "' +
        _geoText_(record.id_departamento) + '".');
    }
    if (!/^\d{4}$/.test(id) || id.slice(0, 2) !== _geoText_(record.id_departamento)) {
      throw new Error('El código de la provincia "' + id +
        '" no conserva el prefijo del departamento relacionado.');
    }
    provincesById.set(id, record);
  });

  const districtsById = new Map();
  (catalogs.districts || []).forEach(record => {
    const id = _geoText_(record.id);
    if (!_geoText_(record.name)) {
      throw new Error('El distrito "' + id + '" no tiene un nombre válido.');
    }
    if (districtsById.has(id)) {
      throw new Error('El identificador "' + id + '" está duplicado en la pestaña "distritos".');
    }
    const province = provincesById.get(_geoText_(record.id_provincia));
    if (!province) {
      throw new Error('El distrito "' + id + '" referencia una provincia inexistente: "' +
        _geoText_(record.id_provincia) + '".');
    }
    if (!/^\d{6}$/.test(id) || id.slice(0, 4) !== _geoText_(record.id_provincia)) {
      throw new Error('El código del distrito "' + id +
        '" no conserva el prefijo de la provincia relacionada.');
    }
    districtsById.set(id, record);
  });

  return catalogs;
}

function _geoFindById_(records, id) {
  const expected = _geoText_(id);
  return (records || []).find(record => _geoText_(record.id) === expected) || null;
}

function _geoAssertUniqueName_(records, name, parentField, parentId, excludedId) {
  const normalizedName = _geoNameKey_(name);
  const duplicate = (records || []).some(record => {
    if (_geoText_(record.id) === _geoText_(excludedId)) return false;
    if (_geoNameKey_(record.name) !== normalizedName) return false;
    return !parentField || _geoText_(record[parentField]) === _geoText_(parentId);
  });

  if (duplicate) {
    throw new Error(parentField
      ? 'Ya existe un registro con ese nombre dentro de la relación seleccionada.'
      : 'Ya existe un departamento con ese nombre.');
  }
}

/**
 * Los identificadores geográficos siguen la longitud jerárquica consumida
 * por Agentes SUNARP: departamento (2), provincia (4), distrito (6).
 * Los dos últimos dígitos se asignan en secuencia dentro de su padre.
 */
function _geoGenerateId_(entity, catalogs, parentId) {
  const config = _geoGetEntityConfig_(entity);
  const prefix = config.parentField ? _geoText_(parentId) : '';
  const suffixWidth = config.idWidth - prefix.length;

  if (config.parentField && (!prefix || prefix.length !== config.idWidth - 2 || !/^\d+$/.test(prefix))) {
    throw new Error('La referencia seleccionada no tiene un código territorial válido.');
  }

  const records = catalogs[config.key] || [];
  const validFormat = new RegExp('^\\d{' + config.idWidth + '}$');
  let maximum = 0;

  records.forEach(record => {
    const id = _geoText_(record.id);
    if (!validFormat.test(id)) {
      throw new Error(
        'No se puede generar un código seguro porque existen identificadores con formato distinto en "' +
        config.sheetName + '". No se modificó ningún registro.'
      );
    }

    if (config.parentField) {
      const recordParentId = _geoText_(record[config.parentField]);
      if (!recordParentId || id.slice(0, recordParentId.length) !== recordParentId ||
          recordParentId.length !== config.idWidth - 2) {
        throw new Error(
          'La jerarquía de códigos de "' + config.sheetName +
          '" contiene una referencia incompatible. No se modificó ningún registro.'
        );
      }
      if (recordParentId !== prefix) return;
    }

    const suffix = prefix ? id.slice(prefix.length) : id;
    maximum = Math.max(maximum, Number(suffix));
  });

  const next = maximum + 1;
  if (next > Math.pow(10, suffixWidth) - 1) {
    throw new Error('No quedan códigos disponibles dentro del rango territorial del registro seleccionado.');
  }
  return prefix + String(next).padStart(suffixWidth, '0');
}

function _geoBuildResponse_(catalogs, auth, moduleId) {
  const departmentMap = new Map((catalogs.departments || []).map(item => [item.id, item]));
  const provinceMap = new Map((catalogs.provinces || []).map(item => [item.id, item]));

  const departments = (catalogs.departments || []).map(item => ({
    id: item.id,
    name: item.name
  }));

  const provinces = (catalogs.provinces || []).map(item => {
    const parent = departmentMap.get(item.id_departamento);
    return {
      id: item.id,
      name: item.name,
      id_departamento: item.id_departamento,
      departamento: parent ? parent.name : 'Departamento no disponible'
    };
  });

  const districts = (catalogs.districts || []).map(item => {
    const province = provinceMap.get(item.id_provincia);
    const department = province
      ? departmentMap.get(province.id_departamento)
      : null;
    return {
      id: item.id,
      name: item.name,
      id_provincia: item.id_provincia,
      provincia: province ? province.name : 'Provincia no disponible',
      departamento: department ? department.name : 'Departamento no disponible',
      provincia_departamento: (province ? province.name : 'Provincia no disponible') +
        ' — ' + (department ? department.name : 'Departamento no disponible')
    };
  });

  const has = operation => SUNARPCore.authorizationHasPermission(
    auth,
    'MANTENIMIENTOS_' + operation,
    moduleId
  );

  return {
    departments: departments,
    provinces: provinces,
    districts: districts,
    capabilities: {
      canCreate: has('CREAR'),
      canEdit: has('EDITAR'),
      canDelete: has('ELIMINAR'),
      // Agentes SUNARP almacena distrito_id en una hoja del Spreadsheet activo
      // de su proyecto. No está demostrado que sea el mismo archivo MASTER_DATA.
      // Hasta validar esa fuente, el backend impide borrar distritos para evitar
      // dejar agentes con referencias huérfanas.
      canDeleteDistricts: false
    }
  };
}

/**
 * Lectura del catálogo completo en una sola operación cacheada por generación.
 */
function getGeographicMaintenanceData() {
  const authorization = _geoRequirePermission_('VER');
  const catalogs = _geoLoadCatalogs_();
  return _geoBuildResponse_(catalogs, authorization.auth, authorization.moduleId);
}

function _geoBuildAuditEvent_(authorization, action, entity, record) {
  const config = _geoGetEntityConfig_(entity);
  return {
    accion: action + '_CATALOGO_GEOGRAFICO',
    modulo: GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode,
    tipo_entidad: config.sheetName.toUpperCase(),
    registro_id: _geoText_(record && record.id),
    registro_nombre: _geoText_(record && record.name),
    detalle: action === 'CREAR'
      ? 'Registro de ' + config.sheetName + '.'
      : action === 'EDITAR'
        ? 'Actualización de ' + config.sheetName + '.'
        : 'Eliminación física de ' + config.sheetName + '.',
    datos_antes: action === 'CREAR' ? null : record || null
  };
}

function saveGeographicCatalogRecord(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('No se recibieron los datos del registro geográfico.');
  }

  const entity = _geoText_(payload.entity).toLowerCase();
  const config = _geoGetEntityConfig_(entity);
  const action = _geoText_(payload.action).toLowerCase();
  if (action !== 'create' && action !== 'edit') {
    throw new Error('La operación del registro geográfico no es válida.');
  }

  const authorization = _geoRequirePermission_(action === 'create' ? 'CREAR' : 'EDITAR');
  const catalogs = _geoLoadCatalogs_();
  const records = catalogs[config.key] || [];
  const name = _geoText_(payload.name);

  if (!name) throw new Error('Ingresa el nombre del registro.');
  if (name.length > 150) throw new Error('El nombre no puede superar 150 caracteres.');

  const parentId = config.parentField ? _geoText_(payload[config.parentField]) : '';
  if (config.parentField && !parentId) {
    throw new Error(config.key === 'provinces'
      ? 'Selecciona el departamento al que pertenece la provincia.'
      : 'Selecciona la provincia a la que pertenece el distrito.');
  }

  if (config.key === 'provinces' && !_geoFindById_(catalogs.departments, parentId)) {
    throw new Error('El departamento seleccionado no existe en el catálogo.');
  }
  if (config.key === 'districts') {
    const parentProvince = _geoFindById_(catalogs.provinces, parentId);
    if (!parentProvince) {
      throw new Error('La provincia seleccionada no existe en el catálogo.');
    }
    if (!_geoFindById_(catalogs.departments, parentProvince.id_departamento)) {
      throw new Error('La provincia seleccionada no tiene un departamento válido asociado.');
    }
  }

  const source = _geoSource_(config.key);
  const parentField = config.parentField;
  const uniqueFields = parentField ? ['name', parentField] : ['name'];

  if (action === 'create') {
    _geoAssertUniqueName_(records, name, parentField, parentId, '');
    const id = _geoGenerateId_(config.key, catalogs, parentId);
    const record = { id: id, name: name };
    if (parentField) record[parentField] = parentId;

    return _accessRunAudited_(
      authorization.auth,
      _geoBuildAuditEvent_(authorization, 'CREAR', config.key, record),
      function () {
        const result = SUNARPCore.insertRecord(source, record, {
          idField: 'id',
          uniqueFields: uniqueFields
        });
        return {
          value: Object.assign({}, result, { id: id }),
          auditAfter: record
        };
      }
    );
  }

  const id = _geoText_(payload.id);
  if (!id) throw new Error('Debes indicar el identificador del registro que deseas modificar.');
  const existing = _geoFindById_(records, id);
  if (!existing) throw new Error('No se encontró el registro geográfico que deseas modificar.');

  if (parentField && _geoText_(existing[parentField]) !== parentId) {
    throw new Error(
      'No se puede cambiar el nivel superior de un registro existente: su código territorial identifica esa relación y puede estar referenciado por otros módulos. Modifica únicamente el nombre.'
    );
  }

  _geoAssertUniqueName_(records, name, parentField, parentId, id);
  const next = Object.assign({}, existing, { name: name });

  return _accessRunAudited_(
    authorization.auth,
    _geoBuildAuditEvent_(authorization, 'EDITAR', config.key, existing),
    function () {
      const result = SUNARPCore.updateRecord(
        source,
        'id',
        id,
        { name: name },
        { uniqueFields: uniqueFields }
      );
      return {
        value: Object.assign({}, result, { record: next }),
        auditAfter: next
      };
    }
  );
}

function deleteGeographicCatalogRecord(entity, id) {
  const config = _geoGetEntityConfig_(entity);
  const identifier = _geoText_(id);
  if (!identifier) throw new Error('Debes indicar el identificador del registro que deseas eliminar.');

  const authorization = _geoRequirePermission_('ELIMINAR');
  const catalogs = _geoLoadCatalogs_();
  const record = _geoFindById_(catalogs[config.key], identifier);
  if (!record) throw new Error('No se encontró el registro geográfico que deseas eliminar.');

  if (config.key === 'districts') {
    throw new Error(
      'La eliminación de distritos está temporalmente protegida porque Agentes SUNARP conserva referencias distrito_id en su propio archivo de datos. Primero debe verificarse esa fuente compartida para evitar referencias huérfanas.'
    );
  }

  if (config.key === 'departments') {
    const linked = (catalogs.provinces || []).some(item =>
      _geoText_(item.id_departamento) === identifier
    );
    if (linked) {
      throw new Error('No se puede eliminar el departamento porque tiene provincias relacionadas. Elimina primero las provincias que correspondan.');
    }
  }

  if (config.key === 'provinces') {
    const linked = (catalogs.districts || []).some(item =>
      _geoText_(item.id_provincia) === identifier
    );
    if (linked) {
      throw new Error('No se puede eliminar la provincia porque tiene distritos relacionados. Elimina primero los distritos que correspondan.');
    }
  }

  const source = _geoSource_(config.key);
  return _accessRunAudited_(
    authorization.auth,
    _geoBuildAuditEvent_(authorization, 'ELIMINAR', config.key, record),
    function () {
      const result = SUNARPCore.deleteRecord(source, 'id', identifier);
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

/**
 * Provisiona el módulo y los permisos una sola vez. Es idempotente y exige
 * un administrador global de ACCESOS. No asigna usuarios ni ámbitos:
 * estos deben configurarse expresamente desde Administración de accesos.
 *
 * Matriz coherente con los roles ya documentados:
 * ROL_ADMIN: todas las operaciones; ROL_EDITOR: VER/CREAR/EDITAR/CAMBIAR_ESTADO;
 * ROL_CONSULTA: VER.
 */
function initializeMaintenanceAccessCatalog() {
  const auth = _accessRequirePermission_('USUARIOS_ADMINISTRAR');
  const summary = {
    moduleId: '',
    permissionsCreated: 0,
    relationsCreated: 0,
    relationsReactivated: 0
  };

  return _accessRunAudited_(auth, {
    accion: 'INICIALIZAR_MODULO_MANTENIMIENTOS',
    modulo: GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode,
    tipo_entidad: 'MODULO',
    registro_id: 'MOD_MANTENIMIENTOS',
    registro_nombre: 'Módulos de mantenimiento',
    detalle: 'Provisionamiento idempotente del módulo y su matriz de permisos.'
  }, function () {
    const sheets = ACCESS_MANAGEMENT_CONFIG.sheets;
    const moduleMatches = _accessFindSecurityRecords_(
      sheets.modules,
      'codigo',
      [GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode],
      ACCESS_MANAGEMENT_FIELDS.modules
    );

    if (moduleMatches.length > 1) {
      throw new Error('El código MANTENIMIENTOS está duplicado en la pestaña Modulos.');
    }

    let module = moduleMatches[0] || null;
    if (module && !_accessIsActive_(module.active)) {
      throw new Error('El módulo MANTENIMIENTOS existe, pero está inactivo. No se reactivó automáticamente.');
    }

    if (!module) {
      const moduleId = _accessGenerateUniqueIdentifierFromSource_(
        sheets.modules,
        'MOD_',
        GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode,
        'modulo_id',
        ACCESS_MANAGEMENT_FIELDS.modules,
        50
      );
      module = {
        modulo_id: moduleId,
        codigo: GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode,
        nombre: 'Módulos de mantenimiento',
        descripcion: 'Administración centralizada de catálogos institucionales y geográficos.',
        active: true
      };
      SUNARPCore.insertRecord(
        _accessSecuritySource_(sheets.modules),
        module,
        { idField: 'modulo_id', uniqueFields: ['codigo'] }
      );
    }

    summary.moduleId = _accessText_(module.modulo_id);

    const operationIds = ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'];
    const operationRows = _accessFindSecurityRecords_(
      sheets.operations,
      'operacion_id',
      operationIds,
      ACCESS_MANAGEMENT_FIELDS.operations
    );
    operationIds.forEach(operationId => {
      if (operationRows.filter(item => _accessUpper_(item.operacion_id) === operationId).length !== 1) {
        throw new Error('La operación ' + operationId + ' no existe de forma única en Operaciones.');
      }
    });

    const roleAssignments = {
      ROL_ADMIN: operationIds,
      ROL_EDITOR: ['VER', 'CREAR', 'EDITAR'],
      ROL_CONSULTA: ['VER']
    };
    const roleIds = Object.keys(roleAssignments);
    const roles = _accessFindSecurityRecords_(
      sheets.roles,
      'rol_id',
      roleIds,
      ACCESS_MANAGEMENT_FIELDS.roles
    );

    roleIds.forEach(roleId => {
      const matches = roles.filter(item => _accessUpper_(item.rol_id) === roleId && _accessIsActive_(item.active));
      if (matches.length !== 1) {
        throw new Error('El rol ' + roleId + ' debe existir y estar activo para provisionar MANTENIMIENTOS.');
      }
    });

    const permissionByOperation = {};
    operationIds.forEach(operationId => {
      const code = _accessBuildPermissionCode_(
        GEOGRAPHIC_MAINTENANCE_CONFIG.moduleCode,
        operationId
      );
      const matches = _accessFindSecurityRecords_(
        sheets.permissions,
        'codigo',
        [code],
        ACCESS_MANAGEMENT_FIELDS.permissions
      );

      if (matches.length > 1) {
        throw new Error('El permiso ' + code + ' está duplicado.');
      }

      let permission = matches[0] || null;
      if (permission) {
        if (_accessText_(permission.modulo_id) !== summary.moduleId ||
            _accessUpper_(permission.operacion_id) !== operationId ||
            !_accessIsActive_(permission.active)) {
          throw new Error('El permiso ' + code + ' existe con una configuración incompatible o inactiva.');
        }
      } else {
        const permissionId = _accessGenerateUniqueIdentifierFromSource_(
          sheets.permissions,
          'PERM_',
          code,
          'permiso_id',
          ACCESS_MANAGEMENT_FIELDS.permissions,
          50
        );
        permission = {
          permiso_id: permissionId,
          codigo: code,
          modulo_id: summary.moduleId,
          operacion_id: operationId,
          descripcion: 'Permite ' + operationId.toLowerCase().replace(/_/g, ' ') +
            ' en los módulos de mantenimiento.',
          active: true
        };
        SUNARPCore.insertRecord(
          _accessSecuritySource_(sheets.permissions),
          permission,
          { idField: 'permiso_id', uniqueFields: ['codigo'] }
        );
        summary.permissionsCreated += 1;
      }
      permissionByOperation[operationId] = permission;
    });

    roleIds.forEach(roleId => {
      roleAssignments[roleId].forEach(operationId => {
        const permission = permissionByOperation[operationId];
        const relationSource = _accessSecuritySource_(sheets.rolePermissions);
        const relationResult = SUNARPCore.findRecordsByFields(
          relationSource,
          { rol_id: roleId },
          {
            searchField: 'rol_id',
            requiredHeaders: ACCESS_MANAGEMENT_FIELDS.rolePermissions,
            projectionFields: ACCESS_MANAGEMENT_FIELDS.rolePermissions
          }
        );
        const matches = (relationResult.records || []).filter(item =>
          _accessText_(item.rol_id) === roleId &&
          _accessText_(item.permiso_id) === _accessText_(permission.permiso_id)
        );

        if (matches.length > 1) {
          throw new Error('La relación del rol ' + roleId + ' con ' + permission.codigo + ' está duplicada.');
        }
        if (!matches.length) {
          SUNARPCore.insertRecord(
            relationSource,
            { rol_id: roleId, permiso_id: permission.permiso_id, active: true },
            { uniqueFields: ['rol_id', 'permiso_id'] }
          );
          summary.relationsCreated += 1;
        } else if (!_accessIsActive_(matches[0].active)) {
          SUNARPCore.updateRecordByFields(
            relationSource,
            { rol_id: roleId, permiso_id: permission.permiso_id },
            { active: true }
          );
          summary.relationsReactivated += 1;
        }
      });
    });

    return {
      value: Object.assign({ success: true, message: 'El módulo MANTENIMIENTOS quedó provisionado. Asigna usuarios y ámbitos desde Administración de accesos.' }, summary),
      auditAfter: summary
    };
  });
}
