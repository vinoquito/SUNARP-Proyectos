/**
 * GESTOR DE INTRANET SUNARP
 * Configuración centralizada de fuentes de datos.
 *
 * Los identificadores pertenecen a esta aplicación.
 * SUNARP Core recibe estos datos como parámetros
 * y no almacena identificadores de archivos concretos.
 */

const INTRANET_DATA_SOURCES = Object.freeze({

  // Datos y configuración propios de la aplicación.
  APP_DATA: Object.freeze({
    spreadsheetId: '19_hmffEafIne-TfDEin9zLg1eOtSbJXkwk7__A6X64A',
    label: 'Gestor de intranet - Datos'
  }),

  // Catálogos maestros compartidos.
  MASTER_DATA: Object.freeze({
    spreadsheetId: '1oIAWBuSE0SiwINa0v0KybCYiwKZFootQXoccwKDVBIE',
    label: 'Global parameters'
  }),

  // Información del directorio telefónico.
  DIRECTORY: Object.freeze({
    spreadsheetId: '1voZ8scqmrhy06J18cS1_rCPrxQADRXUq49x8Owxbg6E',
    label: 'Directorios telefónicos'
  }),

  // Usuarios, roles, permisos, ámbitos y auditoría.
  SECURITY: Object.freeze({
    spreadsheetId: '1RbY21JK7d2kEyV9t0trTquRU-BWB5Sb4Tz_iq6xOczI',
    label: 'Seguridad - Gestor de contenidos Intranet SUNARP'
  })

});


/**
 * Construye la configuración de una fuente de datos
 * compatible con SUNARP Core.
 *
 * @param {string} sourceKey Clave de la fuente.
 * @param {string} sheetName Nombre de la pestaña.
 * @param {number} headerRow Fila de encabezados.
 * @return {Object} Configuración de la fuente.
 */
function getIntranetDataSource(sourceKey, sheetName, headerRow) {
  const source = INTRANET_DATA_SOURCES[sourceKey];

  if (!source) {
    throw new Error(`No existe la fuente de datos "${sourceKey}".`);
  }

  const normalizedSheetName = String(sheetName || '').trim();

  if (!normalizedSheetName) {
    throw new Error('Debes proporcionar el nombre de la pestaña.');
  }

  const resolvedHeaderRow =
    headerRow === undefined || headerRow === null
      ? 1
      : Number(headerRow);

  if (!Number.isInteger(resolvedHeaderRow) || resolvedHeaderRow < 1) {
    throw new Error(
      'La fila de encabezados debe ser un entero mayor o igual a 1.'
    );
  }

  return {
    spreadsheetId: source.spreadsheetId,
    sheetName: normalizedSheetName,
    headerRow: resolvedHeaderRow,
    label: `${source.label} - ${normalizedSheetName}`
  };
}