# Auditoría de invalidación externa de SUNARP Core

**Fecha:** 20 de noviembre de 2026  
**Rama auditada:** `feat/directorio-personas-datos-asignaciones`  
**Alcance:** código versionado de los proyectos bajo `Backend`. No se modificó código ni se alteraron despliegues durante esta auditoría.

## 1. Fuentes reales configuradas por Gestor de intranet

La configuración está centralizada en [AppConfig.js](https://github.com/vinoquito/SUNARP-Proyectos/blob/feat/directorio-personas-datos-asignaciones/Backend/Gestor%20de%20intranet%20SUNARP/AppConfig.js).

| Clave Core | Archivo configurado | Contenido que consume Gestor |
|---|---|---|
| `APP_DATA` | `19_hmffEafIne-TfDEin9zLg1eOtSbJXkwk7__A6X64A` — Gestor de intranet - Datos | `Menu` |
| `MASTER_DATA` | `1oIAWBuSE0SiwINa0v0KybCYiwKZFootQXoccwKDVBIE` — Global parameters | Catálogos maestros: `sede`, `tipos_local`, `locales`, `tipos_estructura`, `estructura_org`, `estructura_local`, `cargos` y `tipo_documento_identidad` |
| `DIRECTORY` | `1voZ8scqmrhy06J18cS1_rCPrxQADRXUq49x8Owxbg6E` — Directorios telefónicos | `personas`, `servidores datos personales`, `asignaciones` y réplicas de catálogos |
| `SECURITY` | `1RbY21JK7d2kEyV9t0trTquRU-BWB5Sb4Tz_iq6xOczI` — Seguridad - Gestor de contenidos Intranet SUNARP | `Usuarios`, `Modulos`, `Roles`, `UsuarioRol`, `Permisos`, `Operaciones`, `RolPermiso`, `TiposAmbito`, `AmbitosAcceso`, `Auditoria`, y réplicas `Sedes` y `EstructuraOrg` |

Las dependencias de réplicas están declaradas en el mismo archivo:

- Las siete réplicas organizacionales de `DIRECTORY` dependen de sus respectivas pestañas de `MASTER_DATA`.
- `SECURITY.Sedes` y `SECURITY.EstructuraOrg` dependen de `MASTER_DATA.sede` y `MASTER_DATA.estructura_org`.
- El catálogo `tipo_documento_identidad` se resuelve directamente desde `MASTER_DATA`, no desde una copia alternativa.

Se conservan separados los dos conjuntos de réplicas organizacionales; no deben unificarse.

## 2. Escrituras encontradas dentro del repositorio

### 2.1 Gestor de intranet SUNARP: consumidor directo de Core

Es el único proyecto versionado que declara e invoca directamente `SUNARPCore` en esta rama.

**Administración de accesos.** [AccessManagementService.js](https://github.com/vinoquito/SUNARP-Proyectos/blob/feat/directorio-personas-datos-asignaciones/Backend/Gestor%20de%20intranet%20SUNARP/AccessManagementService.js) utiliza los métodos de escritura de Core para altas, modificaciones, estados y sincronización de relaciones de usuarios, roles, permisos, ámbitos y asignaciones rol-permiso. La auditoría se agrega mediante `SUNARPCore.appendAuditEvent()`.

**Información de personal.** [DirectoryService.js](https://github.com/vinoquito/SUNARP-Proyectos/blob/feat/directorio-personas-datos-asignaciones/Backend/Gestor%20de%20intranet%20SUNARP/DirectoryService.js) delega las altas, modificaciones, bajas, estados y compensaciones de persona, ficha personal y asignaciones a `insertRecord`, `updateRecord`, `setRecordStatus` y `deleteRecord` de Core. Cada escritura y cada compensación pasa por Core y provoca la invalidación de la fuente correspondiente. `saveDirectoryEntry()` no es una transacción multihoja: sus llamadas CRUD independientes pueden dejar un estado intermedio visible entre pasos, limitación ya documentada en el contrato.

**Única ruta de escritura directa identificada en el Gestor.** La migración excepcional `migrateAccessManagementSchema()` escribe directamente con `SpreadsheetApp` en:

- `SECURITY.Permisos`
- `SECURITY.AmbitosAcceso`
- `SECURITY.TiposAmbito`

La función envuelve esas escrituras en `SUNARPCore.runSourceWriteBatch()`, declara exactamente esas tres fuentes, marca cada mutación con `markWriteStarted()` y deja que Core coordine el bloqueo, el `flush` y la invalidación al finalizar, incluso cuando ocurre un error después de comenzar a escribir. No se encontró una escritura directa adicional a las fuentes Core en los servicios funcionales del Gestor.

**Invalidación manual del Directorio.** Existe `clearDirectoryCache()` en `DirectoryService.js`. Exige el permiso `INFORMACION_PERSONAL_VER` y llama a `invalidateSourceCache()` para las diez fuentes del archivo Directorios telefónicos y para el catálogo maestro `tipo_documento_identidad`. No se encontró una llamada a esta función en los archivos HTML de la interfaz; por tanto, el repositorio no acredita que haya un botón de usuario que la ejecute.

No se encontró un equivalente de esa utilidad para invalidar manualmente `APP_DATA`, `MASTER_DATA` completo o `SECURITY`.

### 2.2 Gestor de contenidos Sunarp: escrituras en archivos distintos

El proyecto no declara la biblioteca Core. [Código.js](https://github.com/vinoquito/SUNARP-Proyectos/blob/feat/directorio-personas-datos-asignaciones/Backend/Gestor%20de%20contenidos%20Sunarp/C%C3%B3digo.js) configura estos archivos:

- `SPREADSHEET_ID`: `1bMMjklKWjHAM8GfWPFLYmOxz-B20lbsyzeOuOabRh-0`
- `MASTER_SPREADSHEET_ID`: `17DLCau1UjHaqgnGWrNAQ6mB4vUULZuuCsfPSIHdhoiQ`
- `SECURITY_SPREADSHEET_ID`: `1eLStGWsZUmqllXrpwsU_XJL58B-QzGc2a27EygkErgE`

Escribe directamente en sus tablas de agentes, catálogos y seguridad; su módulo de auditoría también escribe en su propio archivo de seguridad. Ninguno de esos tres IDs coincide con los cuatro IDs configurados por Core en la sección 1. Por ello, las escrituras versionadas de este proyecto no son escritoras de las fuentes Core auditadas y no requieren invalidar la caché de SUNARP Core.

Este proyecto mantiene su propio mecanismo de caché/auditoría; no debe confundirse con la caché central de Core.

### 2.3 Agente Sunarp: sincronización de otra hoja

[Agente Sunarp/Código.js](https://github.com/vinoquito/SUNARP-Proyectos/blob/feat/directorio-personas-datos-asignaciones/Backend/Agente%20Sunarp/C%C3%B3digo.js) no declara ni invoca Core. Utiliza `SpreadsheetApp.getActiveSpreadsheet()`, lee las hojas `Agentes Sunarp`, `sede`, `departamentos`, `provincias`, `distritos` y `config agentes`, y escribe el resultado en `data agentes sunarp`; también completa IDs faltantes en `Agentes Sunarp`.

Su código contiene una función instaladora, `instalarDisparadoresDataAgentesSunarp()`, que reemplaza únicamente sus propios activadores y crea:

- `actualizarDataAgentesSunarpAlEditar`: activador instalable `onEdit`.
- `actualizarDataAgentesSunarpAlCambiar`: activador instalable `onChange`, limitado a `INSERT_ROW` y `REMOVE_ROW`.
- `verificarCambiosAgentesSunarp`: activador temporal cada cinco minutos.

Estos activadores sincronizan `data agentes sunarp`; no llaman a `SUNARPCore.invalidateSourceCache()` y no constituyen un mecanismo de invalidación de las fuentes Core. El ID del archivo contenedor no está fijado en el código porque se obtiene mediante `getActiveSpreadsheet()`; debe comprobarse en Apps Script/Google Sheets para cerrar la identificación de ese proyecto. Los nombres de las pestañas que modifica no corresponden a las tablas funcionales de Core enumeradas en la sección 1.

### 2.4 SUNARP Core y SUNARP UI

Core contiene las escrituras de repositorio y compuesto; no se encontraron definiciones de activadores `ScriptApp.newTrigger`, `onEdit` u `onChange` en sus archivos de implementación. Las escrituras de Core invalidan la fuente modificada mediante su propio contrato.

SUNARP UI es una biblioteca de interfaz y no se identificaron escrituras de hojas ni instalación de activadores en su código.

## 3. Resultado de la auditoría de invalidación

| Tipo de modificación | Resultado observado | Acción requerida |
|---|---|---|
| CRUD del Gestor sobre `DIRECTORY` y `SECURITY`, ejecutado mediante Core | Invalidación automática de la fuente escrita | Ninguna adicional |
| Migración de esquema de accesos | Escrituras directas agrupadas en `runSourceWriteBatch`; invalida las tres fuentes declaradas | Ninguna adicional si se ejecuta por esa función |
| Escritura de otro proyecto sobre un ID Core sin pasar por Core | No se identificó una ruta versionada de este tipo; proyectos externos al repositorio no pueden descartarse | El escritor debe llamar a `invalidateSourceCache(source)` después de completar cada fuente modificada |
| Edición manual de una pestaña fuente en Sheets | No cambia por sí sola la generación de Core | Ejecutar invalidación explícita de esa fuente antes de exigir datos actualizados |
| Edición del maestro que alimenta réplicas con `IMPORTRANGE` | La dependencia está declarada, pero la modificación externa no avanza automáticamente la generación del maestro | Invalidar la fuente maestra correspondiente; comprobar además que `IMPORTRANGE` ya refleje el cambio antes de validar la réplica |
| Edición directa de una réplica, sin editar el maestro | La generación de esa réplica no cambia automáticamente | Invalidar esa réplica directamente |

La invalidación de Core es por fuente física. Ejemplos de llamadas desde el proyecto consumidor, usando el ID y la pestaña configurados en `AppConfig.js`:

```js
SUNARPCore.invalidateSourceCache(
  getIntranetDataSource('APP_DATA', 'Menu')
);

SUNARPCore.invalidateSourceCache(
  getIntranetDataSource('MASTER_DATA', 'sede')
);

SUNARPCore.invalidateSourceCache(
  getIntranetDataSource('SECURITY', 'Usuarios')
);

SUNARPCore.invalidateSourceCache(
  getIntranetDataSource('DIRECTORY', 'asignaciones')
);
```

Cada llamada debe realizarse después de que la escritura en esa fuente haya terminado. Si un proceso modifica varias fuentes, debe invalidar cada una o utilizar `runSourceWriteBatch()` cuando la operación y sus restricciones de escritura sean compatibles con ese mecanismo.

La caché puede ser desalojada antes del TTL, pero no debe utilizarse ese comportamiento como mecanismo de invalidación. Sin invalidación explícita, una edición manual o escritura externa puede dejar consultas obsoletas hasta que expiren o sean desalojadas las entradas cacheadas.

## 4. Activadores: qué se puede y qué no se puede afirmar desde el repositorio

**No se puede determinar desde GitHub si un activador instalable está efectivamente creado en una cuenta de Google.** El código solo demuestra qué funciones podrían instalarlo, no que alguien haya ejecutado la función instaladora ni quién es propietario de los activadores actuales.

Hallazgos estáticos:

- SUNARP Core: no se encontraron instaladores ni manejadores de activadores en sus archivos de implementación.
- Gestor de intranet SUNARP: no se encontraron instaladores ni manejadores de activadores de hoja o temporales.
- Gestor de contenidos Sunarp: no se encontraron instaladores de activadores; las funciones `onChange()` de sus HTML pertenecen a la lógica de interfaz y no son activadores de Apps Script.
- Agente Sunarp: sí define la instalación de los tres activadores de sincronización descritos en 2.3; su instalación real no está acreditada por el código.
- SUNARP UI: no se encontraron activadores.

Los activadores instalados son propios del proyecto y de la cuenta que los creó; no se heredan por incluir una biblioteca. Un activador de Agente Sunarp no invalida cachés de Core por el mero hecho de ejecutarse.

## 5. Verificaciones manuales que siguen pendientes

Para cerrar la auditoría operativa, comprobar en Apps Script:

1. **Proyecto SUNARP Core:** abrir el panel Activadores y comprobar si existe algún activador instalado. El código auditado no define ninguno.
2. **Proyecto Gestor de intranet SUNARP:** abrir el panel Activadores y comprobar si existe algún activador instalado. El código auditado no define ninguno.
3. **Proyectos Apps Script externos que estén vinculados o escriban en los cuatro archivos fuente de la sección 1:** identificar si existen y, cuando existan, revisar sus activadores y código de escritura. Registrar función, tipo de evento, archivo fuente, propietario y si llama a `invalidateSourceCache` para todas las pestañas que modifica.
4. **Archivo contenedor de Agente Sunarp:** confirmar el ID del archivo al que está vinculado. Su instalador de activadores no es una invalidación de Core; esta comprobación permite cerrar su identificación dentro del inventario.
5. **Ediciones manuales:** confirmar quién administra `Global parameters`, `Directorios telefónicos`, `Seguridad - Gestor de contenidos Intranet SUNARP` y `Gestor de intranet - Datos`, y que conozca que debe ejecutarse la invalidación de Core cuando edite una fuente cacheada.

En cada panel de activadores, registrar el nombre de la función, el origen del evento, el tipo de evento o frecuencia y la cuenta propietaria. No instalar nuevos activadores todavía. No se debe asumir que `onEdit` o `onChange` detectará cambios de `IMPORTRANGE` o escrituras hechas por otros servicios.

## 6. Conclusión

**Resultado del código versionado:** no se encontró una escritura funcional de los proyectos Gestor de contenidos Sunarp o Agente Sunarp contra las cuatro fuentes Core configuradas. Las escrituras del Gestor de intranet pasan por Core, salvo la migración excepcional, correctamente agrupada con `runSourceWriteBatch`. No se identificó una ruta de escritura versionada que omita invalidación dentro de ese consumidor.

**Pendiente para cerrar Fase 1:** comprobar en Apps Script los activadores instalados y descartar proyectos externos no versionados que escriban los cuatro archivos fuente. Además, confirmar la identidad del archivo contenedor de Agente Sunarp y acordar el procedimiento operativo para invalidar después de ediciones manuales. Si se detecta un escritor externo, debe corregirse antes de cerrar la fase para que invalide cada fuente que modifica.

Esta auditoría no instala activadores, no cambia el código de producción, no altera la versión 10 de Core y no crea ni modifica despliegues.
