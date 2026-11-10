// ============================================================
// AUDITORÍA CENTRAL DEL GESTOR DE CONTENIDOS
// ============================================================

const AUDIT_HEADERS_ = [
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
  'datos_despues'
];

const AUDIT_ENTITY_TYPES_ = {
  AGENTES: 'AGENTE',
  UBICACIONES: 'UBICACION',
  USUARIOS: 'USUARIO',
  ROLES: 'ROL',
  PERMISOS: 'PERMISO',
  ROL_PERMISO: 'ROL_PERMISO'
};

// ============================================================
// ESQUEMA Y MIGRACIÓN DE LA HOJA Auditoria
// ============================================================

function ensureAuditSchema_() {
  const ss = getSecuritySpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEET_AUDIT);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_AUDIT);
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow === 0 || lastColumn === 0) {
    sheet.getRange(1, 1, 1, AUDIT_HEADERS_.length)
      .setValues([AUDIT_HEADERS_]);

    sheet.setFrozenRows(1);

    return sheet;
  }

  const oldHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(value => normalize_(value).toLowerCase());

  if (oldHeaders.every(header => !header)) {
    throw new Error(
      'La hoja Auditoria tiene datos, pero no se reconoce su encabezado. ' +
      'No se realizará una migración automática para evitar pérdida de datos.'
    );
  }

  const aliases = {
    usuario_correo: 'actor_correo',
    correo_usuario: 'actor_correo',
    usuario_nombre: 'actor_nombre'
  };

  const canonicalHeaders = oldHeaders.map(
    header => aliases[header] || header
  );

  const alreadyMigrated =
    canonicalHeaders.length === AUDIT_HEADERS_.length &&
    AUDIT_HEADERS_.every((header, index) =>
      canonicalHeaders[index] === header
    );

  if (alreadyMigrated) {
    return sheet;
  }

  // Leer antes de cambiar el encabezado para preservar los registros.
  const oldRows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues()
    : [];

  const migratedRows = oldRows
    .filter(row => row.some(value => value !== '' && value != null))
    .map(row => {
      const oldRecord = {};

      canonicalHeaders.forEach((header, index) => {
        if (header) {
          oldRecord[header] = row[index];
        }
      });

      const newRecord = {
        ...oldRecord,
        evento_id: normalize_(oldRecord.evento_id) ||
          Utilities.getUuid()
      };

      return AUDIT_HEADERS_.map(header =>
        newRecord[header] == null ? '' : newRecord[header]
      );
    });

  // La reconstrucción se realiza únicamente después de leer los datos.
  sheet.clearContents();

  sheet.getRange(1, 1, 1, AUDIT_HEADERS_.length)
    .setValues([AUDIT_HEADERS_]);

  if (migratedRows.length) {
    sheet.getRange(
      2,
      1,
      migratedRows.length,
      AUDIT_HEADERS_.length
    ).setValues(migratedRows);
  }

  sheet.setFrozenRows(1);

  return sheet;
}

// ============================================================
// SERIALIZACIÓN DE DATOS PARA EL HISTORIAL
// ============================================================

function serializeAuditData_(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(
      'No se pudieron serializar los datos de auditoría: ' +
      error.message
    );
  }
}

// ============================================================
// INICIO DE UNA OPERACIÓN AUDITADA
// Se registra ANTES de modificar los datos.
// Si falla la escritura del evento, la operación no comienza.
// ============================================================

function beginAudit_(context, event) {
  const sheet = ensureAuditSchema_();

  const eventId = Utilities.getUuid();

  const row = [
    eventId,
    new Date(),
    context ? context.email : '',
    context ? context.name : '',
    normalize_(event.action),
    normalize_(event.module),
    normalize_(event.entityType),
    normalize_(event.recordId),
    normalize_(event.recordName),
    'EN_PROCESO',
    normalize_(event.detail),
    serializeAuditData_(event.before),
    ''
  ];

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  return eventId;
}

// ============================================================
// CIERRE DE UNA OPERACIÓN AUDITADA
// ============================================================

function completeAudit_(eventId, outcome) {
  const sheet = ensureAuditSchema_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('No existe el evento de auditoría que debe cerrarse.');
  }

  const match = sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(eventId)
    .matchEntireCell(true)
    .findNext();

  if (!match) {
    throw new Error(
      'No se encontró el evento de auditoría ' + eventId
    );
  }

  const rowNumber = match.getRow();
  const currentDetail = normalize_(
    sheet.getRange(rowNumber, 11).getDisplayValue()
  );

  const additionalDetail = normalize_(outcome.detail);

  const detail = [
    currentDetail,
    additionalDetail
  ].filter(Boolean).join(' | ');

  const values = [[
    normalize_(outcome.result) || 'OK',
    detail,
    serializeAuditData_(outcome.after)
  ]];

  // Columnas J:L no son contiguas con datos_despues:
  // J = resultado, K = detalle, M = datos_despues.
  sheet.getRange(rowNumber, 10, 1, 2)
    .setValues([[values[0][0], values[0][1]]]);

  sheet.getRange(rowNumber, 13)
    .setValue(values[0][2]);

  SpreadsheetApp.flush();
}

// ============================================================
// EJECUCIÓN AUDITADA
// ============================================================

function runAuditedMutation_(context, event, operation) {
  const eventId = beginAudit_(context, event);

  let outcome;

  try {
    outcome = operation();

  } catch (error) {
    try {
      completeAudit_(eventId, {
        result: 'ERROR',
        detail: error.message
      });
    } catch (auditError) {
      console.error(
        '[AUDIT_COMPLETION_FAILED] Evento ' + eventId +
        ': ' + auditError.message
      );
    }

    throw error;
  }

  // Si no se puede cerrar el evento, el registro permanece
  // EN_PROCESO y la función comunica el fallo al cliente.
  completeAudit_(eventId, {
    result: outcome && outcome.result
      ? outcome.result
      : 'OK',
    detail: outcome && outcome.detail
      ? outcome.detail
      : '',
    after: outcome ? outcome.after : null
  });

  return outcome ? outcome.value : undefined;
}

// ============================================================
// REGISTRO DE EVENTOS INMEDIATOS
// Para denegaciones y eventos que no modifican datos.
// ============================================================

function recordAudit_(
  context,
  action,
  moduleName,
  recordId,
  result,
  detail,
  options = {}
) {
  const sheet = ensureAuditSchema_();

  const row = [
    Utilities.getUuid(),
    new Date(),
    context ? context.email : '',
    context ? context.name : '',
    normalize_(action),
    normalize_(moduleName),
    normalize_(options.entityType) ||
      AUDIT_ENTITY_TYPES_[moduleName] ||
      normalize_(moduleName),
    normalize_(recordId),
    normalize_(options.recordName),
    normalize_(result),
    normalize_(detail),
    serializeAuditData_(options.before),
    serializeAuditData_(options.after)
  ];

  sheet.appendRow(row);
  SpreadsheetApp.flush();
}

// ============================================================
// CONSULTA DEL HISTORIAL DE AUDITORÍA
// ============================================================

function getAuditHistory(filters) {
  requirePermission_(
    'AUDITORIA_VER',
    'AUDITORIA',
    'CONSULTAR',
    ''
  );

  filters = filters && typeof filters === 'object'
    ? filters
    : {};

  const sheet = ensureAuditSchema_();
  const lastRow = sheet.getLastRow();

  const page = Math.max(
    1,
    Number.parseInt(filters.page, 10) || 1
  );

  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(filters.pageSize, 10) || 25)
  );

  if (lastRow < 2) {
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize
    };
  }

  const rows = sheet.getRange(
    2,
    1,
    lastRow - 1,
    AUDIT_HEADERS_.length
  ).getValues();

  const fromDate = normalize_(filters.fromDate);
  const toDate = normalize_(filters.toDate);

  const actorEmail = normalize_(
    filters.actorEmail
  ).toLowerCase();

  const moduleFilter = normalize_(
    filters.module
  ).toUpperCase();

  const actionFilter = normalize_(
    filters.action
  ).toUpperCase();

  const resultFilter = normalize_(
    filters.result
  ).toUpperCase();

  const entityType = normalize_(
    filters.entityType
  ).toUpperCase();

  const recordId = normalize_(filters.recordId);
  const recordName = normalize_(filters.recordName);
  const textQuery = normalize_(filters.query).toLowerCase();

  const timeZone = Session.getScriptTimeZone();

  const items = rows.map(row => {
    const dateValue = row[1];

    const date = dateValue instanceof Date
      ? dateValue
      : new Date(dateValue);

    return {
      eventId: normalize_(row[0]),
      date,
      actorEmail: normalize_(row[2]),
      actorName: normalize_(row[3]),
      action: normalize_(row[4]),
      module: normalize_(row[5]),
      entityType: normalize_(row[6]),
      recordId: normalize_(row[7]),
      recordName: normalize_(row[8]),
      result: normalize_(row[9]),
      detail: normalize_(row[10]),
      before: normalize_(row[11]),
      after: normalize_(row[12])
    };
  }).filter(item => {
    const dateIsValid =
      item.date instanceof Date &&
      !Number.isNaN(item.date.getTime());

    const dateString = dateIsValid
      ? Utilities.formatDate(item.date, timeZone, 'yyyy-MM-dd')
      : '';

    if (fromDate && (!dateString || dateString < fromDate)) {
      return false;
    }

    if (toDate && (!dateString || dateString > toDate)) {
      return false;
    }

    if (
      actorEmail &&
      item.actorEmail.toLowerCase() !== actorEmail
    ) {
      return false;
    }

    if (moduleFilter && item.module.toUpperCase() !== moduleFilter) {
      return false;
    }

    if (actionFilter && item.action.toUpperCase() !== actionFilter) {
      return false;
    }

    if (resultFilter && item.result.toUpperCase() !== resultFilter) {
      return false;
    }

    if (entityType && item.entityType.toUpperCase() !== entityType) {
      return false;
    }

    if (recordId || recordName) {
      const matchesId =
        Boolean(recordId) && item.recordId === recordId;

      const matchesName =
        Boolean(recordName) && item.recordName === recordName;

      if (!matchesId && !matchesName) {
        return false;
      }
    }

    if (textQuery) {
      const searchable = [
        item.actorEmail,
        item.actorName,
        item.action,
        item.module,
        item.entityType,
        item.recordId,
        item.recordName,
        item.result,
        item.detail
      ].join(' ').toLowerCase();

      if (!searchable.includes(textQuery)) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => b.date.getTime() - a.date.getTime());

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize).map(item => ({
      eventId: item.eventId,
      timestamp: item.date instanceof Date &&
        !Number.isNaN(item.date.getTime())
          ? Utilities.formatDate(
              item.date,
              timeZone,
              'yyyy-MM-dd HH:mm:ss'
            )
          : '',
      actorEmail: item.actorEmail,
      actorName: item.actorName,
      action: item.action,
      module: item.module,
      entityType: item.entityType,
      recordId: item.recordId,
      recordName: item.recordName,
      result: item.result,
      detail: item.detail,
      before: item.before,
      after: item.after
    })),
    total,
    page: currentPage,
    pageSize,
    totalPages
  };
}


function getLocationAuditEntityType_(type) {
  const types = {
    sedes: 'SEDE',
    departamentos: 'DEPARTAMENTO',
    provincias: 'PROVINCIA',
    distritos: 'DISTRITO'
  };

  return types[type] || 'UBICACION';
}

function getContextAuditHistory(params = {}) {
const auth = requirePermission_('AUDITORIA_VER');

  ensureAuditSchema_();

  const mode = String(params.mode || '').trim().toLowerCase();
  const actorEmail = String(params.actorEmail || '')
    .trim()
    .toLowerCase();

  const recordId = String(params.recordId || '').trim();
  const entityType = String(params.entityType || '')
    .trim()
    .toUpperCase();

  if (mode === 'usuario' && !actorEmail) {
    throw new Error('No se indicó el correo del usuario.');
  }

  if (mode === 'registro' && !recordId) {
    throw new Error('No se indicó el ID del registro.');
  }

  if (!['usuario', 'registro'].includes(mode)) {
    throw new Error('El tipo de historial solicitado no es válido.');
  }

  const spreadsheet = SpreadsheetApp.openById(
    CONFIG.SECURITY_SPREADSHEET_ID
  );

  const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_AUDIT);

  if (!sheet) {
    throw new Error('No se encontró la hoja Auditoria.');
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1
    };
  }

  const headers = values[0].map(value => String(value).trim());

  const index = {};
  headers.forEach((header, position) => {
    index[header] = position;
  });

  const requiredHeaders = [
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
    'datos_despues'
  ];

  const missing = requiredHeaders.filter(
    header => index[header] === undefined
  );

  if (missing.length) {
    throw new Error(
      'Faltan columnas de auditoría: ' + missing.join(', ')
    );
  }

  const normalizeEntityType = value => {
    const type = String(value || '').trim().toUpperCase();

    const aliases = {
      AGENTES: 'AGENTE',
      USUARIOS: 'USUARIO',
      ROLES: 'ROL',
      PERMISOS: 'PERMISO'
    };

    return aliases[type] || type;
  };

  const timestamp = value => {
    if (value instanceof Date) {
      return value.getTime();
    }

    const parsed = Date.parse(String(value || ''));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const formatDate = value => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return Utilities.formatDate(
        value,
        Session.getScriptTimeZone(),
        'dd/MM/yyyy HH:mm:ss'
      );
    }

    return String(value || '—');
  };

  const filtered = values.slice(1).filter(row => {
    if (mode === 'usuario') {
      const email = String(row[index.actor_correo] || '')
        .trim()
        .toLowerCase();

      return email === actorEmail;
    }

    const rowId = String(row[index.registro_id] || '').trim();

    if (rowId !== recordId) {
      return false;
    }

    const rowType = normalizeEntityType(
      row[index.tipo_entidad]
    );

    const requestedType = normalizeEntityType(entityType);

    // Los registros migrados del formato anterior podrían no
    // tener tipo_entidad; se conserva su coincidencia por ID.
    return !requestedType ||
      !rowType ||
      rowType === requestedType;
  });

  filtered.sort((a, b) =>
    timestamp(b[index.fecha_hora]) -
    timestamp(a[index.fecha_hora])
  );

  const pageSize = Math.min(
    100,
    Math.max(1, Number(params.pageSize) || 20)
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    totalPages,
    Math.max(1, Number(params.page) || 1)
  );

  const start = (page - 1) * pageSize;
  const selectedRows = filtered.slice(start, start + pageSize);

  const items = selectedRows.map(row => ({
    dateTime: formatDate(row[index.fecha_hora]),
    actorEmail: String(row[index.actor_correo] || ''),
    actorName: String(row[index.actor_nombre] || ''),
    action: String(row[index.accion] || ''),
    module: String(row[index.modulo] || ''),
    entityType: String(row[index.tipo_entidad] || ''),
    recordId: String(row[index.registro_id] || ''),
    recordName: String(row[index.registro_nombre] || ''),
    result: String(row[index.resultado] || ''),
    detail: String(row[index.detalle] || ''),
    before: String(row[index.datos_antes] || ''),
    after: String(row[index.datos_despues] || '')
  }));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages
  };
}