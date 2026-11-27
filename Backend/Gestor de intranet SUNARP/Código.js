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
  const sourceItems = _mergeMaintenanceNavigationItems_(getNavigationItems_());

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
 * Incorpora los cinco grupos de mantenimiento al árbol del shell.
 * Las rutas se mantienen bajo un único nodo padre y permanecen visibles para
 * facilitar las pruebas. La autorización de datos y operaciones sigue siendo
 * obligatoria en los servicios del backend.
 */
function _mergeMaintenanceNavigationItems_(sourceItems) {
  const items = (sourceItems || []).map(item => Object.assign({}, item));
  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  let parent = items.find(item =>
    normalize(item.label) === 'modulos de mantenimiento'
  );

  const usedIds = new Set(items.map(item => String(item.id || '').toUpperCase()));
  if (!parent) {
    let id = 'MANTENIMIENTOS';
    let suffix = 2;
    while (usedIds.has(id)) id = 'MANTENIMIENTOS_' + suffix++;
    parent = {
      id: id,
      parentId: '',
      label: 'Módulos de mantenimiento',
      description: 'Administración centralizada de catálogos institucionales.',
      icon: 'settings',
      route: '',
      order: 80,
      permissionCode: ''
    };
    items.push(parent);
    usedIds.add(id);
  } else {
    parent.parentId = '';
    parent.label = 'Módulos de mantenimiento';
    parent.description = 'Administración centralizada de catálogos institucionales.';
    parent.icon = parent.icon || 'settings';
    parent.route = '';
    parent.permissionCode = '';
  }

  const parentId = String(parent.id);
  const groups = [
    {
      id: 'MANT_UBICACION_GEOGRAFICA',
      label: 'Ubicación geográfica',
      route: 'ubicacion-geografica',
      description: 'Administra departamentos, provincias y distritos.',
      icon: 'public',
      order: 1
    },
    {
      id: 'MANT_SEDES_LOCALES',
      label: 'Sedes y locales',
      route: 'sedes-locales',
      description: 'Administra sedes, tipos de local y locales.',
      icon: 'location_city',
      order: 2
    },
    {
      id: 'MANT_ORGANIZACION_INSTITUCIONAL',
      label: 'Organización institucional',
      route: 'organizacion-institucional',
      description: 'Administra tipos de estructura y estructura orgánica.',
      icon: 'account_tree',
      order: 3
    },
    {
      id: 'MANT_DATOS_PERSONAL',
      label: 'Datos de personal',
      route: 'datos-personal',
      description: 'Administra cargos, condiciones de cargo y tipos de documento de identidad.',
      icon: 'badge',
      order: 4
    },
    {
      id: 'MANT_DIRECTORIO_TELEFONICO',
      label: 'Directorio telefónico',
      route: 'directorio-telefonico',
      description: 'Administra tipos de teléfono y teléfonos.',
      icon: 'phone',
      order: 5
    }
  ];

  groups.forEach(group => {
    let item = items.find(candidate =>
      String(candidate.route || '').trim().toLowerCase() === group.route
    );

    if (!item) {
      let id = group.id;
      let suffix = 2;
      while (usedIds.has(id.toUpperCase())) id = group.id + '_' + suffix++;
      item = {
        id: id,
        parentId: parentId,
        label: group.label,
        description: group.description,
        icon: group.icon,
        route: group.route,
        order: group.order,
        permissionCode: ''
      };
      items.push(item);
      usedIds.add(id.toUpperCase());
    } else {
      item.parentId = parentId;
      item.label = group.label;
      item.description = group.description;
      item.icon = item.icon || group.icon;
      item.permissionCode = '';
      item.order = group.order;
    }
  });

  return items.sort((a, b) => Number(a.order || 9999) - Number(b.order || 9999));
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
