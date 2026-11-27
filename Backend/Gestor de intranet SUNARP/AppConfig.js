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
 * Dependencias de catálogos replicados mediante IMPORTRANGE.
 * Se conservan las hojas consumidoras; Core solo recibe la relación lógica
 * maestro -> réplica para componer generaciones e invalidar resultados.
 */
const INTRANET_SOURCE_DEPENDENCIES = Object.freeze({
  DIRECTORY: Object.freeze({
    sede: Object.freeze([['MASTER_DATA', 'sede']]),
    tipos_local: Object.freeze([['MASTER_DATA', 'tipos_local']]),
    locales: Object.freeze([['MASTER_DATA', 'locales']]),
    tipos_estructura: Object.freeze([['MASTER_DATA', 'tipos_estructura']]),
    estructura_org: Object.freeze([['MASTER_DATA', 'estructura_org']]),
    estructura_local: Object.freeze([['MASTER_DATA', 'estructura_local']]),
    cargos: Object.freeze([['MASTER_DATA', 'cargos']]),
    tipo_documento_identidad: Object.freeze([['MASTER_DATA', 'tipo_documento_identidad']]),
    condicion_cargo: Object.freeze([['MASTER_DATA', 'condicion_cargo']])
  }),
  SECURITY: Object.freeze({
    Sedes: Object.freeze([['MASTER_DATA', 'sede']]),
    EstructuraOrg: Object.freeze([['MASTER_DATA', 'estructura_org']])
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

  const dependencyDefinitions = (
    INTRANET_SOURCE_DEPENDENCIES[sourceKey] &&
    INTRANET_SOURCE_DEPENDENCIES[sourceKey][normalizedSheetName]
  ) || [];
  const dependencies = dependencyDefinitions.map(([dependencySourceKey, dependencySheetName]) =>
    getIntranetDataSource(dependencySourceKey, dependencySheetName, 1)
  );

  return {
    spreadsheetId: source.spreadsheetId,
    sheetName: normalizedSheetName,
    headerRow: resolvedHeaderRow,
    label: `${source.label} - ${normalizedSheetName}`,
    dependencies
  };
}