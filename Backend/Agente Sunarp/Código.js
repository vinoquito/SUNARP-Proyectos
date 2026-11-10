/* ==========================================================================
   SINCRONIZACIÓN DE AGENTES SUNARP
   ========================================================================== */

const AGENTES_SUNARP_CONFIG = {

  HOJA_ORIGEN: 'Agentes Sunarp',
  HOJA_DESTINO: 'data agentes sunarp',
  HOJA_CONFIGURACION: 'config agentes',

  HOJAS_AUXILIARES: {
    SEDES: 'sede',
    DEPARTAMENTOS: 'departamentos',
    PROVINCIAS: 'provincias',
    DISTRITOS: 'distritos'
  },

  CAMPOS_CONFIGURACION: [
    'template',
    'section',
    'group',
    'subgroup',
    'block',
    'mode',
    'type',
    'target'
  ],

  CABECERAS_DESTINO: [
    'id',
    'template',
    'section',
    'group',
    'subgroup',
    'block',
    'mode',
    'type',
    'sede',
    'nombre',
    'departamento',
    'provincia',
    'distrito',
    'direccion',
    'referencia',
    'url_destination',
    'target',
    'state'
  ],

  HOJAS_OBSERVADAS: [
    'Agentes Sunarp',
    'sede',
    'departamentos',
    'provincias',
    'distritos',
    'config agentes'
  ]

};


/* ==========================================================================
   FUNCIONES GENERALES
   ========================================================================== */


/*
 * Normaliza textos para comparar claves y encabezados.
 */

function normalizarClaveAgentes(valor) {

  return String(valor ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

}


/*
 * Comprueba si un valor está vacío.
 */

function estaVacioAgentes(valor) {

  return valor === undefined ||
    valor === null ||
    String(valor).trim() === '';

}


/*
 * Obtiene un campo considerando diferencias
 * en mayúsculas, minúsculas y tildes.
 */

function obtenerCampoAgentes(registro, nombres) {

  if (!registro) {
    return '';
  }

  const alternativas = Array.isArray(nombres)
    ? nombres
    : [nombres];

  const claves = Object.keys(registro);

  for (const nombre of alternativas) {

    const buscada = normalizarClaveAgentes(nombre);

    const encontrada = claves.find(clave =>
      normalizarClaveAgentes(clave) === buscada
    );

    if (encontrada !== undefined) {
      return registro[encontrada];
    }

  }

  return '';

}


/*
 * Lee los valores visibles para conservar los ceros iniciales
 * de los códigos territoriales (01, 0101, 010101).
 */

function leerRegistrosAgentes(hoja) {

  const ultimaFila = hoja.getLastRow();
  const ultimaColumna = hoja.getLastColumn();

  if (ultimaFila < 2 || ultimaColumna === 0) {
    return [];
  }

  const valores = hoja
    .getRange(1, 1, ultimaFila, ultimaColumna)
    .getDisplayValues();

  const cabeceras = valores[0].map(valor =>
    String(valor ?? '').trim()
  );

  return valores.slice(1)

    .map((fila, indice) => {

      const registro = {
        _fila: indice + 2
      };

      cabeceras.forEach((cabecera, index) => {

        if (cabecera) {
          registro[cabecera] = fila[index];
        }

      });

      return registro;

    })

    .filter(registro =>
      cabeceras.some(cabecera =>
        !estaVacioAgentes(registro[cabecera])
      )
    );

}


/*
 * Comprueba que existan los encabezados requeridos.
 */

function validarCabecerasAgentes(hoja, requeridas) {

  const ultimaColumna = hoja.getLastColumn();

  if (ultimaColumna === 0) {
    throw new Error(
      `La hoja "${hoja.getName()}" no tiene encabezados.`
    );
  }

  const cabeceras = hoja
    .getRange(1, 1, 1, ultimaColumna)
    .getDisplayValues()[0]
    .map(valor => String(valor ?? '').trim());

  const normalizadas = cabeceras.map(normalizarClaveAgentes);

  const faltantes = requeridas.filter(campo =>
    !normalizadas.includes(normalizarClaveAgentes(campo))
  );

  if (faltantes.length) {
    throw new Error(
      `En la hoja "${hoja.getName()}" faltan estas columnas: ` +
      faltantes.join(', ') + '.'
    );
  }

  return cabeceras;

}


/*
 * Construye un índice por ID.
 */

function crearIndiceAgentes(registros, nombreHoja) {

  const indice = new Map();

  registros.forEach(registro => {

    const id = obtenerCampoAgentes(registro, 'id');

    if (estaVacioAgentes(id)) {
      return;
    }

    const clave = normalizarClaveAgentes(id);

    if (indice.has(clave)) {
      throw new Error(
        `El ID "${id}" está duplicado en la hoja "${nombreHoja}".`
      );
    }

    indice.set(clave, registro);

  });

  return indice;

}


/*
 * Busca un registro mediante su ID.
 */

function obtenerRegistroPorIdAgentes(indice, id, descripcion) {

  if (estaVacioAgentes(id)) {
    throw new Error(`Falta el ID de ${descripcion}.`);
  }

  const registro = indice.get(
    normalizarClaveAgentes(id)
  );

  if (!registro) {
    throw new Error(
      `No se encontró ${descripcion} con ID "${id}".`
    );
  }

  return registro;

}


/* ==========================================================================
   CONFIGURACIÓN GLOBAL
   ========================================================================== */


/*
 * Lee la única fila de configuración de config agentes.
 */

function obtenerConfiguracionAgentes(hoja) {

  validarCabecerasAgentes(
    hoja,
    AGENTES_SUNARP_CONFIG.CAMPOS_CONFIGURACION
  );

  const registros = leerRegistrosAgentes(hoja);

  if (registros.length !== 1) {
    throw new Error(
      'La hoja "config agentes" debe contener exactamente un ' +
      'registro de configuración.'
    );
  }

  const registro = registros[0];
  const configuracion = {};

  AGENTES_SUNARP_CONFIG.CAMPOS_CONFIGURACION.forEach(campo => {

    configuracion[campo] = obtenerCampoAgentes(
      registro,
      campo
    );

  });

  return configuracion;

}


/* ==========================================================================
   RECONSTRUCCIÓN DE RELACIONES GEOGRÁFICAS Y SEDE
   ========================================================================== */


/*
 * La sede se obtiene directamente mediante sede_id.
 *
 * La ubicación geográfica se reconstruye a partir de distrito_id:
 *
 * distrito_id
 *     ↓
 * distritos.id
 *     ↓
 * distritos.id_provincia
 *     ↓
 * provincias.id
 *     ↓
 * provincias.id_departamento
 *     ↓
 * departamentos.id
 */

function reconstruirUbicacionAgente(
  agente,
  indiceSedes,
  indiceDepartamentos,
  indiceProvincias,
  indiceDistritos
) {

  const sedeId = obtenerCampoAgentes(agente, 'sede_id');
  const distritoId = obtenerCampoAgentes(agente, 'distrito_id');


  /* --------------------------------------------------------------
     SEDE
     -------------------------------------------------------------- */

  const sede = obtenerRegistroPorIdAgentes(
    indiceSedes,
    sedeId,
    `la sede del agente de la fila ${agente._fila}`
  );


  /* --------------------------------------------------------------
     DISTRITO
     -------------------------------------------------------------- */

  const distrito = obtenerRegistroPorIdAgentes(
    indiceDistritos,
    distritoId,
    `el distrito del agente de la fila ${agente._fila}`
  );


  /* --------------------------------------------------------------
     PROVINCIA
     -------------------------------------------------------------- */

  const provinciaId = obtenerCampoAgentes(
    distrito,
    'id_provincia'
  );

  const provincia = obtenerRegistroPorIdAgentes(
    indiceProvincias,
    provinciaId,
    `la provincia relacionada con el distrito ${distritoId}`
  );


  /* --------------------------------------------------------------
     DEPARTAMENTO
     -------------------------------------------------------------- */

  const departamentoId = obtenerCampoAgentes(
    provincia,
    'id_departamento'
  );

  const departamento = obtenerRegistroPorIdAgentes(
    indiceDepartamentos,
    departamentoId,
    `el departamento relacionado con la provincia ${provinciaId}`
  );


  /* --------------------------------------------------------------
     DEVOLVER NOMBRES RECONSTRUIDOS
     -------------------------------------------------------------- */

  return {

    sede: obtenerCampoAgentes(sede, 'name'),

    departamento: obtenerCampoAgentes(departamento, 'name'),

    provincia: obtenerCampoAgentes(provincia, 'name'),

    distrito: obtenerCampoAgentes(distrito, 'name')

  };

}


/* ==========================================================================
   VALIDACIÓN DEL ORIGEN
   ========================================================================== */


function validarAgentesOrigen(agentes) {

  const ids = new Set();

  agentes.forEach(agente => {

    const id = obtenerCampoAgentes(agente, 'id');

    if (estaVacioAgentes(id)) {
      throw new Error(
        `El registro de la fila ${agente._fila} no tiene ID.`
      );
    }

    const clave = normalizarClaveAgentes(id);

    if (ids.has(clave)) {
      throw new Error(
        `El ID "${id}" está duplicado en la hoja "Agentes Sunarp".`
      );
    }

    ids.add(clave);

    [
      'sede_id',
      'nombre',
      'distrito_id',
      'state'
    ].forEach(campo => {

      if (estaVacioAgentes(obtenerCampoAgentes(agente, campo))) {
        throw new Error(
          `Falta el campo "${campo}" en la fila ${agente._fila} ` +
          `(ID ${id}).`
        );
      }

    });

  });

}


/* ==========================================================================
   SINCRONIZACIÓN PRINCIPAL
   ========================================================================== */


function sincronizarDataAgentesSunarp() {

  const bloqueo = LockService.getScriptLock();

  if (!bloqueo.tryLock(30000)) {
    throw new Error(
      'No se pudo iniciar la sincronización: existe otra ejecución.'
    );
  }

  try {

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      throw new Error('No se encontró el archivo de Google Sheets.');
    }

    const firmaOrigen = obtenerFirmaOrigenAgentesSunarp_(ss);

    /* --------------------------------------------------------------
       1. OBTENER HOJAS
       -------------------------------------------------------------- */

    const hojaOrigen = ss.getSheetByName(
      AGENTES_SUNARP_CONFIG.HOJA_ORIGEN
    );

    const hojaDestino = ss.getSheetByName(
      AGENTES_SUNARP_CONFIG.HOJA_DESTINO
    );

    const hojaConfiguracion = ss.getSheetByName(
      AGENTES_SUNARP_CONFIG.HOJA_CONFIGURACION
    );

    const auxiliares = AGENTES_SUNARP_CONFIG.HOJAS_AUXILIARES;

    const hojaSedes = ss.getSheetByName(auxiliares.SEDES);

    const hojaDepartamentos = ss.getSheetByName(
      auxiliares.DEPARTAMENTOS
    );

    const hojaProvincias = ss.getSheetByName(
      auxiliares.PROVINCIAS
    );

    const hojaDistritos = ss.getSheetByName(
      auxiliares.DISTRITOS
    );


    if (!hojaOrigen || !hojaDestino || !hojaConfiguracion) {
      throw new Error(
        'No se encontró alguna de las hojas principales: ' +
        'Agentes Sunarp, data agentes sunarp o config agentes.'
      );
    }

    if (
      !hojaSedes ||
      !hojaDepartamentos ||
      !hojaProvincias ||
      !hojaDistritos
    ) {
      throw new Error(
        'Falta una o más hojas auxiliares: sede, departamentos, ' +
        'provincias o distritos.'
      );
    }


    /* --------------------------------------------------------------
       2. VALIDAR ENCABEZADOS
       -------------------------------------------------------------- */

    validarCabecerasAgentes(hojaOrigen, [
      'id',
      'sede_id',
      'nombre',
      'distrito_id',
      'direccion',
      'referencia',
      'url_destination',
      'state'
    ]);

    validarCabecerasAgentes(hojaSedes, [
      'id',
      'name'
    ]);

    validarCabecerasAgentes(hojaDepartamentos, [
      'id',
      'name'
    ]);

    validarCabecerasAgentes(hojaProvincias, [
      'id',
      'name',
      'id_departamento'
    ]);

    validarCabecerasAgentes(hojaDistritos, [
      'id',
      'name',
      'id_provincia'
    ]);

    validarCabecerasAgentes(
      hojaDestino,
      AGENTES_SUNARP_CONFIG.CABECERAS_DESTINO
    );


    /* --------------------------------------------------------------
       3. LEER CONFIGURACIÓN Y REGISTROS
       -------------------------------------------------------------- */

    const configuracion = obtenerConfiguracionAgentes(
      hojaConfiguracion
    );

    const agentes = leerRegistrosAgentes(hojaOrigen);

    const sedes = leerRegistrosAgentes(hojaSedes);

    const departamentos = leerRegistrosAgentes(hojaDepartamentos);

    const provincias = leerRegistrosAgentes(hojaProvincias);

    const distritos = leerRegistrosAgentes(hojaDistritos);

    validarAgentesOrigen(agentes);


    /* --------------------------------------------------------------
       4. CONSTRUIR ÍNDICES POR ID
       -------------------------------------------------------------- */

    const indiceSedes = crearIndiceAgentes(
      sedes,
      auxiliares.SEDES
    );

    const indiceDepartamentos = crearIndiceAgentes(
      departamentos,
      auxiliares.DEPARTAMENTOS
    );

    const indiceProvincias = crearIndiceAgentes(
      provincias,
      auxiliares.PROVINCIAS
    );

    const indiceDistritos = crearIndiceAgentes(
      distritos,
      auxiliares.DISTRITOS
    );


    /* --------------------------------------------------------------
       5. GENERAR REGISTROS PARA EL DESTINO
       -------------------------------------------------------------- */

    const registrosGenerados = agentes.map(agente => {

      const ubicacion = reconstruirUbicacionAgente(
        agente,
        indiceSedes,
        indiceDepartamentos,
        indiceProvincias,
        indiceDistritos
      );

      const registro = {

        id: obtenerCampoAgentes(
          agente,
          'id'
        ),

        sede: ubicacion.sede,

        nombre: obtenerCampoAgentes(
          agente,
          'nombre'
        ),

        departamento: ubicacion.departamento,

        provincia: ubicacion.provincia,

        distrito: ubicacion.distrito,

        direccion: obtenerCampoAgentes(
          agente,
          'direccion'
        ),

        referencia: obtenerCampoAgentes(
          agente,
          'referencia'
        ),

        url_destination: obtenerCampoAgentes(
          agente,
          'url_destination'
        ),

        state: obtenerCampoAgentes(
          agente,
          'state'
        )

      };


      /*
       * La configuración global se aplica primero.
       * Los datos individuales del agente se aplican después.
       */

      return {
        ...configuracion,
        ...registro
      };

    });


    /* --------------------------------------------------------------
       6. MAPEAR REGISTROS SEGÚN LOS ENCABEZADOS DEL DESTINO
       -------------------------------------------------------------- */

    const cabeceras = hojaDestino
      .getRange(1, 1, 1, hojaDestino.getLastColumn())
      .getDisplayValues()[0]
      .map(valor => String(valor ?? '').trim());


    const filasFinales = registrosGenerados.map(registro =>

      cabeceras.map(cabecera => {

        const valor = obtenerCampoAgentes(
          registro,
          cabecera
        );

        return valor ?? '';

      })

    );


    /* --------------------------------------------------------------
       7. ACTUALIZAR data agentes sunarp
       -------------------------------------------------------------- */

    const filasAnteriores = Math.max(
      hojaDestino.getLastRow() - 1,
      0
    );

    const filasAfectadas = Math.max(
      filasAnteriores,
      filasFinales.length
    );


    /*
     * Ampliar filas si el destino necesita más espacio.
     */

    if (hojaDestino.getMaxRows() < filasFinales.length + 1) {

      hojaDestino.insertRowsAfter(
        hojaDestino.getMaxRows(),
        filasFinales.length + 1 - hojaDestino.getMaxRows()
      );

    }


    /*
     * Limpiar exclusivamente los datos anteriores.
     * Se conservan encabezados y formatos.
     */

    if (filasAfectadas > 0) {

      hojaDestino
        .getRange(
          2,
          1,
          filasAfectadas,
          cabeceras.length
        )
        .clearContent();

    }


    /*
     * Escribir los registros reconstruidos.
     */

    if (filasFinales.length > 0) {

      hojaDestino
        .getRange(
          2,
          1,
          filasFinales.length,
          cabeceras.length
        )
        .setValues(filasFinales);

    }


    SpreadsheetApp.flush();

    // Registrar la versión de la hoja que se acaba de sincronizar.
    PropertiesService.getScriptProperties().setProperty(
        CLAVE_FIRMA_AGENTES_SUNARP,
        firmaOrigen
    );

    Logger.log(
        'Sincronización de Agente Sunarp completada. ' +
        `Registros procesados: ${registrosGenerados.length}.`
    );


  } finally {

    bloqueo.releaseLock();

  }

}


/* ==========================================================================
   DISPARADORES AUTOMÁTICOS
   ========================================================================== */


/* ==========================================================================
   DETECCIÓN DE CAMBIOS EN AGENTES SUNARP
   ========================================================================== */

const CLAVE_FIRMA_AGENTES_SUNARP = 'FIRMA_AGENTES_SUNARP_ORIGEN';


/*
 * Calcula una firma del contenido de la hoja de origen.
 * Permite detectar cambios realizados tanto manualmente
 * como desde otra aplicación mediante Apps Script.
 */

function obtenerFirmaOrigenAgentesSunarp_(ss) {

  const hoja = ss.getSheetByName(
    AGENTES_SUNARP_CONFIG.HOJA_ORIGEN
  );

  if (!hoja) {
    throw new Error(
      'No se encontró la hoja Agentes Sunarp.'
    );
  }

  const valores = hoja
    .getDataRange()
    .getDisplayValues();

  const contenido = JSON.stringify(valores);

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    contenido,
    Utilities.Charset.UTF_8
  );

  return Utilities.base64Encode(digest);

}


/*
 * Revisa si cambió la hoja de origen.
 *
 * Si detecta cambios, ejecuta la sincronización completa.
 */

function verificarCambiosAgentesSunarp() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'No se encontró el spreadsheet activo.'
    );
  }

  const firmaActual = obtenerFirmaOrigenAgentesSunarp_(ss);

  const propiedades = PropertiesService.getScriptProperties();

  const firmaAnterior = propiedades.getProperty(
    CLAVE_FIRMA_AGENTES_SUNARP
  );

  if (firmaActual === firmaAnterior) {
    return;
  }

  sincronizarDataAgentesSunarp();

}


/*
 * Sincroniza cuando se edita una hoja observada.
 */

function actualizarDataAgentesSunarpAlEditar(e) {

  if (!e || !e.range) {
    return;
  }

  const nombreHoja = e.range.getSheet().getName();

  if (!AGENTES_SUNARP_CONFIG.HOJAS_OBSERVADAS.includes(nombreHoja)) {
    return;
  }

  sincronizarDataAgentesSunarp();

}


/*
 * Sincroniza ante inserción o eliminación de filas.
 */

function actualizarDataAgentesSunarpAlCambiar(e) {

  if (!e) {
    return;
  }

  const cambiosEstructurales = [
    'INSERT_ROW',
    'REMOVE_ROW'
  ];

  if (!cambiosEstructurales.includes(e.changeType)) {
    return;
  }

  sincronizarDataAgentesSunarp();

}


/* ==========================================================================
   INSTALACIÓN DE DISPARADORES
   ========================================================================== */


/*
 * Ejecutar manualmente esta función una sola vez
 * para instalar los disparadores.
 */

function instalarDisparadoresDataAgentesSunarp() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'No se pudo acceder al archivo de Google Sheets activo.'
    );
  }

  const funciones = [
    'actualizarDataAgentesSunarpAlEditar',
    'actualizarDataAgentesSunarpAlCambiar',
    'verificarCambiosAgentesSunarp'
  ];


  /*
   * Eliminar únicamente los disparadores de esta sincronización.
   */

  ScriptApp.getProjectTriggers().forEach(trigger => {

    if (funciones.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }

  });


  /*
   * Disparador para ediciones.
   */

  ScriptApp
    .newTrigger('actualizarDataAgentesSunarpAlEditar')
    .forSpreadsheet(ss)
    .onEdit()
    .create();


  /*
   * Disparador para cambios estructurales.
   */

  ScriptApp
    .newTrigger('actualizarDataAgentesSunarpAlCambiar')
    .forSpreadsheet(ss)
    .onChange()
    .create();


  // Disparador periódico para detectar cambios
  // realizados por otras aplicaciones mediante Apps Script.

  ScriptApp
      .newTrigger('verificarCambiosAgentesSunarp')
      .timeBased()
      .everyMinutes(5)
      .create();

  /*
   * Primera sincronización.
   */

  sincronizarDataAgentesSunarp();


  Logger.log(
    'Disparadores de Agente Sunarp instalados correctamente.'
  );

}