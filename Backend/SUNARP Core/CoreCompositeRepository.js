/**
 * SUNARP Core - Composite Repository Operations
 * Operaciones genéricas para relaciones sin una clave simple.
 */

function _coreCompositeKey_(record, fields) {
  return JSON.stringify(fields.map(field => {
    const value = record[field];

    return value === null || value === undefined
      ? ''
      : String(value).trim();
  }));
}

/**
 * Construye una vista de tabla limitada a las filas de un parentMatch.
 * Usa TextFinder sobre cada columna padre e intersecta números de fila;
 * recupera las filas candidatas en ventanas acotadas, sin materializar toda la hoja.
 *
 * Los padres de tipo string son el contrato normal de claves de relación.
 * Para valores no textuales se conserva el lector general por compatibilidad
 * con formatos de celda cuyo texto visible puede diferir del valor interno.
 */
function _coreGetTableForParentMatch_(source, parentMatch) {
  const context = _coreOpenSource_(source);
  const config = context.config;
  const sheet = context.sheet;
  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (!lastColumn || lastRow < config.headerRow) {
    throw new Error(
      'SUNARP Core: la pestaña "' + config.sheetName + '" no contiene encabezados.'
    );
  }

  const headers = sheet.getRange(
    config.headerRow, 1, 1, lastColumn
  ).getDisplayValues()[0].map(header => String(header).trim());
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

  const parentFields = Object.keys(parentMatch || {});
  if (!parentFields.length) {
    throw new Error('SUNARP Core: parentMatch no puede estar vacío.');
  }
  parentFields.forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(headerMap, field)) {
      throw new Error('SUNARP Core: no existe la columna "' + field + '".');
    }
    const value = parentMatch[field];
    if (value === null || value === undefined || String(value).trim() === '') {
      throw new Error(
        'SUNARP Core: parentMatch requiere un valor no vacío para "' + field + '".'
      );
    }
  });

  if (parentFields.some(field => typeof parentMatch[field] !== 'string')) {
    return _coreGetTable_(source);
  }

  const dataStartRow = config.headerRow + 1;
  const rowCount = Math.max(0, lastRow - config.headerRow);
  const table = {
    config,
    spreadsheet: context.spreadsheet,
    sheet,
    headers,
    headerMap,
    entries: []
  };
  if (!rowCount) return table;

  let candidateRows = null;
  parentFields.forEach(field => {
    const expected = String(parentMatch[field]).trim();
    const matches = sheet.getRange(
      dataStartRow,
      headerMap[field] + 1,
      rowCount,
      1
    ).createTextFinder(expected)
      .matchEntireCell(true)
      .matchCase(true)
      .findAll();
    const rows = new Set(matches.map(cell => cell.getRow()));
    if (candidateRows === null) {
      candidateRows = rows;
    } else {
      candidateRows = new Set([...candidateRows].filter(row => rows.has(row)));
    }
  });

  const orderedRows = [...(candidateRows || [])].sort((a, b) => a - b);
  const valuesByRow = orderedRows.length
    ? _coreReadCandidateRows_(
        sheet, orderedRows, lastColumn, dataStartRow, 25
      )
    : new Map();

  orderedRows.forEach(rowNumber => {
    const values = valuesByRow.get(rowNumber);
    if (!values || _coreIsEmptyRow_(values)) return;
    const record = _coreRowToRecord_(headers, values);
    if (!parentFields.every(field =>
      _coreValuesEqual_(record[field], parentMatch[field])
    )) return;
    table.entries.push({ rowNumber, values, record });
  });

  return table;
}

/**
 * Actualiza un registro por uno o más campos de coincidencia.
 * Permite actualizar también el campo clave.
 *
 * options.uniqueFields verifica que la actualización no genere duplicados.
 */
function updateRecordByFields(source, criteria, updates, options) {
  options = options || {};

  return _coreWithWriteLock_(() => {
    const table = _coreGetTableMetadata_(source);
    const criteriaFields = Object.keys(criteria || {});

    if (!criteriaFields.length) {
      throw new Error('SUNARP Core: debes indicar campos de búsqueda.');
    }

    criteriaFields.forEach(field => _coreGetFieldIndex_(table, field));

    const updateFields = _coreValidateRecordFields_(updates, table.headers);

    const matches = _coreFindRowsByFields_(table, criteria);

    if (matches.length !== 1) {
      throw new Error(
        matches.length
          ? 'SUNARP Core: la búsqueda coincide con más de un registro.'
          : 'SUNARP Core: no se encontró el registro solicitado.'
      );
    }

    const entry = matches[0];

    const uniqueFields = Array.isArray(options.uniqueFields)
      ? options.uniqueFields
      : [];

    uniqueFields.forEach(field => _coreGetFieldIndex_(table, field));

    if (uniqueFields.length) {
      const candidate = Object.assign({}, entry.record, updates);

      const uniqueCriteria = {};
      uniqueFields.forEach(field => {
        uniqueCriteria[field] = candidate[field];
      });
      const duplicate = _coreFindRowsByFields_(table, uniqueCriteria).some(other =>
        other.rowNumber !== entry.rowNumber
      );

      if (duplicate) {
        throw new Error(
          'SUNARP Core: la actualización generaría un registro duplicado.'
        );
      }
    }

    return _coreRunSourceWrite_(source, markWriteStarted => {
      updateFields.forEach(field => {
        const value = updates[field];
        markWriteStarted();
        table.sheet.getRange(
          entry.rowNumber,
          _coreGetFieldIndex_(table, field) + 1
        ).setValue(value === null || value === undefined ? '' : value);
      });

      return {
        success: true,
        message: 'Registro actualizado correctamente.',
        record: Object.assign({}, entry.record, updates)
      };
    });
  });
}

/**
 * Sincroniza una colección de relaciones que comparte un conjunto de campos.
 *
 * parentMatch identifica el conjunto (p. ej. un rol o usuario+módulo).
 * keyFields identifica cada relación dentro del conjunto.
 * desiredRecords contiene las relaciones que deben quedar activas.
 *
 * Las relaciones omitidas se conservan y pasan a estado inactivo.
 * Es una única operación protegida por ScriptLock.
 */
function syncRecordsByKey(
  source,
  parentMatch,
  keyFields,
  desiredRecords,
  statusField,
  activeValue,
  inactiveValue,
  options
) {
  options = options || {};

  const allowEmptyKeyFields = new Set(
    Array.isArray(options.allowEmptyKeyFields)
      ? options.allowEmptyKeyFields.map(String)
      : []
  );

  return _coreWithWriteLock_(() => {
    const parentFields = Object.keys(parentMatch || {});

    if (!parentFields.length) {
      throw new Error('SUNARP Core: parentMatch no puede estar vacío.');
    }
    parentFields.forEach(field => {
      const value = parentMatch[field];
      if (value === null || value === undefined || String(value).trim() === '') {
        throw new Error(
          'SUNARP Core: parentMatch requiere un valor no vacío para "' + field + '".'
        );
      }
    });

    const table = _coreGetTableForParentMatch_(source, parentMatch);

    if (!Array.isArray(keyFields) || !keyFields.length) {
      throw new Error('SUNARP Core: debes indicar keyFields.');
    }

    if (!Array.isArray(desiredRecords)) {
      throw new Error('SUNARP Core: desiredRecords debe ser un arreglo.');
    }

    const allKeyFields = [...new Set([...parentFields, ...keyFields])];

    allKeyFields.forEach(field => _coreGetFieldIndex_(table, field));
    _coreGetFieldIndex_(table, statusField);

    const desiredMap = new Map();

    desiredRecords.forEach(record => {
      _coreValidateRecordFields_(record, table.headers);

      const overriddenParentField = parentFields.find(field =>
        Object.prototype.hasOwnProperty.call(record, field) &&
        !_coreValuesEqual_(record[field], parentMatch[field])
      );
      if (overriddenParentField) {
        throw new Error(
          'SUNARP Core: desiredRecords no puede modificar el campo padre "' +
          overriddenParentField + '".'
        );
      }

      // El padre validado prevalece; el registro deseado solo define la relación.
      const complete = Object.assign({}, record, parentMatch);

      keyFields.forEach(field => {
        const value = complete[field];

        const isEmpty =
          value === null ||
          value === undefined ||
          String(value).trim() === '';

        if (isEmpty && !allowEmptyKeyFields.has(field)) {
          throw new Error(
            `SUNARP Core: falta el campo clave "${field}" en una relación.`
          );
        }
      });

      const key = _coreCompositeKey_(complete, keyFields);

      if (desiredMap.has(key)) {
        throw new Error(
          'SUNARP Core: desiredRecords contiene relaciones duplicadas.'
        );
      }

      desiredMap.set(key, complete);
    });

    const existing = table.entries.filter(entry =>
      !_coreIsEmptyRow_(entry.values) &&
      parentFields.every(field =>
        _coreValuesEqual_(entry.record[field], parentMatch[field])
      )
    );

    const existingMap = new Map();

    existing.forEach(entry => {
      const key = _coreCompositeKey_(entry.record, keyFields);

      if (existingMap.has(key)) {
        throw new Error(
          'SUNARP Core: existen relaciones duplicadas para la misma clave compuesta.'
        );
      }

      existingMap.set(key, entry);
    });

    let inserted = 0;
    let updated = 0;
    let deactivated = 0;

    return _coreRunSourceWrite_(source, markWriteStarted => {
      existingMap.forEach((entry, key) => {
        const desired = desiredMap.get(key);

        const updates = desired
          ? Object.assign({}, desired, { [statusField]: activeValue })
          : { [statusField]: inactiveValue };

        const fields = _coreValidateRecordFields_(updates, table.headers);
        let changed = false;

        fields.forEach(field => {
          const nextValue =
            updates[field] === null || updates[field] === undefined
              ? ''
              : updates[field];

          if (!_coreValuesEqual_(entry.record[field], nextValue)) {
            markWriteStarted();
            table.sheet.getRange(
              entry.rowNumber,
              _coreGetFieldIndex_(table, field) + 1
            ).setValue(nextValue);

            changed = true;
          }
        });

        if (changed) {
          if (desired) updated++;
          else deactivated++;
        }
      });

      desiredMap.forEach((record, key) => {
        if (existingMap.has(key)) return;

        const complete = Object.assign({}, parentMatch, record, {
          [statusField]: activeValue
        });
        _coreValidateRecordFields_(complete, table.headers);

        const row = table.headers.map(header => {
          const value = complete[header];
          return value === null || value === undefined ? '' : value;
        });
        const targetRow = Math.max(
          table.config.headerRow + 1,
          table.sheet.getLastRow() + 1
        );

        markWriteStarted();
        table.sheet.getRange(
          targetRow,
          1,
          1,
          row.length
        ).setValues([row]);

        inserted++;
      });

      return {
        success: true,
        inserted,
        updated,
        deactivated,
        totalActive: desiredMap.size
      };
    });

  });
}

/**
 * Inserta un evento de auditoría.
 * La aplicación consumidora determina el esquema del evento.
 */
function appendAuditEvent(source, record, idField) {
  if (!idField) {
    throw new Error(
      'SUNARP Core: appendAuditEvent requiere idField.'
    );
  }

  return insertRecord(
    source,
    record,
    { idField: String(idField) }
  );
}
