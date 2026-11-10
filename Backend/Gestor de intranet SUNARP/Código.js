const INTRANET_CONFIG = Object.freeze({
  DATA_SPREADSHEET_ID: '19_hmffEafIne-TfDEin9zLg1eOtSbJXkwk7__A6X64A',
  DIRECTORY_SPREADSHEET_ID: '1voZ8scqmrhy06J18cS1_rCPrxQADRXUq49x8Owxbg6E',
  NAVIGATION_SHEET_NAME: 'Menu',
  APP_NAME: 'Gestor de contenidos intranet SUNARP'
});

/**
 * Entrada de la aplicación web.
 */
function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(INTRANET_CONFIG.APP_NAME)
    .addMetaTag(
      'viewport',
      'width=device-width, initial-scale=1'
    );
}

/**
 * Incluye archivos HTML del proyecto de la aplicación.
 * No es necesario para los archivos alojados en SUNARP UI.
 */
function include(fileName) {
  return HtmlService
    .createTemplateFromFile(fileName)
    .evaluate()
    .getContent();
}

/**
 * Entrega a SUNARP UI la configuración de esta aplicación.
 */
/**
 * Reemplaza únicamente getAppShellConfig() en Code.gs.
 */
function getAppShellConfig() {
  const auth = getAuthContext_();
  const sourceItems = getNavigationItems_();

  const accessManagementCodes = [
    'USUARIOS_ADMINISTRAR',
    'ROLES_ADMINISTRAR',
    'PERMISOS_ADMINISTRAR',
    'AMBITOS_ACCESO_ADMINISTRAR',
    'AUDITORIA_VER'
  ];

  const allowedItems = sourceItems.filter(item => {
    const requiredCode = String(item.permissionCode || '')
      .trim()
      .toUpperCase();

    const route = String(item.route || '')
      .trim()
      .toLowerCase();

    if (!requiredCode) return true;

    if (
      requiredCode === 'ACCESOS_ADMINISTRAR' ||
      route === 'accesos'
    ) {
      return accessManagementCodes.some(code =>
        SUNARPCore.authorizationHasPermission(auth, code)
      );
    }

    return SUNARPCore.authorizationHasPermission(
      auth,
      requiredCode
    );
  });

  const allowedIds = new Set(
    allowedItems.map(item => String(item.id).toUpperCase())
  );

  const navigation = allowedItems.filter(item =>
    !item.parentId ||
    allowedIds.has(String(item.parentId).toUpperCase())
  );

  return {
    appName: INTRANET_CONFIG.APP_NAME,
    navigation
  };
}

/**
 * Lee y valida la configuración del menú.
 */
function getNavigationItems_() {
  const spreadsheetId = INTRANET_CONFIG.DATA_SPREADSHEET_ID;

  if (
    !spreadsheetId ||
    spreadsheetId === 'PEGAR_AQUI_EL_ID_DE_LA_HOJA'
  ) {
    throw new Error(
      'Configura DATA_SPREADSHEET_ID en Code.gs.'
    );
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

  const sheet = spreadsheet.getSheetByName(
    INTRANET_CONFIG.NAVIGATION_SHEET_NAME
  );

  if (!sheet) {
    throw new Error(
      `No existe la pestaña "${INTRANET_CONFIG.NAVIGATION_SHEET_NAME}".`
    );
  }

  const values = sheet.getDataRange().getDisplayValues();

  if (!values.length || !values[0].some(value => value.trim())) {
    throw new Error('La hoja Menu no tiene encabezados.');
  }

  const headers = values[0].map(value =>
    String(value).trim().toLowerCase()
  );

  const requiredHeaders = [
    'id',
    'parent_id',
    'label',
    'description',
    'icon',
    'route',
    'order',
    'permission_code',
    'active'
  ];

  const missingHeaders = requiredHeaders.filter(
    name => !headers.includes(name)
  );

  if (missingHeaders.length) {
    throw new Error(
      `Faltan encabezados en Menu: ${missingHeaders.join(', ')}.`
    );
  }

  const column = {};
  requiredHeaders.forEach(name => {
    column[name] = headers.indexOf(name);
  });

  const rows = values.slice(1);
  const seenIds = new Set();
  const items = [];

  rows.forEach((row, index) => {
    if (!row.some(value => String(value).trim())) return;

    const get = name =>
      String(row[column[name]] ?? '').trim();

    const id = get('id');
    const label = get('label');

    if (!id || !label) {
      throw new Error(
        `La fila ${index + 2} debe tener id y label.`
      );
    }

    const normalizedId = id.toUpperCase();

    if (seenIds.has(normalizedId)) {
      throw new Error(
        `El id "${id}" está duplicado en la hoja Menu.`
      );
    }

    seenIds.add(normalizedId);

    const activeValue = get('active').toUpperCase();

    const active = [
      'TRUE',
      'VERDADERO',
      '1',
      'SI',
      'SÍ',
      'ACTIVO',
      'ACTIVA'
    ].includes(activeValue);

    if (!active) return;

    const orderValue = Number(get('order'));

    items.push({
      id,
      parentId: get('parent_id'),
      label,
      description: get('description'),
      icon: get('icon'),
      route: get('route'),
      order: Number.isFinite(orderValue) ? orderValue : 9999,
      permissionCode: get('permission_code')
    });
  });

  const activeIds = new Set(
    items.map(item => item.id.toUpperCase())
  );

  items.forEach(item => {
    if (
      item.parentId &&
      !activeIds.has(item.parentId.toUpperCase())
    ) {
      throw new Error(
        `El elemento "${item.label}" tiene un parent_id inexistente o inactivo.`
      );
    }
  });

  return items.sort((a, b) => a.order - b.order);
}