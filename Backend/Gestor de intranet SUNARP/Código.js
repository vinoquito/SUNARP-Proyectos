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
      return (
        _accessIsGlobalAdministrator_(auth) ||
        hasPermission_(auth, 'AUDITORIA_VER')
      );
    }

    return hasPermission_(auth, requiredCode);
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

  const result = SUNARPCore.listRecordsFromSourcesCached([{
    key: 'menu',
    source: getIntranetDataSource(
      'APP_DATA',
      INTRANET_CONFIG.NAVIGATION_SHEET_NAME,
      1
    ),
    requiredHeaders
  }], 300);

  const rows = result.menu || [];
  const seenIds = new Set();
  const items = [];

  rows.forEach((row, index) => {
    const get = name => String(row[name] === null || row[name] === undefined ? '' : row[name]).trim();

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
