// ============================================================
// GESTOR DE CONTENIDOS SUNARP
// Google Apps Script + Google Sheets
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: '1bMMjklKWjHAM8GfWPFLYmOxz-B20lbsyzeOuOabRh-0',
  MASTER_SPREADSHEET_ID: '17DLCau1UjHaqgnGWrNAQ6mB4vUULZuuCsfPSIHdhoiQ',
  SECURITY_SPREADSHEET_ID: '1eLStGWsZUmqllXrpwsU_XJL58B-QzGc2a27EygkErgE',

  SHEET_USERS: 'Usuarios',
  SHEET_ROLES: 'Roles',
  SHEET_PERMISSIONS: 'Permisos',
  SHEET_ROLE_PERMISSIONS: 'RolPermiso',
  SHEET_AUDIT: 'Auditoria',

  ALLOWED_EMAIL_DOMAIN: 'sunarp.gob.pe',

  SHEET_AGENTS: 'Agentes Sunarp',
  SHEET_DEPARTMENTS: 'departamentos',
  SHEET_PROVINCES: 'provincias',
  SHEET_DISTRICTS: 'distritos',
  SHEET_SEDES: 'sede',
  SHEET_DESTINATION: 'data agentes sunarp'
};

// Estructura real de la hoja Agentes Sunarp.
const HEADERS = [
  'id',
  'sede_id',
  'nombre',
  'distrito_id',
  'direccion',
  'referencia',
  'url_destination',
  'state'
];

// ============================================================
// CATÁLOGOS DE LA FUENTE MAESTRA
// ============================================================

const MASTER_CATALOGS_ = {
  sedes: {
    sheetName: 'sede',
    kind: 'table',
    startRow: 2,
    columns: 2,
    headers: {
      id: 'id',
      name: 'name'
    }
  },

  departamentos: {
    sheetName: 'departamento',
    kind: 'table',
    startRow: 2,
    columns: 2
  },

  provincias: {
    sheetName: 'provincia',
    kind: 'table',
    startRow: 2,
    columns: 3,
    parentType: 'departamentos'
  },

  distritos: {
    sheetName: 'distrito',
    kind: 'table',
    startRow: 2,
    columns: 3,
    parentType: 'provincias'
  }
};

// ============================================================
// ENTRADA Y UTILIDADES GENERALES
// ============================================================

function doGet() {
  try {
    getAuthContext_();

    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Gestor de contenidos SUNARP')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  } catch (error) {
    console.warn('[AUTH_REJECTED] ' + error.message);

    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Acceso no autorizado</title>
      </head>
      <body style="font-family:Arial,sans-serif;padding:40px;color:#26332b">
        <h1>Acceso no autorizado</h1>
        <p>No tienes acceso al Gestor de contenidos SUNARP.</p>
        <p>Verifica que ingreses con tu cuenta institucional y
        que tu usuario esté habilitado.</p>
      </body>
      </html>
    `)
      .setTitle('Acceso no autorizado')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getMasterSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
}

function getSecuritySpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SECURITY_SPREADSHEET_ID);
}

function getSheet_(name, spreadsheet) {
  const ss = spreadsheet || getSpreadsheet_();
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    throw new Error('No existe la pestaña: ' + name);
  }

  return sheet;
}

function normalize_(value) {
  return String(value == null ? '' : value).trim();
}

function catalogKey_(value) {
  return normalize_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-PE');
}

function validateCatalogType_(type) {
  type = normalize_(type).toLowerCase();

  if (!Object.prototype.hasOwnProperty.call(MASTER_CATALOGS_, type)) {
    throw new Error('El tipo de catálogo no está permitido.');
  }

  return type;
}

// ============================================================
// AUTENTICACIÓN, ROLES Y PERMISOS
// ============================================================

function readSecurityTable_(sheetName, requiredHeaders, ss) {
  const spreadsheet = ss || getSecuritySpreadsheet_();
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      'No se encuentra la pestaña de seguridad: ' + sheetName
    );
  }

  const values = sheet.getDataRange().getDisplayValues();

  if (!values.length) {
    throw new Error(
      'La pestaña de seguridad "' + sheetName + '" está vacía.'
    );
  }

  const headers = values[0].map(header =>
    normalize_(header).toLowerCase()
  );

  const indexes = {};

  requiredHeaders.forEach(header => {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error(
        'Falta el encabezado "' + header +
        '" en la pestaña "' + sheetName + '".'
      );
    }

    indexes[header] = index;
  });

  return values.slice(1)
    .map(row => {
      const item = {};

      requiredHeaders.forEach(header => {
        item[header] = normalize_(row[indexes[header]]);
      });

      return item;
    })
    .filter(item =>
      requiredHeaders.some(header => item[header] !== '')
    );
}

function isSecurityActive_(value) {
  return normalize_(value).toUpperCase() === 'ACTIVO';
}

function assertUniqueSecurityField_(items, field, label) {
  const seen = new Set();

  items.forEach(item => {
    const value = normalize_(item[field]).toLowerCase();

    if (!value) return;

    if (seen.has(value)) {
      throw new Error(
        'La configuración de seguridad contiene valores duplicados en "' +
        label + '".'
      );
    }

    seen.add(value);
  });
}

function assertUniqueRolePermissionAssignments_(items) {
  const seen = new Set();

  items.forEach(item => {
    const key = item.rol_id + '|' + item.permiso_id;

    if (seen.has(key)) {
      throw new Error(
        'La configuración RolPermiso contiene asignaciones duplicadas.'
      );
    }

    seen.add(key);
  });
}

function getAuthContext_() {
  let email = '';

  try {
    email = normalize_(
      Session.getActiveUser().getEmail()
    ).toLowerCase();

  } catch (error) {
    console.error('[AUTH_IDENTITY_ERROR] ' + error.message);
  }

  if (!email || !email.includes('@')) {
    throw new Error(
      'Acceso denegado: no se pudo verificar la cuenta institucional.'
    );
  }

  const emailParts = email.split('@');

  if (
    emailParts.length !== 2 ||
    emailParts[1] !== CONFIG.ALLOWED_EMAIL_DOMAIN.toLowerCase()
  ) {
    throw new Error(
      'Acceso denegado: se requiere una cuenta institucional autorizada.'
    );
  }

  const securitySS = getSecuritySpreadsheet_();

  const users = readSecurityTable_(
    CONFIG.SHEET_USERS,
    ['correo_institucional', 'nombre', 'estado', 'rol_id'],
    securitySS
  );

  assertUniqueSecurityField_(
    users,
    'correo_institucional',
    'correo_institucional'
  );

  const matchingUsers = users.filter(item =>
    item.correo_institucional.toLowerCase() === email
  );

  console.log('[AUTH_USER_LOOKUP] ' + JSON.stringify({
    authenticatedEmail: email,
    matchingRecords: matchingUsers.length
  }));

  if (matchingUsers.length === 0) {
    throw new Error(
      'Acceso denegado: la cuenta autenticada (' + email +
      ') no figura en la pestaña Usuarios.'
    );
  }

  if (matchingUsers.length > 1) {
    throw new Error(
      'Acceso denegado: el correo ' + email +
      ' aparece ' + matchingUsers.length +
      ' veces en la pestaña Usuarios. Debe existir una sola fila.'
    );
  }

  const user = matchingUsers[0];

  if (!isSecurityActive_(user.estado)) {
    throw new Error(
      'Acceso denegado: el usuario se encuentra inactivo.'
    );
  }

  if (!user.rol_id) {
    throw new Error(
      'Acceso denegado: el usuario no tiene un rol asignado.'
    );
  }

  const roles = readSecurityTable_(
    CONFIG.SHEET_ROLES,
    ['rol_id', 'nombre', 'descripcion', 'estado'],
    securitySS
  );

  assertUniqueSecurityField_(roles, 'rol_id', 'rol_id');

  const matchingRoles = roles.filter(item =>
    item.rol_id === user.rol_id &&
    isSecurityActive_(item.estado)
  );

  if (matchingRoles.length !== 1) {
    throw new Error(
      'Acceso denegado: el rol no existe, está inactivo ' +
      'o tiene identificadores duplicados.'
    );
  }

  const role = matchingRoles[0];

  const permissionRows = readSecurityTable_(
    CONFIG.SHEET_PERMISSIONS,
    [
      'permiso_id',
      'codigo',
      'modulo',
      'operacion',
      'descripcion',
      'estado'
    ],
    securitySS
  );

  assertUniqueSecurityField_(
    permissionRows,
    'permiso_id',
    'permiso_id'
  );

  assertUniqueSecurityField_(
    permissionRows,
    'codigo',
    'codigo'
  );

  const activePermissionsById = new Map();

  permissionRows.forEach(item => {
    if (!isSecurityActive_(item.estado)) return;
    if (!item.permiso_id || !item.codigo) return;

    if (activePermissionsById.has(item.permiso_id)) {
      throw new Error(
        'La configuración de permisos contiene identificadores duplicados.'
      );
    }

    activePermissionsById.set(item.permiso_id, {
      id: item.permiso_id,
      code: item.codigo.toUpperCase()
    });
  });

  const rolePermissions = readSecurityTable_(
    CONFIG.SHEET_ROLE_PERMISSIONS,
    ['rol_id', 'permiso_id', 'estado'],
    securitySS
  );

  assertUniqueRolePermissionAssignments_(rolePermissions);

  const grantedPermissions = new Set();

  rolePermissions.forEach(assignment => {
    if (
      assignment.rol_id !== role.rol_id ||
      !isSecurityActive_(assignment.estado)
    ) {
      return;
    }

    const permission = activePermissionsById.get(
      assignment.permiso_id
    );

    if (permission) {
      grantedPermissions.add(permission.code);
    }
  });

  return {
    email,
    name: user.nombre,
    roleId: role.rol_id,
    roleName: role.nombre,
    permissions: grantedPermissions
  };
}

function requirePermission_(
  permissionCode,
  moduleName,
  action,
  recordId
) {
  const context = getAuthContext_();
  const requiredCode = normalize_(permissionCode).toUpperCase();

  if (!context.permissions.has(requiredCode)) {
    try {
      recordAudit_(
        context,
        'AUTORIZACION_DENEGADA',
        moduleName,
        recordId,
        'DENEGADO',
        'Permiso requerido: ' + requiredCode,
        {
          entityType: 'INTENTO_AUTORIZACION'
        }
      );
    } catch (auditError) {
      console.error(
        '[AUDIT_DENIAL_LOG_FAILED] ' + auditError.message
      );
    }

    throw new Error(
      'No tienes autorización para realizar esta operación.'
    );
  }

  return context;
}

// ============================================================
// INICIALIZACIÓN Y ESTRUCTURA DE AGENTES
// ============================================================

function getAgentSheetInfo_(spreadsheet) {
  const sheet = getSheet_(CONFIG.SHEET_AGENTS, spreadsheet);
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < HEADERS.length) {
    throw new Error(
      'La hoja "' + CONFIG.SHEET_AGENTS +
      '" no tiene la estructura normalizada esperada.'
    );
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(header => normalize_(header).toLowerCase());

  const indexes = {};

  HEADERS.forEach(header => {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error(
        'Falta el encabezado "' + header +
        '" en la hoja "' + CONFIG.SHEET_AGENTS + '".'
      );
    }

    indexes[header] = index;
  });

  return {
    sheet,
    headers,
    indexes,
    idCol: indexes.id + 1
  };
}

function initialize_() {
  const info = getAgentSheetInfo_();
  const sheet = info.sheet;
  const idCol = info.idCol;
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const ids = sheet.getRange(
      2,
      idCol,
      lastRow - 1,
      1
    ).getDisplayValues();

    const seen = new Set();

    ids.forEach((row, index) => {
      let id = normalize_(row[0]);

      if (!id) {
        id = getNextAgentId_(sheet, idCol);
        sheet.getRange(index + 2, idCol).setValue(id);
      }

      if (seen.has(id)) {
        throw new Error(
          'Hay identificadores duplicados en Agentes Sunarp: ' + id
        );
      }

      seen.add(id);
    });
  }

  return {
    sheet,
    idCol,
    indexes: info.indexes,
    headers: info.headers
  };
}

// ============================================================
// LECTURA DE LA FUENTE MAESTRA
// ============================================================

function getMasterCatalogSheet_(type, spreadsheet) {
  type = validateCatalogType_(type);

  const ss = spreadsheet || getMasterSpreadsheet_();
  const sheetName = MASTER_CATALOGS_[type].sheetName;
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      'No existe la pestaña maestra "' + sheetName + '".'
    );
  }

  return sheet;
}

function readMasterCatalogItems_(type, spreadsheet) {
  type = validateCatalogType_(type);

  const config = MASTER_CATALOGS_[type];
  const sheet = getMasterCatalogSheet_(type, spreadsheet);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < config.startRow) return [];

  const numberOfRows = lastRow - config.startRow + 1;

  // ----------------------------------------------------------
  // CATÁLOGOS CON ENCABEZADOS CONFIGURADOS
  // ----------------------------------------------------------

  if (config.headers) {
    const headers = sheet.getRange(
      1,
      1,
      1,
      lastColumn
    ).getDisplayValues()[0].map(header =>
      normalize_(header).toLowerCase()
    );

    const indexes = {};

    Object.entries(config.headers).forEach(([field, header]) => {
      const index = headers.indexOf(
        normalize_(header).toLowerCase()
      );

      if (index === -1) {
        throw new Error(
          'No se encontró la columna "' + header +
          '" en la pestaña "' + config.sheetName + '".'
        );
      }

      indexes[field] = index;
    });

    const rows = sheet.getRange(
      config.startRow,
      1,
      numberOfRows,
      lastColumn
    ).getDisplayValues();

    return rows.map((row, index) => ({
      id: normalize_(row[indexes.id]),
      name: normalize_(row[indexes.name]),
      parentId: '',
      rowNumber: config.startRow + index
    })).filter(item => item.id && item.name);
  }

  // ----------------------------------------------------------
  // RESTO DE CATÁLOGOS
  // Se conserva su estructura de lectura actual.
  // ----------------------------------------------------------

  const rows = sheet.getRange(
    config.startRow,
    1,
    numberOfRows,
    config.columns
  ).getDisplayValues();

  if (config.kind === 'simple') {
    return rows.map((row, index) => ({
      id: normalize_(row[0]),
      name: normalize_(row[0]),
      parentId: '',
      rowNumber: config.startRow + index
    })).filter(item => item.id && item.name);
  }

  return rows.map((row, index) => ({
    id: normalize_(row[0]),
    name: normalize_(row[1]),
    parentId: config.columns === 3
      ? normalize_(row[2])
      : '',
    rowNumber: config.startRow + index
  })).filter(item => item.id && item.name);
}

function readAllMasterCatalogs_(spreadsheet) {
  const ss = spreadsheet || getMasterSpreadsheet_();

  const sedes = readMasterCatalogItems_('sedes', ss);
  const departamentos = readMasterCatalogItems_('departamentos', ss);
  const provincias = readMasterCatalogItems_('provincias', ss);
  const distritos = readMasterCatalogItems_('distritos', ss);

  const departmentsById = new Map(
    departamentos.map(item => [item.id, item])
  );

  const provincesById = new Map(
    provincias.map(item => [item.id, item])
  );

  provincias.forEach(item => {
    item.parentName =
      departmentsById.get(item.parentId)?.name || '';
  });

  distritos.forEach(item => {
    const province = provincesById.get(item.parentId);

    item.parentName = province?.name || '';

    item.departmentName = province
      ? departmentsById.get(province.parentId)?.name || ''
      : '';
  });

  return {
    sedes,
    departamentos,
    provincias,
    distritos
  };
}


// ============================================================
// CACHÉ DE CATÁLOGOS
// ============================================================

function getCatalogs_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'catalogs_master_v8';
  const cacheExpiration = 21600;
  const chunkSize = 20000;

  // ----------------------------------------------------------
  // 1. RECUPERAR CACHÉ
  // ----------------------------------------------------------

  try {
    const manifest = cache.get(cacheKey);

    if (manifest) {
      const metadata = JSON.parse(manifest);
      let serialized = '';
      let cacheComplete = true;

      for (let i = 0; i < metadata.chunks; i++) {
        const chunk = cache.get(cacheKey + '_part_' + i);

        if (chunk === null) {
          cacheComplete = false;
          break;
        }

        serialized += chunk;
      }

      if (cacheComplete) {
        return JSON.parse(serialized);
      }
    }
  } catch (error) {
    console.warn('Error al recuperar caché: ' + error.message);
  }

  // ----------------------------------------------------------
  // 2. LEER CATÁLOGOS MAESTROS
  // ----------------------------------------------------------

  const source = readAllMasterCatalogs_(
    getMasterSpreadsheet_()
  );

  const catalogs = {
    departments: source.departamentos.map(item => ({
      id: item.id,
      name: item.name,
      parentId: ''
    })),

    provinces: source.provincias.map(item => ({
      id: item.id,
      name: item.name,
      parentId: item.parentId
    })),

    districts: source.distritos.map(item => ({
      id: item.id,
      name: item.name,
      parentId: item.parentId
    })),

    sedes: source.sedes.map(item => item.name)
  };

  // ----------------------------------------------------------
  // 3. GUARDAR CACHÉ
  // ----------------------------------------------------------

  try {
    const serialized = JSON.stringify(catalogs);
    const totalChunks = Math.ceil(
      serialized.length / chunkSize
    );

    for (let i = 0; i < totalChunks; i++) {
      cache.put(
        cacheKey + '_part_' + i,
        serialized.substring(
          i * chunkSize,
          (i + 1) * chunkSize
        ),
        cacheExpiration
      );
    }

    cache.put(
      cacheKey,
      JSON.stringify({ chunks: totalChunks }),
      cacheExpiration
    );

  } catch (error) {
    console.warn('No se pudo guardar la caché: ' + error.message);
  }

  return catalogs;
}

function invalidateCatalogsCache_() {
  const cache = CacheService.getScriptCache();

  [
    'catalogs_master_v8',
    'catalogs_master_v7',
    'catalogs_master_v6',
    'catalogs_master_v5',
    'catalogs_master_v4',
    'catalogs_master_v3',
    'catalogs_master_v2',
    'catalogs_v1'
  ].forEach(key => cache.remove(key));
}

// ============================================================
// RESOLUCIÓN DE UBICACIONES POR IDENTIFICADOR
// ============================================================

function getLocationNamesByIds_(
  sedeId,
  distritoId,
  catalogs
) {
  const normalizedSedeId = normalize_(sedeId);
  const normalizedDistritoId = normalize_(distritoId);

  const sede = catalogs.sedes.find(item =>
    item.id === normalizedSedeId
  );

  const distrito = catalogs.distritos.find(item =>
    item.id === normalizedDistritoId
  );

  if (!distrito) {
    return {
      sede: sede?.name || '',
      departamento: '',
      provincia: '',
      distrito: ''
    };
  }

  const provincia = catalogs.provincias.find(item =>
    item.id === distrito.parentId
  );

  const departamento = provincia
    ? catalogs.departamentos.find(item =>
      item.id === provincia.parentId
    )
    : null;

  return {
    sede: sede?.name || '',
    departamento: departamento?.name || '',
    provincia: provincia?.name || '',
    distrito: distrito.name
  };
}


function getAgentRecordByRow_(row, indexes, rowNumber, catalogs) {
  const sedeId = normalize_(row[indexes.sede_id]);
  const distritoId = normalize_(row[indexes.distrito_id]);

  const location = getLocationNamesByIds_(
    sedeId,
    distritoId,
    catalogs
  );

  return {
    id: normalize_(row[indexes.id]),
    rowNumber,
    sede: location.sede,
    sedeId,
    nombre: normalize_(row[indexes.nombre]),
    departamento: location.departamento,
    provincia: location.provincia,
    distrito: location.distrito,
    distritoId,
    direccion: normalize_(row[indexes.direccion]),
    referencia: normalize_(row[indexes.referencia]),
    urlDestination: normalize_(row[indexes.url_destination]),
    state: normalize_(row[indexes.state])
  };
}


// ============================================================
// CONSULTA DE AGENTES
// ============================================================

function getAgents_(spreadsheet) {
  const info = getAgentSheetInfo_(spreadsheet);
  const sheet = info.sheet;
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const catalogs = readAllMasterCatalogs_(getMasterSpreadsheet_());

  const rows = sheet.getRange(
    2,
    1,
    lastRow - 1,
    info.headers.length
  ).getDisplayValues();

  return rows.map((row, index) =>
    getAgentRecordByRow_(
      row,
      info.indexes,
      index + 2,
      catalogs
    )
  ).filter(agent => agent.id);
}

// ============================================================
// DATOS INICIALES DE LA APLICACIÓN
// ============================================================

function getInitialData() {
  const totalStart = Date.now();
  const context = getAuthContext_();

  const canReadAgents =
    context.permissions.has('AGENTES_VER');

  const catalogPermissions = [
    'AGENTES_VER',
    'AGENTES_CREAR',
    'AGENTES_EDITAR',
    'UBICACIONES_VER',
    'UBICACIONES_CREAR',
    'UBICACIONES_EDITAR',
    'UBICACIONES_ELIMINAR'
  ];

  const canReadCatalogs = catalogPermissions.some(permission =>
    context.permissions.has(permission)
  );

  let start = Date.now();
  const ss = getSpreadsheet_();

  console.log(
    'Abrir spreadsheet: ' + (Date.now() - start) + ' ms'
  );

  let agents = [];

  if (canReadAgents) {
    start = Date.now();
    agents = getAgents_(ss);

    console.log(
      'Leer agentes: ' + (Date.now() - start) + ' ms'
    );
  }

  let catalogs = {
    departments: [],
    provinces: [],
    districts: [],
    sedes: []
  };

  if (canReadCatalogs) {
    start = Date.now();
    catalogs = getCatalogs_();

    console.log(
      'Leer catálogos: ' + (Date.now() - start) + ' ms'
    );
  }

  console.log(
    'Total servidor: ' + (Date.now() - totalStart) + ' ms'
  );

  return {
    user: {
      email: context.email,
      name: context.name,
      roleId: context.roleId,
      roleName: context.roleName
    },
    permissions: Array.from(context.permissions),
    agents,
    catalogs
  };
}

// ============================================================
// UTILIDADES PARA ESCRITURA DE AGENTES
// ============================================================

function resolveAgentForeignKeys_(data, catalogs) {
  const sedeValue = normalize_(
    data.sedeId || data.sede
  );

  const sede = catalogs.sedes.find(item =>
    item.id === sedeValue ||
    catalogKey_(item.name) === catalogKey_(sedeValue)
  );

  if (!sede) {
    throw new Error('La sede seleccionada no es válida.');
  }

  const departamento = catalogs.departamentos.find(item =>
    catalogKey_(item.name) === catalogKey_(data.departamento)
  );

  if (!departamento) {
    throw new Error('El departamento no es válido.');
  }

  const provincia = catalogs.provincias.find(item =>
    catalogKey_(item.name) === catalogKey_(data.provincia) &&
    item.parentId === departamento.id
  );

  if (!provincia) {
    throw new Error(
      'La provincia no corresponde al departamento seleccionado.'
    );
  }

  const distrito = catalogs.distritos.find(item =>
    catalogKey_(item.name) === catalogKey_(data.distrito) &&
    item.parentId === provincia.id
  );

  if (!distrito) {
    throw new Error(
      'El distrito no corresponde a la provincia seleccionada.'
    );
  }

  return {
    sedeId: sede.id,
    distritoId: distrito.id
  };
}

function createAgentRow_(indexes, values) {
  const row = Array(indexes.length).fill('');

  row[indexes.indexOf('id')] = values.id;
  row[indexes.indexOf('sede_id')] = values.sedeId;
  row[indexes.indexOf('nombre')] = values.nombre;
  row[indexes.indexOf('distrito_id')] = values.distritoId;
  row[indexes.indexOf('direccion')] = values.direccion;
  row[indexes.indexOf('referencia')] = values.referencia;
  row[indexes.indexOf('url_destination')] = values.urlDestination;
  row[indexes.indexOf('state')] = values.state;

  return row;
}

function findAgentRowById_(sheet, idCol, id) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return -1;

  const ids = sheet.getRange(
    2,
    idCol,
    lastRow - 1,
    1
  ).getDisplayValues().flat().map(normalize_);

  const index = ids.indexOf(normalize_(id));

  return index === -1 ? -1 : index + 2;
}

function getNextAgentId_(sheet, idCol) {
  const lastRow = sheet.getLastRow();

  let maxNumber = Math.max(0, lastRow - 1);

  if (lastRow >= 2) {
    const ids = sheet.getRange(
      2,
      idCol,
      lastRow - 1,
      1
    ).getDisplayValues().flat();

    ids.forEach(value => {
      const match = normalize_(value).match(/^AGENTE_(\d+)$/);

      if (match) {
        maxNumber = Math.max(
          maxNumber,
          Number(match[1])
        );
      }
    });
  }

  return 'AGENTE_' + String(maxNumber + 1).padStart(4, '0');
}

// ============================================================
// CRUD DE AGENTES
// ============================================================

function saveAgent(agent) {
  const requestedId =
    agent && typeof agent === 'object'
      ? normalize_(agent.id)
      : '';

  const auth = requirePermission_(
    requestedId ? 'AGENTES_EDITAR' : 'AGENTES_CREAR',
    'AGENTES',
    requestedId ? 'EDITAR' : 'CREAR',
    requestedId
  );

  if (!agent || typeof agent !== 'object') {
    throw new Error('No se recibieron los datos del agente.');
  }

  const data = {
    sede: normalize_(agent.sede),
    sedeId: normalize_(agent.sedeId),
    nombre: normalize_(agent.nombre),
    departamento: normalize_(agent.departamento),
    provincia: normalize_(agent.provincia),
    distrito: normalize_(agent.distrito),
    direccion: normalize_(agent.direccion),
    referencia: normalize_(agent.referencia),
    urlDestination: normalize_(agent.urlDestination)
  };

  if (
    (!data.sede && !data.sedeId) ||
    !data.nombre ||
    !data.departamento ||
    !data.provincia ||
    !data.distrito ||
    !data.direccion
  ) {
    throw new Error('Completa todos los campos obligatorios.');
  }

  if (
    data.urlDestination &&
    !/^https:\/\/(maps\.app\.goo\.gl|www\.google\.com\/maps|maps\.google\.com)\//i
      .test(data.urlDestination)
  ) {
    throw new Error('Ingresa un enlace válido de Google Maps.');
  }

  const catalogs = readAllMasterCatalogs_(
    getMasterSpreadsheet_()
  );

  const foreignKeys = resolveAgentForeignKeys_(
    data,
    catalogs
  );

  // Los códigos de distrito (UBIGEO) tienen seis dígitos.
  foreignKeys.distritoId = String(foreignKeys.distritoId)
    .trim()
    .padStart(6, '0');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const info = initialize_();
    const sheet = info.sheet;
    const indexes = info.indexes;
    const idCol = info.idCol;

    // --------------------------------------------------------
    // EDITAR
    // --------------------------------------------------------

    if (requestedId) {
      const rowNumber = findAgentRowById_(
        sheet,
        idCol,
        requestedId
      );

      if (rowNumber === -1) {
        throw new Error('El agente ya no existe.');
      }

      const oldRow = sheet.getRange(
        rowNumber,
        1,
        1,
        info.headers.length
      ).getDisplayValues()[0];

      const before = getAgentRecordByRow_(
        oldRow,
        indexes,
        rowNumber,
        catalogs
      );

      const after = {
        id: requestedId,
        sede: catalogs.sedes.find(
          item => item.id === foreignKeys.sedeId
        )?.name || '',
        sedeId: foreignKeys.sedeId,
        nombre: data.nombre,
        departamento: data.departamento,
        provincia: data.provincia,
        distrito: data.distrito,
        distritoId: foreignKeys.distritoId,
        direccion: data.direccion,
        referencia: data.referencia,
        urlDestination: data.urlDestination,
        state: before.state
      };

      return runAuditedMutation_(auth, {
        action: 'EDITAR',
        module: 'AGENTES',
        entityType: 'AGENTE',
        recordId: requestedId,
        recordName: data.nombre,
        detail: 'Actualización de agente',
        before
      }, () => {
        const row = createAgentRow_(info.headers, {
          id: requestedId,
          sedeId: foreignKeys.sedeId,
          nombre: data.nombre,
          distritoId: foreignKeys.distritoId,
          direccion: data.direccion,
          referencia: data.referencia,
          urlDestination: data.urlDestination,
          state: before.state
        });

        // Conservar el identificador del distrito como texto.
        row[indexes.distrito_id] = String(foreignKeys.distritoId);

        // Escribir los datos del agente.
        sheet.getRange(
          rowNumber,
          1,
          1,
          row.length
        ).setValues([row]);

        // Forzar distrito_id como texto literal.
        sheet.getRange(
          rowNumber,
          indexes.distrito_id + 1
        ).setRichTextValue(
          SpreadsheetApp.newRichTextValue()
            .setText(String(foreignKeys.distritoId))
            .build()
        );

        return {
          value: {
            message: 'Agente actualizado correctamente.'
          },
          after
        };
      });
    }

    // --------------------------------------------------------
    // CREAR
    // --------------------------------------------------------

    const newId = getNextAgentId_(sheet, idCol);

    const newAgent = {
      id: newId,
      sedeId: foreignKeys.sedeId,
      nombre: data.nombre,
      distritoId: foreignKeys.distritoId,
      direccion: data.direccion,
      referencia: data.referencia,
      urlDestination: data.urlDestination,
      state: 'Activo'
    };

    const newRow = createAgentRow_(
      info.headers,
      newAgent
    );

    return runAuditedMutation_(auth, {
      action: 'CREAR',
      module: 'AGENTES',
      entityType: 'AGENTE',
      recordId: newId,
      recordName: data.nombre,
      detail: 'Registro de nuevo agente',
      before: null
    }, () => {
      // Registrar el agente.
      // Registrar el agente.
      sheet.appendRow(newRow);

      // Obtener la fila recién creada.
      const newRowNumber = sheet.getLastRow();

      // Forzar distrito_id como texto literal.
      sheet.getRange(
        newRowNumber,
        indexes.distrito_id + 1
      ).setRichTextValue(
        SpreadsheetApp.newRichTextValue()
          .setText(String(foreignKeys.distritoId))
          .build()
      );

      return {
        value: {
          message: 'Agente registrado correctamente.'
        },
        after: {
          id: newId,
          sede: catalogs.sedes.find(
            item => item.id === foreignKeys.sedeId
          )?.name || '',
          sedeId: foreignKeys.sedeId,
          nombre: data.nombre,
          departamento: data.departamento,
          provincia: data.provincia,
          distrito: data.distrito,
          distritoId: foreignKeys.distritoId,
          direccion: data.direccion,
          referencia: data.referencia,
          urlDestination: data.urlDestination,
          state: 'Activo'
        }
      };
    });

  } finally {
    lock.releaseLock();
  }
}

function deleteAgent(id) {
  id = normalize_(id);

  if (!id) {
    throw new Error('No se recibió el identificador del agente.');
  }

  const auth = requirePermission_(
    'AGENTES_ELIMINAR',
    'AGENTES',
    'ELIMINAR',
    id
  );

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const info = initialize_();
    const sheet = info.sheet;

    const rowNumber = findAgentRowById_(
      sheet,
      info.idCol,
      id
    );

    if (rowNumber === -1) {
      throw new Error('No se encontró el agente.');
    }

    const catalogs = readAllMasterCatalogs_(getMasterSpreadsheet_());

    const row = sheet.getRange(
      rowNumber,
      1,
      1,
      info.headers.length
    ).getDisplayValues()[0];

    const before = getAgentRecordByRow_(
      row,
      info.indexes,
      rowNumber,
      catalogs
    );

    return runAuditedMutation_(auth, {
      action: 'ELIMINAR',
      module: 'AGENTES',
      entityType: 'AGENTE',
      recordId: id,
      recordName: before.nombre,
      detail: 'Eliminación de agente',
      before
    }, () => {
      sheet.deleteRow(rowNumber);

      return {
        value: {
          message: 'Agente eliminado correctamente.'
        },
        after: null
      };
    });

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// MANTENIMIENTOS: CONSULTA
// ============================================================

function getLocationCatalogsForMaintenance() {
  requirePermission_(
    'UBICACIONES_VER',
    'UBICACIONES',
    'VER',
    ''
  );

  return readAllMasterCatalogs_(getMasterSpreadsheet_());
}

// ============================================================
// MANTENIMIENTOS: CREAR Y EDITAR
// ============================================================

function saveLocationCatalog(type, payload) {
  type = validateCatalogType_(type);

  if (!payload || typeof payload !== 'object') {
    throw new Error('No se recibieron los datos del catálogo.');
  }

  const config = MASTER_CATALOGS_[type];
  const action = normalize_(payload.action).toLowerCase();
  const isEdit = action === 'edit';

  if (!isEdit && action !== 'create') {
    throw new Error('La operación solicitada no es válida.');
  }

  const requestedKey = normalize_(
    payload.originalKey || payload.id
  );

  const auth = requirePermission_(
    isEdit ? 'UBICACIONES_EDITAR' : 'UBICACIONES_CREAR',
    'UBICACIONES',
    isEdit ? 'EDITAR' : 'CREAR',
    requestedKey
  );

  const name = normalize_(payload.name);

  if (!name) {
    throw new Error('Ingresa el nombre del registro.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const master = getMasterSpreadsheet_();
    const sheet = getMasterCatalogSheet_(type, master);
    const allCatalogs = readAllMasterCatalogs_(master);
    const items = allCatalogs[type];

    const existing = isEdit
      ? items.find(item => item.id === requestedKey)
      : null;

    if (isEdit && !existing) {
      throw new Error('El registro ya no existe.');
    }

    const id = config.kind === 'simple'
      ? (isEdit ? existing.id : name)
      : normalize_(payload.id);

    if (config.kind === 'table' && !id) {
      throw new Error('Ingresa el código del registro.');
    }

    if (
      config.kind === 'table' &&
      !isEdit &&
      items.some(item => item.id === id)
    ) {
      throw new Error('Ya existe un registro con ese código.');
    }

    if (
      isEdit &&
      config.kind === 'table' &&
      id !== existing.id
    ) {
      throw new Error(
        'No está permitido cambiar el código existente.'
      );
    }

    const parentId = isEdit
      ? existing.parentId
      : normalize_(payload.parentId);

    if (config.parentType) {
      if (!parentId) {
        throw new Error(
          'Selecciona el registro superior correspondiente.'
        );
      }

      if (
        !allCatalogs[config.parentType].some(
          item => item.id === parentId
        )
      ) {
        throw new Error(
          'El registro superior seleccionado no es válido.'
        );
      }

      if (
        isEdit &&
        normalize_(payload.parentId) &&
        normalize_(payload.parentId) !== existing.parentId
      ) {
        throw new Error(
          'No se permite cambiar la relación del registro existente.'
        );
      }
    }

    const duplicate = items.some(item => {
      if (isEdit && item.id === existing.id) return false;

      const sameName =
        catalogKey_(item.name) === catalogKey_(name);

      const sameParent = !config.parentType ||
        item.parentId === parentId;

      return sameName && sameParent;
    });

    if (duplicate) {
      throw new Error(
        'Ya existe un registro con ese nombre en la misma ubicación.'
      );
    }

    if (isEdit) {
      const oldName = existing.name;
      const nameColumn = config.kind === 'simple' ? 1 : 2;

      if (
        oldName !== name &&
        isLocationUsedByAgents_(type, existing, allCatalogs)
      ) {
        requirePermission_(
          'AGENTES_EDITAR',
          'AGENTES',
          'EDITAR',
          existing.id
        );
      }

      const before = {
        id: existing.id,
        name: existing.name,
        parentId: existing.parentId || '',
        parentName: existing.parentName || '',
        departmentName: existing.departmentName || ''
      };

      const after = {
        id: existing.id,
        name,
        parentId: existing.parentId || '',
        parentName: existing.parentName || '',
        departmentName: existing.departmentName || ''
      };

      return runAuditedMutation_(auth, {
        action: 'EDITAR',
        module: 'UBICACIONES',
        entityType: getLocationAuditEntityType_(type),
        recordId: existing.id,
        recordName: name,
        detail: 'Actualización del catálogo ' + type,
        before
      }, () => {
        if (oldName !== name) {
          sheet.getRange(
            existing.rowNumber,
            nameColumn
          ).setValue(name);
        }

        invalidateCatalogsCache_();

        return {
          value: {
            message: 'Registro actualizado correctamente.'
          },
          after
        };
      });
    }

    let newRow;

    if (config.kind === 'simple') {
      newRow = [name];
    } else if (config.columns === 2) {
      newRow = [id, name];
    } else {
      newRow = [id, name, parentId];
    }

    const after = {
      id,
      name,
      parentId,
      parentName: config.parentType
        ? allCatalogs[config.parentType].find(
          item => item.id === parentId
        )?.name || ''
        : ''
    };

    return runAuditedMutation_(auth, {
      action: 'CREAR',
      module: 'UBICACIONES',
      entityType: getLocationAuditEntityType_(type),
      recordId: id,
      recordName: name,
      detail: 'Creación de registro en el catálogo ' + type,
      before: null
    }, () => {
      sheet.appendRow(newRow);
      invalidateCatalogsCache_();

      return {
        value: {
          message: 'Registro creado correctamente.'
        },
        after
      };
    });

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// MANTENIMIENTOS: ELIMINAR
// ============================================================

function deleteLocationCatalog(type, key) {
  type = validateCatalogType_(type);
  key = normalize_(key);

  if (!key) {
    throw new Error(
      'No se recibió el identificador del registro.'
    );
  }

  const auth = requirePermission_(
    'UBICACIONES_ELIMINAR',
    'UBICACIONES',
    'ELIMINAR',
    key
  );

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const master = getMasterSpreadsheet_();
    const sheet = getMasterCatalogSheet_(type, master);
    const catalogs = readAllMasterCatalogs_(master);
    const items = catalogs[type];

    const item = items.find(record => record.id === key);

    if (!item) {
      throw new Error('El registro ya no existe.');
    }

    if (
      type === 'departamentos' &&
      catalogs.provincias.some(
        provincia => provincia.parentId === item.id
      )
    ) {
      throw new Error(
        'No se puede eliminar el departamento porque tiene provincias asociadas.'
      );
    }

    if (
      type === 'provincias' &&
      catalogs.distritos.some(
        distrito => distrito.parentId === item.id
      )
    ) {
      throw new Error(
        'No se puede eliminar la provincia porque tiene distritos asociados.'
      );
    }

    if (isLocationUsedByAgents_(type, item, catalogs)) {
      throw new Error(
        'No se puede eliminar el registro porque está siendo utilizado ' +
        'por uno o más agentes.'
      );
    }

    const before = {
      id: item.id,
      name: item.name,
      parentId: item.parentId || '',
      parentName: item.parentName || '',
      departmentName: item.departmentName || ''
    };

    return runAuditedMutation_(auth, {
      action: 'ELIMINAR',
      module: 'UBICACIONES',
      entityType: getLocationAuditEntityType_(type),
      recordId: item.id,
      recordName: item.name,
      detail: 'Eliminación del catálogo ' + type,
      before
    }, () => {
      sheet.deleteRow(item.rowNumber);
      invalidateCatalogsCache_();

      return {
        value: {
          message: 'Registro eliminado correctamente.'
        },
        after: null
      };
    });

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// ACTUALIZAR REFERENCIAS AL RENOMBRAR SEDES
// ============================================================

function updateAgentReferencesOnCatalogRename_(
  type,
  oldItem,
  newName,
  catalogs,
  auth
) {
  // Los agentes almacenan sede_id como clave foránea.
  // El cambio de nombre de una sede no requiere
  // actualizar los registros de agentes.
  return 0;
}

// ============================================================
// PROTEGER CATÁLOGOS QUE ESTÉN EN USO
// ============================================================

function isLocationUsedByAgents_(type, item, catalogs) {
  const info = getAgentSheetInfo_();
  const sheet = info.sheet;

  if (sheet.getLastRow() < 2) return false;

  const source = catalogs ||
    readAllMasterCatalogs_(getMasterSpreadsheet_());

  const indexes = info.indexes;

  const rows = sheet.getRange(
    2,
    1,
    sheet.getLastRow() - 1,
    info.headers.length
  ).getDisplayValues();

  const provincesById = new Map(
    source.provincias.map(entry => [entry.id, entry])
  );

  const districtsById = new Map(
    source.distritos.map(entry => [entry.id, entry])
  );

  const departmentsById = new Map(
    source.departamentos.map(entry => [entry.id, entry])
  );

  return rows.some(row => {
    const sedeId = normalize_(row[indexes.sede_id]);
    const distritoId = normalize_(row[indexes.distrito_id]);

    const district = districtsById.get(distritoId);
    const province = district
      ? provincesById.get(district.parentId)
      : null;

    const department = province
      ? departmentsById.get(province.parentId)
      : null;

    if (type === 'sedes') {
      return sedeId === item.id;
    }

    if (type === 'departamentos') {
      return department?.id === item.id;
    }

    if (type === 'provincias') {
      return province?.id === item.id;
    }

    if (type === 'distritos') {
      return distritoId === item.id;
    }

    return false;
  });
}

// ============================================================
// DIAGNÓSTICO MANUAL DE CATÁLOGOS
// ============================================================

function verificarCatalogosMaestros_() {
  const datos = readAllMasterCatalogs_(getMasterSpreadsheet_());

  console.log('Sedes: ' + datos.sedes.length);
  console.log('Departamentos: ' + datos.departamentos.length);
  console.log('Provincias: ' + datos.provincias.length);
  console.log('Distritos: ' + datos.distritos.length);

  console.log(
    'Muestra de sede: ' +
    JSON.stringify(datos.sedes[0] || null)
  );

  console.log(
    'Muestra de departamento: ' +
    JSON.stringify(datos.departamentos[0] || null)
  );

  console.log(
    'Muestra de provincia: ' +
    JSON.stringify(datos.provincias[0] || null)
  );

  console.log(
    'Muestra de distrito: ' +
    JSON.stringify(datos.distritos[0] || null)
  );
}

// ============================================================
// DIAGNÓSTICO DE AGENTES
// ============================================================

function verificarEstructuraAgentes_() {
  const info = getAgentSheetInfo_();

  console.log('Encabezados detectados:');
  console.log(JSON.stringify(info.headers));

  console.log('Índices:');
  console.log(JSON.stringify(info.indexes));

  const agents = getAgents_();

  console.log('Total de agentes: ' + agents.length);

  console.log(
    'Muestra de agente: ' +
    JSON.stringify(agents[0] || null)
  );
}