
function testSunarpCoreConnection() {
  const source = {
    spreadsheetId: '1oIAWBuSE0SiwINa0v0KybCYiwKZFootQXoccwKDVBIE',
    sheetName: 'sede',
    headerRow: 1,
    label: 'Global parameters - sede'
  };

 const result = SUNARPCore.getSourceInfo(source);

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}


function testAllIntranetSources() {

  const sources = [
    {
      key: 'APP_DATA',
      sheet: 'Menu'
    },
    {
      key: 'MASTER_DATA',
      sheet: 'sede'
    },
    {
      key: 'DIRECTORY',
      sheet: 'servidores'
    }
  ];

  const results = sources.map(item => {

    const source = getIntranetDataSource(
      item.key,
      item.sheet
    );

    return SUNARPCore.getSourceInfo(source);

  });

  Logger.log(JSON.stringify(results, null, 2));

  return results;
}


function inspectDirectoryCatalogs() {

  const tabs = [
    { source: 'MASTER_DATA', sheet: 'sede' },
    { source: 'MASTER_DATA', sheet: 'tipos_local' },
    { source: 'MASTER_DATA', sheet: 'locales' },
    { source: 'MASTER_DATA', sheet: 'tipos_estructura' },
    { source: 'MASTER_DATA', sheet: 'estructura_org' },
    { source: 'MASTER_DATA', sheet: 'estructura_local' },
    { source: 'MASTER_DATA', sheet: 'cargos' },
    { source: 'DIRECTORY', sheet: 'servidores' }
  ];

  const results = tabs.map(item => {

    try {
      const source = getIntranetDataSource(
        item.source,
        item.sheet
      );

      const info = SUNARPCore.getSourceInfo(source);

      return {
        source: item.source,
        sheet: item.sheet,
        success: true,
        headers: info.headers,
        lastRow: info.lastRow,
        lastColumn: info.lastColumn
      };

    } catch (error) {

      return {
        source: item.source,
        sheet: item.sheet,
        success: false,
        error: error.message
      };

    }

  });

  results.forEach(result => {
    Logger.log(JSON.stringify(result, null, 2));
  });

  return results;
}


function testDirectoryService() {
  const result = getDirectoryInitialData();

  Logger.log('RESUMEN DEL DIRECTORIO');
  Logger.log(JSON.stringify(result.summary, null, 2));

  Logger.log('CATÁLOGOS');
  Logger.log(JSON.stringify({
    sedes: result.catalogs.sedes.length,
    tiposLocal: result.catalogs.tiposLocal.length,
    locales: result.catalogs.locales.length,
    tiposEstructura: result.catalogs.tiposEstructura.length,
    estructuraOrg: result.catalogs.estructuraOrg.length,
    estructuraLocal: result.catalogs.estructuraLocal.length,
    cargos: result.catalogs.cargos.length
  }, null, 2));

  Logger.log('PRIMEROS REGISTROS');
  Logger.log(JSON.stringify(
    result.records.slice(0, 5),
    null,
    2
  ));

  return result;
}


