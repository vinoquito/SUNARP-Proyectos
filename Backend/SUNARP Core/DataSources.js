
/**
 * SUNARP Core
 * Módulo: DataSources
 *
 * Responsabilidad:
 * - Abrir archivos de Google Sheets mediante su ID.
 * - Obtener una pestaña mediante su nombre.
 * - Validar la configuración de una fuente.
 * - Consultar metadatos de una fuente.
 *
 * No contiene IDs ni nombres de archivos específicos.
 */


/**
 * Normaliza y valida la configuración de una fuente de datos.
 *
 * Estructura esperada:
 * {
 *   spreadsheetId: 'ID_DEL_ARCHIVO',
 *   sheetName: 'Nombre de la pestaña',
 *   headerRow: 1,
 *   label: 'Identificación descriptiva'
 * }
 */
function _coreNormalizeSourceConfig_(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(
      'SUNARP Core: debes proporcionar la configuración de una fuente de datos.'
    );
  }

  const spreadsheetId = String(source.spreadsheetId || '').trim();
  const sheetName = String(source.sheetName || '').trim();

  const headerRow =
    source.headerRow === undefined ||
    source.headerRow === null ||
    source.headerRow === ''
      ? 1
      : Number(source.headerRow);

  const label = String(source.label || sheetName || 'Fuente de datos').trim();

  if (!spreadsheetId) {
    throw new Error(
      `SUNARP Core: falta el ID del archivo de la fuente "${label}".`
    );
  }

  if (!sheetName) {
    throw new Error(
      `SUNARP Core: falta el nombre de la pestaña de la fuente "${label}".`
    );
  }

  if (!Number.isInteger(headerRow) || headerRow < 1) {
    throw new Error(
      `SUNARP Core: la fila de encabezados de "${label}" no es válida.`
    );
  }

  return {
    spreadsheetId,
    sheetName,
    headerRow,
    label
  };
}


/**
 * Abre un archivo de Google Sheets.
 */
function _coreOpenSpreadsheet_(spreadsheetId, label) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error(
      `SUNARP Core: no se pudo acceder a "${label}". ` +
      `Verifica el ID del archivo y los permisos de acceso. ` +
      `Detalle: ${error.message}`
    );
  }
}


/**
 * Abre una fuente y devuelve su contexto de acceso.
 *
 * Esta función es privada para la biblioteca.
 * Los módulos internos pueden reutilizarla.
 */
function _coreOpenSource_(source) {
  const config = _coreNormalizeSourceConfig_(source);

  const spreadsheet = _coreOpenSpreadsheet_(
    config.spreadsheetId,
    config.label
  );

  const sheet = spreadsheet.getSheetByName(config.sheetName);

  if (!sheet) {
    throw new Error(
      `SUNARP Core: no existe la pestaña "${config.sheetName}" ` +
      `en el archivo "${spreadsheet.getName()}".`
    );
  }

  return {
    config,
    spreadsheet,
    sheet
  };
}


/**
 * Lee un rango de una pestaña.
 *
 * Devuelve una matriz vacía cuando no existen filas o columnas.
 */
function _coreReadRange_(sheet, startRow, startColumn, numRows, numColumns) {
  const values = [startRow, startColumn, numRows, numColumns];

  if (!values.every(Number.isInteger)) {
    throw new Error(
      'SUNARP Core: las coordenadas del rango deben ser números enteros.'
    );
  }

  if (
    startRow < 1 ||
    startColumn < 1 ||
    numRows < 0 ||
    numColumns < 0
  ) {
    throw new Error(
      'SUNARP Core: las coordenadas del rango no son válidas.'
    );
  }

  if (numRows === 0 || numColumns === 0) {
    return [];
  }

  return sheet
    .getRange(startRow, startColumn, numRows, numColumns)
    .getValues();
}


/**
 * Consulta información de una fuente.
 *
 * Función pública para comprobar la conexión
 * desde una aplicación que utilice SUNARP Core.
 */
function getSourceInfo(source) {
  const context = _coreOpenSource_(source);

  const { config, spreadsheet, sheet } = context;

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  let headers = [];

  if (lastColumn > 0 && lastRow >= config.headerRow) {
    headers = sheet
      .getRange(config.headerRow, 1, 1, lastColumn)
      .getDisplayValues()[0]
      .map(header => String(header).trim());
  }

  return {
    label: config.label,
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    headerRow: config.headerRow,
    lastRow,
    lastColumn,
    headers
  };
}
