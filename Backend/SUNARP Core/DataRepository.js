
/**
 * SUNARP Core
 * Módulo: DataRepository
 *
 * Responsabilidad:
 * - Listar registros.
 * - Buscar registros por identificador.
 * - Insertar registros.
 * - Actualizar registros.
 * - Cambiar estados de registros.
 * - Eliminar registros.
 *
 * Utiliza las conexiones proporcionadas por DataSources.gs.
 *
 * No contiene nombres de aplicaciones, hojas ni campos específicos.
 */


/**
 * Ejecuta una operación de escritura utilizando un bloqueo.
 *
 * Evita que dos operaciones de escritura del mismo proyecto
 * se ejecuten simultáneamente.
 */
function _coreWithWriteLock_(callback) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    return callback();

  } catch (error) {
    throw new Error(
      `SUNARP Core: no se pudo completar la operación de escritura. ${error.message}`
    );

  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}


/**
 * Obtiene la estructura de una tabla y sus registros.
 *
 * Cada registro conserva su número de fila real en la hoja
 * para permitir operaciones de actualización y eliminación.
 */
function _coreGetTable_(source) {
  const context = _coreOpenSource_(source);

  const { config, sheet } = context;

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastColumn === 0 || lastRow < config.headerRow) {
    throw new Error(
      `SUNARP Core: la pestaña "${config.sheetName}" no contiene encabezados.`
    );
  }

  const headers = sheet
    .getRange(config.headerRow, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map(header => String(header).trim());

  const headerMap = {};

  headers.forEach((header, index) => {
    if (!header) {
      throw new Error(
        `SUNARP Core: existe un encabezado vacío en la columna ${index + 1}.`
      );
    }

    if (Object.prototype.hasOwnProperty.call(headerMap, header)) {
      throw new Error(
        `SUNARP Core: el encabezado "${header}" está duplicado.`
      );
    }

    headerMap[header] = index;
  });

  const dataStartRow = config.headerRow + 1;
  const numberOfRows = Math.max(0, lastRow - config.headerRow);

  const values = numberOfRows > 0
    ? _coreReadRange_(
        sheet,
        dataStartRow,
        1,
        numberOfRows,
        lastColumn
      )
    : [];

  const entries = values.map((row, index) => ({
    rowNumber: dataStartRow + index,
    values: row,
    record: _coreRowToRecord_(headers, row)
  }));

  return {
    config,
    spreadsheet: context.spreadsheet,
    sheet,
    headers,
    headerMap,
    entries
  };
}


/**
 * Convierte una fila de la hoja en un objeto.
 */
function _coreRowToRecord_(headers, row) {
  const record = {};

  headers.forEach((header, index) => {
    record[header] = row[index];
  });

  return record;
}


/**
 * Determina si una fila está completamente vacía.
 */
function _coreIsEmptyRow_(row) {
  return row.every(value =>
    value === '' || value === null || value === undefined
  );
}


/**
 * Compara dos valores de una columna.
 */
function _coreValuesEqual_(actual, expected) {
  if (
    actual === '' ||
    actual === null ||
    actual === undefined
  ) {
    return (
      expected === '' ||
      expected === null ||
      expected === undefined
    );
  }

  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();
  }

  return String(actual).trim() === String(expected).trim();
}


/**
 * Valida los campos de un registro.
 *
 * Impide insertar o actualizar columnas que no existen
 * en la estructura de la hoja.
 */
function _coreValidateRecordFields_(record, headers) {
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record)
  ) {
    throw new Error(
      'SUNARP Core: el registro debe ser un objeto.'
    );
  }

  const fields = Object.keys(record);

  if (fields.length === 0) {
    throw new Error(
      'SUNARP Core: no se proporcionaron campos para procesar.'
    );
  }

  fields.forEach(field => {
    if (!headers.includes(field)) {
      throw new Error(
        `SUNARP Core: el campo "${field}" no existe en la estructura de datos.`
      );
    }

    const value = record[field];

    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      !(value instanceof Date) &&
      !['string', 'number', 'boolean'].includes(typeof value)
    ) {
      throw new Error(
        `SUNARP Core: el valor del campo "${field}" no es válido.`
      );
    }

    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(
        `SUNARP Core: el valor numérico del campo "${field}" no es válido.`
      );
    }
  });

  return fields;
}


/**
 * Obtiene el índice de una columna.
 */
function _coreGetFieldIndex_(table, fieldName) {
  if (!Object.prototype.hasOwnProperty.call(table.headerMap, fieldName)) {
    throw new Error(
      `SUNARP Core: no existe la columna "${fieldName}".`
    );
  }

  return table.headerMap[fieldName];
}


/**
 * Busca una fila mediante el valor de su identificador.
 */
function _coreFindEntryById_(table, idField, id) {
  if (id === null || id === undefined || String(id).trim() === '') {
    throw new Error(
      'SUNARP Core: debes proporcionar un identificador válido.'
    );
  }

  const fieldIndex = _coreGetFieldIndex_(table, idField);

  return table.entries.find(entry =>
    !_coreIsEmptyRow_(entry.values) &&
    _coreValuesEqual_(entry.values[fieldIndex], id)
  ) || null;
}


/**
 * Compara valores para ordenar registros.
 */
function _coreCompareValues_(valueA, valueB) {
  const emptyA =
    valueA === '' || valueA === null || valueA === undefined;

  const emptyB =
    valueB === '' || valueB === null || valueB === undefined;

  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  if (valueA instanceof Date && valueB instanceof Date) {
    return valueA.getTime() - valueB.getTime();
  }

  if (
    typeof valueA === 'number' &&
    typeof valueB === 'number'
  ) {
    return valueA - valueB;
  }

  return String(valueA).localeCompare(
    String(valueB),
    'es',
    {
      numeric: true,
      sensitivity: 'base'
    }
  );
}


/**
 * Lista registros de una fuente de datos.
 *
 * Opciones:
 * {
 *   filters: { campo: valor },
 *   search: 'texto',
 *   searchFields: ['campo1', 'campo2'],
 *   sortBy: 'campo',
 *   sortDirection: 'asc' | 'desc',
 *   offset: 0,
 *   limit: 10
 * }
 *
 * Devuelve:
 * {
 *   records: [],
 *   total: 0,
 *   offset: 0,
 *   limit: 10
 * }
 */
function listRecords(source, options) {
  options = options || {};

  const table = _coreGetTable_(source);

  let records = table.entries
    .filter(entry => !_coreIsEmptyRow_(entry.values))
    .map(entry => entry.record);

  // Aplicar filtros exactos.
  if (options.filters !== undefined) {
    if (
      !options.filters ||
      typeof options.filters !== 'object' ||
      Array.isArray(options.filters)
    ) {
      throw new Error(
        'SUNARP Core: los filtros deben proporcionarse como un objeto.'
      );
    }

    const filters = options.filters;

    Object.keys(filters).forEach(field => {
      _coreGetFieldIndex_(table, field);

      const expected = filters[field];

      records = records.filter(record => {
        const actual = record[field];

        if (Array.isArray(expected)) {
          return expected.some(value =>
            _coreValuesEqual_(actual, value)
          );
        }

        return _coreValuesEqual_(actual, expected);
      });
    });
  }

  // Aplicar búsqueda general.
  const search = String(options.search || '').trim().toLocaleLowerCase();

  if (search) {
    const searchFields = options.searchFields || table.headers;

    if (!Array.isArray(searchFields)) {
      throw new Error(
        'SUNARP Core: searchFields debe ser un arreglo.'
      );
    }

    searchFields.forEach(field => _coreGetFieldIndex_(table, field));

    records = records.filter(record =>
      searchFields.some(field => {
        const value = record[field];

        const text = value instanceof Date
          ? value.toISOString()
          : String(value === null || value === undefined ? '' : value);

        return text.toLocaleLowerCase().includes(search);
      })
    );
  }

  // Registrar el total antes de aplicar paginación.
  const total = records.length;

  // Aplicar ordenamiento.
  if (options.sortBy) {
    const sortBy = String(options.sortBy);
    const sortDirection = String(
      options.sortDirection || 'asc'
    ).toLowerCase();

    if (!['asc', 'desc'].includes(sortDirection)) {
      throw new Error(
        'SUNARP Core: sortDirection debe ser "asc" o "desc".'
      );
    }

    _coreGetFieldIndex_(table, sortBy);

    const direction = sortDirection === 'desc' ? -1 : 1;

    records.sort((a, b) =>
      _coreCompareValues_(a[sortBy], b[sortBy]) * direction
    );
  }

  // Aplicar paginación.
  const offset = options.offset === undefined
    ? 0
    : Number(options.offset);

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(
      'SUNARP Core: offset debe ser un entero mayor o igual a cero.'
    );
  }

  let limit = null;

  if (options.limit !== undefined && options.limit !== null) {
    limit = Number(options.limit);

    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(
        'SUNARP Core: limit debe ser un entero mayor o igual a cero.'
      );
    }

    records = records.slice(offset, offset + limit);

  } else {
    records = records.slice(offset);
  }

  return {
    records,
    total,
    offset,
    limit
  };
}


/**
 * Obtiene un registro mediante su identificador.
 *
 * Devuelve null cuando no encuentra coincidencias.
 */
function getRecordById(source, idField, id) {
  const table = _coreGetTable_(source);

  const entry = _coreFindEntryById_(table, idField, id);

  return entry ? entry.record : null;
}


/**
 * Busca registros mediante coincidencias exactas en una o más columnas.
 *
 * La columna indicada por options.searchField (o el primer filtro) se
 * consulta mediante TextFinder de Sheets. Core no descarga toda la tabla:
 * solo recupera las filas coincidentes y aplica los filtros restantes.
 *
 * options:
 * {
 *   searchField: 'correo_institucional',
 *   matchCase: false,
 *   requiredHeaders: ['persona_id', 'correo_institucional']
 * }
 */
function findRecordsByFields(source, filters, options) {
  options = options || {};

  if (
    !filters ||
    typeof filters !== 'object' ||
    Array.isArray(filters) ||
    !Object.keys(filters).length
  ) {
    throw new Error('SUNARP Core: debes indicar al menos un filtro exacto.');
  }

  const context = _coreOpenSource_(source);
  const config = context.config;
  const sheet = context.sheet;
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (!lastColumn || lastRow < config.headerRow) {
    throw new Error('SUNARP Core: la fuente no contiene encabezados.');
  }

  const headers = sheet.getRange(
    config.headerRow, 1, 1, lastColumn
  ).getDisplayValues()[0].map(value => String(value).trim());

  const headerMap = {};
  headers.forEach((header, index) => {
    if (!header || Object.prototype.hasOwnProperty.call(headerMap, header)) {
      throw new Error(
        'SUNARP Core: existen encabezados vacíos o duplicados en "' +
        config.sheetName + '".'
      );
    }
    headerMap[header] = index;
  });

  const filterFields = Object.keys(filters);
  const requiredHeaders = Array.isArray(options.requiredHeaders)
    ? options.requiredHeaders
    : [];
  const missing = [...new Set(filterFields.concat(requiredHeaders))]
    .filter(field => !Object.prototype.hasOwnProperty.call(headerMap, field));

  if (missing.length) {
    throw new Error(
      'SUNARP Core: la fuente "' + config.sheetName +
      '" no contiene las columnas requeridas: ' + missing.join(', ') + '.'
    );
  }

  const searchField = String(options.searchField || filterFields[0]);
  if (!Object.prototype.hasOwnProperty.call(filters, searchField)) {
    throw new Error('SUNARP Core: searchField debe formar parte de los filtros.');
  }

  const expectedValues = Array.isArray(filters[searchField])
    ? filters[searchField]
    : [filters[searchField]];
  const candidateRows = new Set();
  const dataStartRow = config.headerRow + 1;
  const dataRows = Math.max(0, lastRow - config.headerRow);

  if (!dataRows) return { records: [], total: 0 };

  expectedValues.forEach(expected => {
    if (expected === null || expected === undefined || String(expected) === '') {
      throw new Error(
        'SUNARP Core: los filtros de búsqueda exacta no admiten valores vacíos.'
      );
    }

    const range = sheet.getRange(
      dataStartRow,
      headerMap[searchField] + 1,
      dataRows,
      1
    );
    const finder = range.createTextFinder(String(expected))
      .matchEntireCell(true)
      .matchCase(options.matchCase !== false);

    finder.findAll().forEach(cell => candidateRows.add(cell.getRow()));
  });

  const records = [];
  [...candidateRows].sort((a, b) => a - b).forEach(rowNumber => {
    const values = sheet.getRange(
      rowNumber, 1, 1, lastColumn
    ).getValues()[0];
    const record = _coreRowToRecord_(headers, values);

    const matches = filterFields.every(field => {
      if (field === searchField) return true;
      const expected = filters[field];
      if (Array.isArray(expected)) {
        return expected.some(value => _coreValuesEqual_(record[field], value));
      }
      return _coreValuesEqual_(record[field], expected);
    });

    if (matches && !_coreIsEmptyRow_(values)) records.push(record);
  });

  return {
    records,
    total: records.length
  };
}


/**
 * Inserta un nuevo registro.
 *
 * options:
 * {
 *   idField: 'id'
 * }
 *
 * Si se proporciona idField, verifica que el identificador
 * exista y no esté duplicado.
 *
 * La generación del identificador corresponde a la aplicación
 * que utiliza la biblioteca.
 */
function insertRecord(source, record, options) {
  options = options || {};

  return _coreWithWriteLock_(() => {
    const table = _coreGetTable_(source);

    const fields = _coreValidateRecordFields_(
      record,
      table.headers
    );

    if (options.schema) {
      assertValidRecord(record, options.schema);
    }

    if (options.idField) {
      const idField = String(options.idField);

      _coreGetFieldIndex_(table, idField);

      const id = record[idField];

      if (id === null || id === undefined || String(id).trim() === '') {
        throw new Error(
          `SUNARP Core: el campo identificador "${idField}" es obligatorio.`
        );
      }

      if (_coreFindEntryById_(table, idField, id)) {
        throw new Error(
          `SUNARP Core: el identificador "${id}" ya existe.`
        );
      }
    }

    // Restricciones compuestas opcionales. Se comprueban dentro
    // del mismo ScriptLock que la inserción para evitar duplicados
    // por solicitudes concurrentes.
    const uniqueFields = Array.isArray(options.uniqueFields)
      ? [...new Set(options.uniqueFields.map(String))]
      : [];

    uniqueFields.forEach(field => _coreGetFieldIndex_(table, field));

    if (uniqueFields.length) {
      const duplicate = table.entries.some(entry =>
        !_coreIsEmptyRow_(entry.values) &&
        uniqueFields.every(field =>
          _coreValuesEqual_(entry.record[field], record[field])
        )
      );

      if (duplicate) {
        throw new Error(
          'SUNARP Core: ya existe un registro con la combinación de campos únicos indicada.'
        );
      }
    }

    const row = table.headers.map(header => {
      if (!Object.prototype.hasOwnProperty.call(record, header)) {
        return '';
      }

      const value = record[header];

      return value === null || value === undefined ? '' : value;
    });

    const targetRow = Math.max(
      table.config.headerRow + 1,
      table.sheet.getLastRow() + 1
    );

    table.sheet
      .getRange(targetRow, 1, 1, row.length)
      .setValues([row]);

    SpreadsheetApp.flush();
    _coreInvalidateSourceCache_(source);

    const insertedRecord = _coreRowToRecord_(
      table.headers,
      row
    );

    return {
      success: true,
      message: 'Registro insertado correctamente.',
      record: insertedRecord
    };
  });
}


/**
 * Actualiza un registro existente.
 *
 * No permite modificar el campo identificador.
 * Solo escribe las columnas indicadas en updates,
 * evitando alterar otras columnas de la misma fila.
 */
function updateRecord(source, idField, id, updates, options) {
  options = options || {};
  return _coreWithWriteLock_(() => {
    const table = _coreGetTable_(source);

    const idIndex = _coreGetFieldIndex_(table, idField);

    const entry = _coreFindEntryById_(table, idField, id);

    if (!entry) {
      throw new Error(
        `SUNARP Core: no se encontró el registro con identificador "${id}".`
      );
    }

    const fields = _coreValidateRecordFields_(
      updates,
      table.headers
    );

    if (options.schema) {
      assertValidRecord(updates, options.schema, {
        partial: true
      });
    }

    if (fields.includes(idField)) {
      throw new Error(
        'SUNARP Core: no está permitido modificar el identificador del registro.'
      );
    }

    // Verificar restricciones compuestas dentro del mismo bloqueo
    // que protege la actualización.
    const uniqueFields = Array.isArray(options.uniqueFields)
      ? [...new Set(options.uniqueFields.map(String))]
      : [];

    uniqueFields.forEach(field => _coreGetFieldIndex_(table, field));

    if (uniqueFields.length) {
      const candidate = Object.assign({}, entry.record, updates);
      const duplicate = table.entries.some(other =>
        other.rowNumber !== entry.rowNumber &&
        !_coreIsEmptyRow_(other.values) &&
        uniqueFields.every(field =>
          _coreValuesEqual_(other.record[field], candidate[field])
        )
      );

      if (duplicate) {
        throw new Error(
          'SUNARP Core: la actualización generaría un registro duplicado para la combinación de campos únicos indicada.'
        );
      }
    }

    fields.forEach(field => {
      const columnIndex = _coreGetFieldIndex_(table, field);

      const value = updates[field];

      table.sheet
        .getRange(entry.rowNumber, columnIndex + 1)
        .setValue(
          value === null || value === undefined ? '' : value
        );
    });

    SpreadsheetApp.flush();
    _coreInvalidateSourceCache_(source);

    const updatedRecord = table.headers.reduce((record, header, index) => {
      record[header] = entry.values[index];
      return record;
    }, {});

    fields.forEach(field => {
      updatedRecord[field] =
        updates[field] === null || updates[field] === undefined
          ? ''
          : updates[field];
    });

    // El identificador permanece inalterado.
    updatedRecord[idField] = entry.values[idIndex];

    return {
      success: true,
      message: 'Registro actualizado correctamente.',
      record: updatedRecord
    };
  });
}


/**
 * Modifica el valor de un campo de estado.
 *
 * Permite activar, desactivar o cambiar cualquier estado
 * sin imponer nombres de columnas específicos.
 */
function setRecordStatus(
  source,
  idField,
  id,
  statusField,
  statusValue,
  options
) {
  const updates = {};

  updates[statusField] = statusValue;

  return updateRecord(
    source,
    idField,
    id,
    updates,
    options
  );
}


/**
 * Elimina físicamente un registro.
 *
 * Esta operación elimina la fila completa de la hoja.
 * Para conservar el historial, se recomienda utilizar
 * setRecordStatus() con un campo de estado.
 */
function deleteRecord(source, idField, id) {
  return _coreWithWriteLock_(() => {
    const table = _coreGetTable_(source);

    const entry = _coreFindEntryById_(table, idField, id);

    if (!entry) {
      throw new Error(
        `SUNARP Core: no se encontró el registro con identificador "${id}".`
      );
    }

    table.sheet.deleteRow(entry.rowNumber);

    SpreadsheetApp.flush();
    _coreInvalidateSourceCache_(source);

    return {
      success: true,
      message: 'Registro eliminado correctamente.',
      id
    };
  });
}


/**
 * SUNARP Core
 * DataRepository
 *
 * Lectura agrupada de varias pestañas.
 *
 * Recibe varias fuentes de datos, agrupa las solicitudes
 * por spreadsheetId y abre cada archivo una sola vez.
 *
 * Parámetro:
 * [
 *   {
 *     key: 'sedes',
 *     source: {
 *       spreadsheetId: '...',
 *       sheetName: 'sede',
 *       headerRow: 1,
 *       label: 'Global parameters - sede'
 *     }
 *   }
 * ]
 *
 * Resultado:
 * {
 *   sedes: [],
 *   cargos: []
 * }
 */
/**
 * Lectura agrupada con caché reutilizable por fuente.
 *
 * Cada pestaña mantiene una instantánea independiente. Así, varios
 * módulos pueden compartir los mismos datos y una escritura invalida
 * automáticamente la instantánea de la pestaña afectada.
 *
 * expirationSeconds: 1..21600 (por defecto 300).
 */
function listRecordsFromSourcesCached(requests, expirationSeconds) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error('SUNARP Core: debes proporcionar una lista de fuentes de datos.');
  }

  const ttl = expirationSeconds === undefined ? 300 : Number(expirationSeconds);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 21600) {
    throw new Error('SUNARP Core: el TTL de caché debe estar entre 1 y 21600 segundos.');
  }

  const started = Date.now();
  const result = {};
  const misses = [];
  const seen = new Set();

  requests.forEach(request => {
    if (!request || typeof request !== 'object') {
      throw new Error('SUNARP Core: una solicitud de lectura no es válida.');
    }

    const key = String(request.key || '').trim();
    if (!key || seen.has(key)) {
      throw new Error('SUNARP Core: cada solicitud necesita una clave única de resultado.');
    }
    seen.add(key);

    const cacheKey = _coreBuildSourceCacheKey_(request.source, 'records');
    const cached = getCachedValue(cacheKey);

    if (Array.isArray(cached)) {
      result[key] = cached;
    } else {
      misses.push({
        key,
        source: request.source,
        cacheKey,
        requiredHeaders: request.requiredHeaders || []
      });
    }
  });

  if (misses.length) {
    const loaded = listRecordsFromSources(misses.map(item => ({
      key: item.key,
      source: item.source,
      requiredHeaders: item.requiredHeaders
    })));

    misses.forEach(item => {
      const records = loaded[item.key] || [];
      result[item.key] = records;
      try {
        putCachedValue(item.cacheKey, records, ttl);
      } catch (error) {
        console.warn('[SUNARP Core] No se pudo almacenar la fuente en caché:', item.key, error.message);
      }
    });
  }

  console.log(
    '[SUNARP Core] Lectura con caché:',
    requests.length - misses.length, 'aciertos,',
    misses.length, 'lecturas de fuente,',
    Date.now() - started, 'ms'
  );

  return result;
}


function listRecordsFromSources(requests) {

  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error(
      'SUNARP Core: debes proporcionar una lista de fuentes de datos.'
    );
  }

  const started = Date.now();

  const result = {};
  const groups = new Map();
  const requestedKeys = new Set();

  // 1. Validar y agrupar las fuentes por archivo.
  requests.forEach(request => {

    if (!request || typeof request !== 'object') {
      throw new Error(
        'SUNARP Core: una solicitud de lectura no es válida.'
      );
    }

    const key = String(request.key || '').trim();

    if (!key) {
      throw new Error(
        'SUNARP Core: cada solicitud necesita una clave de resultado.'
      );
    }

    if (Object.prototype.hasOwnProperty.call(result, key)) {
      throw new Error(
        `SUNARP Core: la clave "${key}" está duplicada.`
      );
    }

    const config = _coreNormalizeSourceConfig_(
      request.source
    );
    const requiredHeaders = request.requiredHeaders === undefined
      ? []
      : request.requiredHeaders;

    if (!Array.isArray(requiredHeaders) || requiredHeaders.some(header => !String(header || '').trim())) {
      throw new Error('SUNARP Core: requiredHeaders debe ser un arreglo de nombres de columnas válidos.');
    }

    const groupKey = config.spreadsheetId;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey).push({
      key,
      config,
      requiredHeaders: requiredHeaders.map(String)
    });

    requestedKeys.add(key);

  });

  // 2. Abrir cada archivo una sola vez.
  groups.forEach((group, spreadsheetId) => {

    const labels = group
      .map(item => item.config.label)
      .join(', ');

    const openStarted = Date.now();

    const spreadsheet = _coreOpenSpreadsheet_(
      spreadsheetId,
      labels
    );

    console.log(
      '[SUNARP Core] Archivo abierto:',
      spreadsheet.getName(),
      Date.now() - openStarted,
      'ms'
    );

    // 3. Leer todas las pestañas solicitadas de ese archivo.
    group.forEach(item => {

      const config = item.config;

      const sheet = spreadsheet.getSheetByName(
        config.sheetName
      );

      if (!sheet) {
        throw new Error(
          `SUNARP Core: no existe la pestaña "${config.sheetName}" ` +
          `en el archivo "${spreadsheet.getName()}".`
        );
      }

      const readStarted = Date.now();

      // Una lectura de datos por pestaña.
      const values = sheet.getDataRange().getValues();

      if (
        values.length < config.headerRow ||
        values[config.headerRow - 1].length === 0
      ) {
        throw new Error(
          `SUNARP Core: la pestaña "${config.sheetName}" no contiene encabezados.`
        );
      }

      const headers = values[
        config.headerRow - 1
      ].map(header => String(header).trim());

      const headerMap = {};

      headers.forEach((header, index) => {

        if (!header) {
          throw new Error(
            `SUNARP Core: existe un encabezado vacío en "${config.sheetName}", columna ${index + 1}.`
          );
        }

        if (
          Object.prototype.hasOwnProperty.call(
            headerMap,
            header
          )
        ) {
          throw new Error(
            `SUNARP Core: el encabezado "${header}" está duplicado en "${config.sheetName}".`
          );
        }

        headerMap[header] = index;

      });

      const missingHeaders = item.requiredHeaders.filter(header =>
        !Object.prototype.hasOwnProperty.call(headerMap, header)
      );
      if (missingHeaders.length) {
        throw new Error(
          `SUNARP Core: la pestaña "${config.sheetName}" no contiene las columnas requeridas: ${missingHeaders.join(', ')}.`
        );
      }

      // 4. Convertir las filas en registros.
      const dataRows = values.slice(config.headerRow);

      result[item.key] = dataRows
        .filter(row => !_coreIsEmptyRow_(row))
        .map(row => _coreRowToRecord_(headers, row));

      console.log(
        '[SUNARP Core] Pestaña leída:',
        config.sheetName,
        result[item.key].length,
        'registros,',
        Date.now() - readStarted,
        'ms'
      );

    });

  });

  console.log(
    '[SUNARP Core] Lectura agrupada finalizada:',
    groups.size,
    'archivos,',
    requestedKeys.size,
    'pestañas,',
    Date.now() - started,
    'ms'
  );

  return result;

}

