# Auditoría de invalidación externa de SUNARP Core

**Fecha:** 20 de noviembre de 2026  
**Rama auditada:** `feat/directorio-personas-datos-asignaciones`  
**Alcance:** arquitectura actualmente integrada de SUNARP Core y Gestor de intranet SUNARP. Los demás proyectos Backend aún no están unificados bajo esta arquitectura y quedan expresamente fuera de esta auditoría. No se modificó código ni se alteraron despliegues.

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

### 2.2 Proyectos todavía no unificados

Los proyectos **Gestor de contenidos Sunarp** y **Agente Sunarp** todavía no están incorporados a la arquitectura unificada objeto de esta Fase 1. Por indicación del responsable del proyecto, sus mecanismos de escritura y sus activadores no forman parte del alcance ni condicionan el cierre actual. Se revisarán cuando esos proyectos se integren formalmente.

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

## 4. Activadores dentro del alcance actual

La inspección estática del código no encontró definiciones de activadores en SUNARP Core ni en Gestor de intranet. El responsable comprobó además, directamente en Apps Script, que ninguno de los dos proyectos tiene activadores instalados.

Los activadores son recursos propios de cada proyecto y de la cuenta que los creó; no se heredan por incluir una biblioteca. Como no hay activadores instalados en Core ni en Gestor, no existe automatización por trigger para invalidar tras ediciones manuales. Esta limitación queda cubierta por el procedimiento explícito de invalidación de la sección 5.

Los demás proyectos Backend todavía no están unificados y permanecen fuera del alcance de esta auditoría. Sus activadores y sus archivos contenedores no condicionan el cierre de Fase 1.

## 5. Verificaciones manuales completadas

El responsable del proyecto comprobó directamente los paneles **Activadores** de los dos proyectos incluidos en el alcance:

1. **SUNARP Core:** no hay activadores instalados.
2. **Gestor de intranet SUNARP:** no hay activadores instalados.

Este resultado coincide con el código inspeccionado: ninguno de los dos proyectos define instaladores ni manejadores de activadores de edición/cambio/temporizador. No se instalarán activadores para esta fase.

Los demás proyectos Backend quedan fuera del alcance porque todavía no están unificados con la arquitectura Core/Gestor. No se requiere revisar sus activadores ni identificar sus archivos contenedores para cerrar esta fase.

### Procedimiento de consistencia para el alcance actual

- Las escrituras funcionales realizadas por el Gestor de intranet a través de Core invalidan automáticamente la fuente escrita.
- La migración excepcional de esquema ejecuta sus escrituras directas dentro de `runSourceWriteBatch()`, que coordina bloqueo, `flush` e invalidación.
- Una edición manual de una pestaña cacheada en Google Sheets no ejecuta una invalidación automática. Cuando sea necesario que la aplicación refleje inmediatamente esa edición, debe invocarse `SUNARPCore.invalidateSourceCache(source)` desde el proyecto Gestor, pasando la configuración exacta de archivo, pestaña y fila de encabezados mediante `getIntranetDataSource(sourceKey, sheetName, 1)`.
- Si no se requiere actualización inmediata, las entradas cacheadas se renovarán al expirar o ser desalojadas según el TTL y el comportamiento de CacheService. Este comportamiento es consistencia eventual, no invalidación inmediata.
- Para las réplicas `IMPORTRANGE`, primero debe reflejarse el cambio del maestro en la réplica y luego invalidarse la generación del maestro; si se editó directamente la réplica, debe invalidarse también esa réplica.

La ausencia de activadores queda aceptada como decisión operativa de la arquitectura actual: no se promete detección automática de ediciones manuales. No se instalarán triggers en Core ni en Gestor como parte del cierre de Fase 1.

## 6. Conclusión y estado de Fase 1

**Auditoría de código:** las escrituras funcionales del Gestor de intranet usan SUNARP Core y reciben invalidación automática. La única ruta de escritura directa encontrada, la migración de esquema, está protegida mediante `runSourceWriteBatch()`. No se encontró otra ruta de escritura del Gestor que omita la invalidación.

**Comprobación manual:** el responsable confirmó que no hay activadores instalados ni en SUNARP Core ni en Gestor de intranet. Esta situación es coherente con el diseño actual y se acepta: las ediciones manuales no generan invalidación automática y deben seguir el procedimiento explícito descrito en la sección 5.

**Alcance:** Gestor de contenidos Sunarp y Agente Sunarp se excluyen de esta auditoría porque todavía no están unificados bajo la arquitectura de Core. Su integración futura deberá incorporar el contrato de invalidación correspondiente antes de convertirse en consumidores o escritores de fuentes administradas por Core.

**Resultado: FASE 1 COMPLETADA para la arquitectura actualmente integrada de SUNARP Core y Gestor de intranet SUNARP.** La auditoría de invalidación externa queda completada. La limitación de consistencia ante ediciones manuales queda documentada y aceptada; no se requiere instalar activadores ni modificar código para cerrar Fase 1.

Esta auditoría no instala activadores, no cambia código de producción, no altera Core v10 y no crea ni modifica despliegues.
