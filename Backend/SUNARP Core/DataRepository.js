
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
 * Recupera una página desde una fuente append-only usando únicamente las
 * columnas de identificador/fecha durante el barrido. Lee las filas completas
 * solamente para los registros que corresponden a la página solicitada.
 *
 * Se activa al declarar idField; el modo antiguo por filas físicas se conserva
 * para no cambiar consumidores existentes que aún no declaran una clave.
 */
function _coreListTailByIndex_(context, options) {
  const { config, sheet } = context;
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
    headerMap[header] = index + 1;
  });

  const idField = String(options.idField || '').trim();
  const dateField = String(options.dateField || options.sortBy || '').trim();
  const sortBy = String(options.sortBy || dateField || '').trim();
  const requiredHeaders = Array.isArray(options.requiredHeaders)
    ? options.requiredHeaders
    : [];
  const needed = [idField, dateField, sortBy].filter(Boolean);
  const missing = [...new Set(requiredHeaders.concat(needed))].filter(field =>
    !Object.prototype.hasOwnProperty.call(headerMap, field)
  );
  if (missing.length) {
    throw new Error(
      'SUNARP Core: la fuente "' + config.sheetName +
      '" no contiene las columnas requeridas: ' + missing.join(', ') + '.'
    );
  }
  if (!idField) throw new Error('SUNARP Core: idField es obligatorio para la lectura de cola indexada.');

  const offset = options.offset === undefined ? 0 : Number(options.offset);
  const limit = options.limit === undefined ? 25 : Number(options.limit);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('SUNARP Core: offset debe ser un entero mayor o igual a cero.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('SUNARP Core: limit debe ser un entero entre 1 y 1000.');
  }

  const fromDate = options.fromDate === undefined || options.fromDate === null
    ? null
    : new Date(options.fromDate);
  const toDate = options.toDate === undefined || options.toDate === null
    ? null
    : new Date(options.toDate);
  if (fromDate && Number.isNaN(fromDate.getTime())) {
    throw new Error('SUNARP Core: fromDate no contiene una fecha válida.');
  }
  if (toDate && Number.isNaN(toDate.getTime())) {
    throw new Error('SUNARP Core: toDate no contiene una fecha válida.');
  }
  if ((fromDate || toDate) && !dateField) {
    throw new Error('SUNARP Core: dateField es obligatorio para filtrar por rango temporal.');
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error('SUNARP Core: fromDate no puede ser posterior a toDate.');
  }

  const dataStartRow = config.headerRow + 1;
  const rowCount = Math.max(0, lastRow - config.headerRow);
  if (!rowCount) {
    return { records: [], total: 0, offset, limit, hasMore: false };
  }

  const idValues = sheet.getRange(
    dataStartRow, headerMap[idField], rowCount, 1
  ).getValues();
  const dateColumn = dateField ? headerMap[dateField] : 0;
  const dateValues = dateColumn
    ? sheet.getRange(dataStartRow, dateColumn, rowCount, 1).getValues()
    : null;

  const maxRetained = offset + limit;
  const selected = [];
  let total = 0;
  const sortTimestamp = value => {
    if (value instanceof Date) return value.getTime();
    if (value === null || value === undefined || value === '') return NaN;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? NaN : parsed;
  };
  const compare = (left, right) => {
    const leftTime = left.sortTimestamp;
    const rightTime = right.sortTimestamp;
    if (leftTime !== rightTime) {
      if (Number.isNaN(leftTime)) return 1;
      if (Number.isNaN(rightTime)) return -1;
      return rightTime - leftTime;
    }
    return right.rowNumber - left.rowNumber;
  };

  for (let index = 0; index < rowCount; index++) {
    const id = idValues[index] && idValues[index][0];
    if (id === null || id === undefined || String(id).trim() === '') continue;

    const dateValue = dateValues ? dateValues[index][0] : null;
    const timestamp = dateField ? sortTimestamp(dateValue) : NaN;
    if ((fromDate || toDate) && Number.isNaN(timestamp)) continue;
    if (fromDate && timestamp < fromDate.getTime()) continue;
    if (toDate && timestamp > toDate.getTime()) continue;

    total++;
    const candidate = {
      rowNumber: dataStartRow + index,
      sortTimestamp: sortBy ? timestamp : NaN
    };
    if (!sortBy) candidate.sortTimestamp = candidate.rowNumber;

    let low = 0;
    let high = selected.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (compare(candidate, selected[middle]) < 0) high = middle;
      else low = middle + 1;
    }
    if (low >= maxRetained && selected.length >= maxRetained) continue;
    selected.splice(low, 0, candidate);
    if (selected.length > maxRetained) selected.pop();
  }

  const pagePointers = selected.slice(offset, offset + limit);
  const rowNumbers = pagePointers.map(item => item.rowNumber);
  const rowsByNumber = rowNumbers.length
    ? _coreReadCandidateRows_(
        sheet, rowNumbers, lastColumn, dataStartRow, 25
      )
    : new Map();
  const records = rowNumbers.map(rowNumber => {
    const values = rowsByNumber.get(rowNumber);
    if (!values) return null;
    return _coreRowToRecord_(headers, values);
  }).filter(Boolean);

  return {
    records,
    total,
    offset,
    limit,
    hasMore: total > offset + records.length
  };
}

/**
 * Compara dos valores de una columna.
 */

/**
 * Lee filas candidatas agrupándolas en ventanas pequeñas. Evita ejecutar
 * un getRange por cada coincidencia cuando una consulta devuelve muchos IDs.
 */
function _coreReadCandidateRows_(sheet, rowNumbers, lastColumn, dataStartRow, windowSize) {
  const size = Number(windowSize) || 25;
  const windows = new Map();
  rowNumbers.forEach(rowNumber => {
    const startRow = dataStartRow +
      Math.floor((rowNumber - dataStartRow) / size) * size;
    if (!windows.has(startRow)) windows.set(startRow, []);
    windows.get(startRow).push(rowNumber);
  });

  const result = new Map();
  windows.forEach((candidates, startRow) => {
    const endRow = Math.min(
      startRow + size - 1,
      Math.max(...candidates)
    );
    const values = sheet.getRange(
      startRow, 1, endRow - startRow + 1, lastColumn
    ).getValues();
    candidates.forEach(rowNumber => {
      result.set(rowNumber, values[rowNumber - startRow]);
    });
  });
  return result;
}



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
 * Lee una página de una fuente append-only.
 *
 * Modo legado (sin idField): usa filas físicas desde el final de la hoja.
 * Modo indexado (con idField): cuenta solo registros con identificador,
 * puede filtrar por fromDate/toDate usando dateField, ordena por fecha
 * descendente y recupera filas completas en ventanas pequeñas solo para la
 * página solicitada. El barrido inicial lee las columnas de índice y fecha.
 */
function listTailRecords(source, options) {
  options = options || {};
  const context = _coreOpenSource_(source);
  if (options.idField) return _coreListTailByIndex_(context, options);
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

  const requiredHeaders = Array.isArray(options.requiredHeaders)
    ? options.requiredHeaders
    : [];
  const missing = requiredHeaders.filter(field =>
    !Object.prototype.hasOwnProperty.call(headerMap, field)
  );
  if (missing.length) {
    throw new Error(
      'SUNARP Core: la fuente "' + config.sheetName +
      '" no contiene las columnas requeridas: ' + missing.join(', ') + '.'
    );
  }

  const offset = options.offset === undefined ? 0 : Number(options.offset);
  const limit = options.limit === undefined ? 25 : Number(options.limit);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('SUNARP Core: offset debe ser un entero mayor o igual a cero.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('SUNARP Core: limit debe ser un entero entre 1 y 1000.');
  }

  const dataStartRow = config.headerRow + 1;
  const total = Math.max(0, lastRow - config.headerRow);
  const endRow = lastRow - offset;
  if (endRow < dataStartRow) {
    return { records: [], total, offset, limit, hasMore: false };
  }

  const startRow = Math.max(dataStartRow, endRow - limit + 1);
  const numberOfRows = endRow - startRow + 1;
  const values = sheet.getRange(
    startRow, 1, numberOfRows, lastColumn
  ).getValues();
  const records = [];

  for (let index = values.length - 1; index >= 0; index--) {
    const row = values[index];
    if (_coreIsEmptyRow_(row)) continue;
    records.push(_coreRowToRecord_(headers, row));
  }

  return {
    records,
    total,
    offset,
    limit,
    hasMore: startRow > dataStartRow
  };
}


/**
 * Recupera un registro por identificador sin materializar toda la tabla.
 * Mantiene la semántica anterior: devuelve la primera coincidencia de hoja
 * o null cuando no existe. Las búsquedas exactas se resuelven en Sheets.
 */
function getRecordById(source, idField, id) {
  if (id === null || id === undefined || String(id).trim() === '') {
    throw new Error('SUNARP Core: debes proporcionar un identificador válido.');
  }
  const result = findRecordsByFields(
    source,
    { [idField]: id },
    { searchField: idField }
  );
  return (result.records || [])[0] || null;
}


/**
 * Lee únicamente un conjunto declarado de columnas para filas candidatas.
 * Agrupa filas por ventanas y columnas contiguas para reducir lecturas de Sheets.
 */
function _coreReadProjectedCandidateRows_(
  sheet, rowNumbers, headerMap, fields, dataStartRow, windowSize
) {
  const selectedFields = Array.from(new Set(fields || []));
  if (!selectedFields.length) {
    throw new Error('SUNARP Core: projectionFields debe contener al menos una columna.');
  }
  const columns = selectedFields.map(field => {
    if (!Object.prototype.hasOwnProperty.call(headerMap, field)) {
      throw new Error('SUNARP Core: no existe la columna proyectada "' + field + '".');
    }
    return { field, index: headerMap[field] };
  }).sort((a, b) => a.index - b.index);

  const blocks = [];
  columns.forEach(column => {
    const previous = blocks[blocks.length - 1];
    if (previous && column.index === previous.end + 1) {
      previous.end = column.index;
      previous.fields.push(column);
    } else {
      blocks.push({
        start: column.index,
        end: column.index,
        fields: [column]
      });
    }
  });

  const size = Number(windowSize) || 25;
  const windows = new Map();
  rowNumbers.forEach(rowNumber => {
    const startRow = dataStartRow +
      Math.floor((rowNumber - dataStartRow) / size) * size;
    if (!windows.has(startRow)) windows.set(startRow, []);
    windows.get(startRow).push(rowNumber);
  });

  const result = new Map();
  windows.forEach((candidates, startRow) => {
    const endRow = Math.min(
      startRow + size - 1,
      Math.max.apply(null, candidates)
    );
    const rowCount = endRow - startRow + 1;
    const blockValues = blocks.map(block => ({
      block,
      values: sheet.getRange(
        startRow,
        block.start + 1,
        rowCount,
        block.end - block.start + 1
      ).getValues()
    }));

    candidates.forEach(rowNumber => {
      const offset = rowNumber - startRow;
      const record = {};
      blockValues.forEach(item => {
        item.block.fields.forEach(column => {
          record[column.field] =
            item.values[offset][column.index - item.block.start];
        });
      });
      result.set(rowNumber, record);
    });
  });
  return result;
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
 *   requiredHeaders: ['persona_id', 'correo_institucional'],
 *   projectionFields: ['persona_id', 'nombres']
 * }
 *
 * Cuando se declara projectionFields, Core devuelve únicamente esos campos
 * y los filtros exactos necesarios para comprobar la coincidencia.
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
  if (options.projectionFields !== undefined &&
      (!Array.isArray(options.projectionFields) || !options.projectionFields.length ||
       options.projectionFields.some(field => typeof field !== 'string' || !field.trim()))) {
    throw new Error('SUNARP Core: projectionFields debe ser un arreglo de nombres de columna no vacío.');
  }
  const projectionFields = options.projectionFields === undefined
    ? null
    : Array.from(new Set(filterFields.concat(options.projectionFields)));
  const missing = [...new Set(
    filterFields.concat(requiredHeaders, projectionFields || [])
  )].filter(field => !Object.prototype.hasOwnProperty.call(headerMap, field));

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
  if (expectedValues.some(expected =>
    expected === null || expected === undefined || String(expected) === ''
  )) {
    throw new Error(
      'SUNARP Core: los filtros de búsqueda exacta no admiten valores vacíos.'
    );
  }

  const candidateRows = new Set();
  const dataStartRow = config.headerRow + 1;
  const dataRows = Math.max(0, lastRow - config.headerRow);
  if (!dataRows) return { records: [], total: 0 };

  const range = sheet.getRange(
    dataStartRow,
    headerMap[searchField] + 1,
    dataRows,
    1
  );

  const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, character => '\\' + character);
  const buildPattern = value => {
    const escaped = escapeRegex(options.ignoreWhitespace ? String(value).replace(/\s+/g, '') : value);
    return options.ignoreWhitespace
      ? '^\\s*' + escaped.split('').join('\\s*') + '\\s*$'
      : '^(?:' + escaped + ')$';
  };

  if (options.ignoreWhitespace) {
    for (let i = 0; i < expectedValues.length; i += 50) {
      const patterns = expectedValues.slice(i, i + 50).map(buildPattern);
      const finder = range.createTextFinder('(?:' + patterns.join('|') + ')')
        .useRegularExpression(true)
        .matchCase(options.matchCase !== false);
      finder.findAll().forEach(cell => candidateRows.add(cell.getRow()));
    }
  } else if (expectedValues.length === 1) {
    range.createTextFinder(String(expectedValues[0]))
      .matchEntireCell(true)
      .matchCase(options.matchCase !== false)
      .findAll()
      .forEach(cell => candidateRows.add(cell.getRow()));
  } else {
    for (let i = 0; i < expectedValues.length; i += 100) {
      const batch = expectedValues.slice(i, i + 100).map(escapeRegex);
      const pattern = '^(?:' + batch.join('|') + ')$';
      range.createTextFinder(pattern)
        .useRegularExpression(true)
        .matchEntireCell(true)
        .matchCase(options.matchCase !== false)
        .findAll()
        .forEach(cell => candidateRows.add(cell.getRow()));
    }
  }

  const records = [];
  const orderedRows = [...candidateRows].sort((a, b) => a - b);
  const candidateValues = projectionFields
    ? _coreReadProjectedCandidateRows_(
        sheet, orderedRows, headerMap, projectionFields, dataStartRow, 25
      )
    : _coreReadCandidateRows_(
        sheet, orderedRows, lastColumn, dataStartRow, 25
      );
  orderedRows.forEach(rowNumber => {
    const values = candidateValues.get(rowNumber);
    if (!projectionFields && _coreIsEmptyRow_(values)) return;
    const record = projectionFields
      ? values
      : _coreRowToRecord_(headers, values);

    const matches = filterFields.every(field => {
      const expected = filters[field];
      const values = Array.isArray(expected) ? expected : [expected];
      return values.some(value => {
        if (field === searchField && options.ignoreWhitespace) {
          const actualNormalized = String(record[field] === null || record[field] === undefined ? '' : record[field])
            .replace(/\s+/g, '');
          const expectedNormalized = String(value).replace(/\s+/g, '');
          return options.matchCase === false
            ? actualNormalized.toLocaleLowerCase() === expectedNormalized.toLocaleLowerCase()
            : actualNormalized === expectedNormalized;
        }
        if (field === searchField && options.matchCase === false) {
          const actualNormalized = String(record[field] === null || record[field] === undefined ? '' : record[field]).trim();
          const expectedNormalized = String(value === null || value === undefined ? '' : value).trim();
          return actualNormalized.toLocaleLowerCase() === expectedNormalized.toLocaleLowerCase();
        }
        return _coreValuesEqual_(record[field], value);
      });
    });

    if (matches) records.push(record);
  });

  return {
    records,
    total: records.length
  };
}


function _coreNormalizeSearchText_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}


function _coreBuildAccentInsensitivePattern_(value) {
  const variants = {
    a: 'aáàâäãå',
    e: 'eéèêë',
    i: 'iíìîï',
    o: 'oóòôöõ',
    u: 'uúùûü',
    n: 'nñ',
    c: 'cç',
    y: 'yýÿ',
    s: 'sśš',
    z: 'zźżž'
  };
  const normalized = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  return normalized.split('').map(character => {
    if (variants[character]) return '[' + variants[character] + ']';
    return character.replace(/[.*+?^$()|[\]\\]/g, item => '\\' + item);
  }).join('');
}



/**
 * Busca texto parcial en columnas indicadas sin descargar la tabla completa.
 * TextFinder localiza filas candidatas y Core recupera únicamente esas filas.
 */
function searchRecordsByFields(source, query, fields, options) {
  options = options || {};
  const search = String(query === null || query === undefined ? '' : query).trim();
  if (!search) return { records: [], total: 0 };
  if (!Array.isArray(fields) || !fields.length) {
    throw new Error('SUNARP Core: debes indicar las columnas de búsqueda.');
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

  const missing = fields.filter(field =>
    !Object.prototype.hasOwnProperty.call(headerMap, field)
  );
  if (missing.length) {
    throw new Error(
      'SUNARP Core: la fuente "' + config.sheetName +
      '" no contiene las columnas de búsqueda: ' + missing.join(', ') + '.'
    );
  }

  const dataStartRow = config.headerRow + 1;
  const dataRows = Math.max(0, lastRow - config.headerRow);
  if (!dataRows) return { records: [], total: 0 };

  const candidateRows = new Set();
  const matchCase = options.accentInsensitive === false && options.matchCase === true;
  const searchPattern = options.accentInsensitive === false
    ? search
    : _coreBuildAccentInsensitivePattern_(search);
  fields.forEach(field => {
    const finder = sheet.getRange(
      dataStartRow, headerMap[field] + 1, dataRows, 1
    ).createTextFinder(searchPattern)
      .matchCase(matchCase);
    if (options.accentInsensitive !== false) finder.useRegularExpression(true);
    finder.findAll().forEach(cell => candidateRows.add(cell.getRow()));
  });

  const expected = options.accentInsensitive === false
    ? (matchCase ? search : search.toLocaleLowerCase())
    : _coreNormalizeSearchText_(search);
  const records = [];
  const orderedRows = [...candidateRows].sort((a, b) => a - b);
  const candidateValues = _coreReadCandidateRows_(
    sheet, orderedRows, lastColumn, dataStartRow, 25
  );
  orderedRows.forEach(rowNumber => {
    const values = candidateValues.get(rowNumber);
    if (_coreIsEmptyRow_(values)) return;
    const record = _coreRowToRecord_(headers, values);
    const matches = fields.some(field => {
      const actual = options.accentInsensitive === false
        ? String(record[field] === null || record[field] === undefined ? '' : record[field])
        : _coreNormalizeSearchText_(record[field]);
      return (matchCase ? actual : actual.toLocaleLowerCase()).includes(expected);
    });
    if (matches) records.push(record);
  });

  return { records, total: records.length };
}



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

    return _coreRunSourceWrite_(source, markWriteStarted => {
      markWriteStarted();
      table.sheet
        .getRange(targetRow, 1, 1, row.length)
        .setValues([row]);

      return {
        success: true,
        message: 'Registro insertado correctamente.',
        record: _coreRowToRecord_(table.headers, row)
      };
    });
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

    return _coreRunSourceWrite_(source, markWriteStarted => {
      fields.forEach(field => {
        const columnIndex = _coreGetFieldIndex_(table, field);
        const value = updates[field];

        markWriteStarted();
        table.sheet
          .getRange(entry.rowNumber, columnIndex + 1)
          .setValue(value === null || value === undefined ? '' : value);
      });

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

    return _coreRunSourceWrite_(source, markWriteStarted => {
      markWriteStarted();
      table.sheet.deleteRow(entry.rowNumber);

      return {
        success: true,
        message: 'Registro eliminado correctamente.',
        id
      };
    });
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
 * módulos pueden compartir los mismos datos y una escritura ejecutada por
 * Core invalida la instantánea de la pestaña afectada. En un miss que espera
 * el bloqueo, la generación se vuelve a comprobar antes de leer o reutilizar
 * la instantánea.
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

    const generation = typeof _coreGetSourceGeneration_ === 'function'
      ? _coreGetSourceGeneration_(request.source)
      : null;
    const cacheKey = generation
      ? _coreBuildSourceCacheKey_(request.source, 'records') + ':' + generation
      : null;
    const cached = cacheKey ? getCachedValue(cacheKey) : null;

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
    _coreWithWriteLock_(() => {
      const pending = [];

      misses.forEach(item => {
        // La generación inicial puede quedar obsoleta mientras se espera el
        // bloqueo. Recalcularla aquí evita reutilizar una instantánea anterior
        // después de que otra escritura Core haya invalidado la fuente.
        const generation = typeof _coreGetSourceGeneration_ === 'function'
          ? _coreGetSourceGeneration_(item.source)
          : null;
        item.cacheKey = generation
          ? _coreBuildSourceCacheKey_(item.source, 'records') + ':' + generation
          : null;
        const cached = item.cacheKey ? getCachedValue(item.cacheKey) : null;
        if (Array.isArray(cached)) result[item.key] = cached;
        else pending.push(item);
      });

      if (!pending.length) return;

      const loaded = listRecordsFromSources(pending.map(item => ({
        key: item.key,
        source: item.source,
        requiredHeaders: item.requiredHeaders
      })));

      pending.forEach(item => {
        const records = loaded[item.key] || [];
        result[item.key] = records;
        if (!item.cacheKey) return;
        try {
          const cacheResult = putCachedValue(item.cacheKey, records, ttl);
          if (!cacheResult || cacheResult.success !== true) {
            console.warn(
              '[SUNARP Core] La fuente se leyó, pero no pudo conservarse en caché:',
              item.key,
              cacheResult && cacheResult.reason || 'storage-unavailable'
            );
          }
        } catch (error) {
          console.warn('[SUNARP Core] No se pudo almacenar la fuente en caché:', item.key, error.message);
        }
      });
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

      // Limita la lectura al rectángulo realmente ocupado por la hoja.
      // getDataRange() puede extenderse por formato residual muy debajo o
      // a la derecha de los datos y convertir una consulta pequeña en una
      // lectura masiva innecesaria.
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();

      if (!lastColumn || lastRow < config.headerRow) {
        throw new Error(
          `SUNARP Core: la pestaña "${config.sheetName}" no contiene encabezados.`
        );
      }

      // Una lectura contigua por pestaña, conservando el mismo contrato
      // de encabezados y registros que la implementación anterior.
      const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();

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

