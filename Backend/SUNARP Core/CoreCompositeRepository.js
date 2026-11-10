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
 * Actualiza un registro por uno o más campos de coincidencia.
 * Permite actualizar también el campo clave.
 *
 * options.uniqueFields verifica que la actualización no genere duplicados.
 */
function updateRecordByFields(source, criteria, updates, options) {
  options = options || {};

  return _coreWithWriteLock_(() => {
    const table = _coreGetTable_(source);
    const criteriaFields = Object.keys(criteria || {});

    if (!criteriaFields.length) {
      throw new Error('SUNARP Core: debes indicar campos de búsqueda.');
    }

    criteriaFields.forEach(field => _coreGetFieldIndex_(table, field));

    const updateFields = _coreValidateRecordFields_(updates, table.headers);

    const matches = table.entries.filter(entry =>
      !_coreIsEmptyRow_(entry.values) &&
      criteriaFields.every(field =>
        _coreValuesEqual_(entry.record[field], criteria[field])
      )
    );

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

      const duplicate = table.entries.some(other => {
        if (
          other.rowNumber === entry.rowNumber ||
          _coreIsEmptyRow_(other.values)
        ) {
          return false;
        }

        return uniqueFields.every(field =>
          _coreValuesEqual_(other.record[field], candidate[field])
        );
      });

      if (duplicate) {
        throw new Error(
          'SUNARP Core: la actualización generaría un registro duplicado.'
        );
      }
    }

    updateFields.forEach(field => {
      const value = updates[field];

      table.sheet.getRange(
        entry.rowNumber,
        _coreGetFieldIndex_(table, field) + 1
      ).setValue(value === null || value === undefined ? '' : value);
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Registro actualizado correctamente.',
      record: Object.assign({}, entry.record, updates)
    };
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
    const table = _coreGetTable_(source);
    const parentFields = Object.keys(parentMatch || {});

    if (!parentFields.length) {
      throw new Error('SUNARP Core: parentMatch no puede estar vacío.');
    }

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

      const complete = Object.assign({}, parentMatch, record);

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

      table.sheet.getRange(
        targetRow,
        1,
        1,
        row.length
      ).setValues([row]);

      inserted++;
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      inserted,
      updated,
      deactivated,
      totalActive: desiredMap.size
    };
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