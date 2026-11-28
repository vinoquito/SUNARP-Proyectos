# Estado y pendientes de rendimiento — SUNARP

**Fecha de corte:** 25 de noviembre de 2026  
**Rama:** `feat/directorio-personas-datos-asignaciones`  
**Último commit funcional antes de esta documentación:** `16c261699e81e542dd1cf8a2bf0b7976aea74656`  
**Commit de esta documentación:** `438e0ec858814cac30e4de9de952d59a2e2826cc`  
**Repositorio:** `vinoquito/SUNARP-Proyectos`

Este documento conserva la línea base, los cambios realizados, las mediciones observadas y los asuntos pendientes de rendimiento. Su objetivo es permitir continuar el trabajo en otro chat sin repetir el análisis funcional ni volver a solicitar las tablas y pruebas ya compartidas.

## 1. Estado general

Hay dos frentes de rendimiento pendientes y separados:

1. **Administración de accesos:** inicio de módulo, bootstrap, pestañas Permisos/Asignaciones, listado y búsqueda de usuarios, búsqueda por documento e historial de auditoría.
2. **Información de personal — Zona Registral IX (ZR_IX):** carga de una sede con aproximadamente 1.852 asignaciones, paginada en dos páginas.

No se debe declarar resuelto ninguno de los dos frentes por una mejora aislada. Las mediciones varían según caché fría/caliente, generación de fuentes y lecturas reales de Google Sheets.

## 2. Administración de accesos

### 2.1. Últimos cambios aplicados

En `Backend/Gestor de intranet SUNARP/AccessManagementService.js` se incorporó caché compartida para los catálogos administrativos:

- `access-permission-catalogs:v1`: `Modulos`, `Operaciones`, `Permisos`.
- `access-role-permission-catalogs:v1`: `Roles`, `RolPermiso`.

Las pestañas siguen cargándose de forma diferida. La primera apertura obtiene los catálogos necesarios; las pestañas siguientes reutilizan los catálogos comunes. La caché tiene TTL de una hora y depende de las generaciones de las fuentes para invalidar los datos cuando las escrituras pasan por SUNARP Core.

Se incorporó el registro:
`[AccessManagement] Catalog set cache`.

Pruebas CI del último cambio:
- Commit: `16c261699e81e542dd1cf8a2bf0b7976aea74656`.
- Ejecución: [Backend regression checks](https://github.com/vinoquito/SUNARP-Proyectos/actions/runs/45672023700).
- Resultado: **293 pruebas aprobadas, 0 fallidas**.

La caché no garantiza detectar inmediatamente modificaciones manuales hechas directamente en las hojas, fuera de los mecanismos de escritura/invalidation de Core; en ese caso puede aplicar el TTL de hasta una hora.

### 2.2. Mediciones posteriores al cambio (25/11/2026, 13:16–13:19)

| Operación | Tiempo observado | Diagnóstico |
|---|---:|---|
| `getAppShellConfig` | 3,56 s | Mejoró frente a 13,097 s de la medición anterior. Contexto de autorización en caché: 138 ms; la lectura del menú sigue consumiendo tiempo. |
| `getAccessManagementData` | 6,323 s | Sigue lento. Bootstrap: 4,260 ms; catálogos: 4,165 ms, caché fría. |
| `getAccessManagementTabData(documenttypes)` | 2,743 s | Tipos de documento: 1,260 ms en el servicio; 8 registros. La precarga permite abrir el formulario sin bloquearlo, pero la lectura del catálogo aún tiene coste. |
| Primera carga de Permisos | 3,449 s | Caché del conjunto fría: 1,838 ms; lee Operaciones y Permisos, mientras Módulos aparece como un acierto de caché en Core. |
| Primera carga de Asignaciones | 5,135 s | Reutiliza el conjunto de Permisos (92 ms), pero carga Roles y RolPermiso. El conjunto `access-role-permission-catalogs:v1` se construye en 2,869 ms. |
| Búsqueda por documento | 4,058 s y 8,115 s | Comportamiento variable. En una llamada no hubo coincidencia documental; en otra sí, pero volvió a leer `tipo_documento_identidad` desde la fuente. |
| Historial de auditoría | 2,881 s y 8,169 s | En la llamada lenta se reconstruyó el contexto de autorización: 5,424 ms; no se mantuvo el acierto de caché. |
| Primera consulta de usuarios | 9,768 s | Índice de metadatos: 5,056 ms; consulta autorizada de personas: 2,323 ms; total interno de página: 7,482 ms. |
| Consultas siguientes de usuarios | 1,451–4,452 s | Índice de metadatos en caché (aprox. 63–176 ms), pero consultas Core repetidas con `candidateCacheHit:false`; algunas páginas completas se resuelven en caché. |

### 2.3. Qué mejoró y qué no

**Mejoras demostradas:**
- `getAppShellConfig` pasó de 13,097 s a 3,56 s en las mediciones aportadas; el contexto de autorización estaba en caché.
- La segunda carga de Permisos reutilizó el conjunto compartido en 92 ms.
- Al abrir Asignaciones, los catálogos Módulos/Operaciones/Permisos se reutilizaron; solo se consultó el conjunto adicional de Roles/RolPermiso.
- El formulario de nuevo usuario abre sin esperar a que finalice la precarga de tipos de documento.

**Pendientes:**
1. Bootstrap de Administración de accesos: 6,323 s en esta muestra, con 4,165 s en catálogos.
2. Medir una segunda apertura de Asignaciones para confirmar `cacheHit:true` de `access-role-permission-catalogs:v1`.
3. Revisar por qué `getAccessManagementData` lee cuatro catálogos con cero aciertos de caché aunque las pestañas puedan reutilizar conjuntos propios.
4. Revisar por qué la búsqueda por documento vuelve a leer `tipo_documento_identidad`, aunque el frontend ya precarga ese catálogo. La precarga de interfaz no demuestra que el endpoint servidor comparta la misma caché.
5. Revisar expiración/evicción o cambios de generación del contexto de autorización: el historial de auditoría reconstruyó el contexto y consumió 5,424 ms.
6. Revisar el índice de usuarios en frío (5,056 ms) y las consultas autorizadas a `personas`. En las consultas repetidas se observan `candidateCacheHit:false` y `authorizedSnapshotCacheHit:false`, con `candidateLoadMs` de 633–1.277 ms. No asumir que el índice de metadatos en caché implica que la consulta de personas también esté en caché.
7. Revisar la variabilidad de los tiempos de acceso al Spreadsheet y sus pestañas; hay operaciones con pocos registros que tardan varios cientos de milisegundos o más.

No modificar ni debilitar las comprobaciones de permisos, ámbitos, autorización de Core o auditoría como atajo de rendimiento.

## 3. Información de personal — Zona Registral IX (ZR_IX)

### 3.1. Línea base y pruebas previas

Datos de prueba compartidos el 25/11/2026:

- `getDirectoryInitialData`: 4,3–4,9 s en frío; posteriormente, alrededor de 1,125 s.
- `getDirectorySiteData`:
  - `ZR_I`: 12,1 s.
  - `SEDE_CENTRAL`: 12,6 s.
  - `ZR_IX`: 9,8 s en una medición inicial, para aproximadamente 1.852 asignaciones en dos páginas.
- En el desglose inicial de ZR_IX se observó:
  - tiempo interno: 7.936 ms;
  - Core: 5.804 ms;
  - contexto: 1.236 ms;
  - jerarquía: 35 ms.
- En una repetición posterior, tras instrumentar y ajustar la ruta de carga, ZR_IX no mejoró: se registraron **18.679–23.113 s**.
- En esa medición posterior, los principales costes observados fueron:
  - contexto/catálogos: 5.998–8.630 ms;
  - carga de candidatos: 5.257–6.181 ms;
  - autorización: 10–49 ms;
  - resolución de relaciones: 3–5 ms;
  - enriquecimiento: 18–25 ms;
  - ordenamiento: 55–132 ms.
- La caché de instantánea autorizada registró `cacheHit:false` repetidamente; se identificó que su TTL de 10 minutos y/o su elegibilidad/clave de generación impedían reutilizarla en esas pruebas. Este punto quedó pendiente de optimización específica.

### 3.2. Instrumentación y cambios ya realizados

Se instrumentó `Backend/SUNARP Core/DataQuery.js` para medir, entre otras etapas:

- `authorizedSnapshotLookupMs`
- `candidateCacheLookupMs`
- `candidateLoadMs`
- `candidateCacheStoreMs`
- `candidateEvaluationMs`
- `pageHydrationMs`

También se trabajó en:
- `Backend/Gestor de intranet SUNARP/DirectoryService.js`
- `Backend/Gestor de intranet SUNARP/DirectoryScripts.html`
- `tests/directory-service.test.cjs)

La instrumentación de `DirectoryService.js` añadió mediciones de servicio y paginación `corePages` por offset, con snapshot v5. Un checkpoint reportado fue HEAD `12ead7dd86f7e67ca56d7f1c503702b445ad8a7f`, con 289/289 pruebas aprobadas. Este SHA es un checkpoint de aquella intervención, no sustituye al último commit de la rama indicado al inicio de este documento.

### 3.3. Estado funcional que debe preservarse

La jerarquía funcional fue validada y no debe reabrirse como parte de esta tarea de rendimiento:

**Sede → Local → Estructura organizacional → Dependencias → Asignaciones.**

Debe seguir admitiendo asignaciones que se relacionen mediante `estructura_local_id), mediante `local_id) solamente, o mediante ambos cuando sean coherentes.

Reglas de presentación/ámbito ya validadas:
- Ámbitos `TOTAL` y `SEDE`: muestran el selector Local.
- Ámbito `LOCAL`: restringe u oculta los selectores según la autorización.
- Ámbito `ESTRUCTURA_ORG`: oculta Sede y Local y comienza en los nodos hijos autorizados.
- `order` es relativo al padre jerárquico, no un correlativo global por sede.
- La jerarquía y los filtros quedaron validados por el usuario; no cambiarlos para intentar acelerar la consulta.

La última restricción explícita del usuario fue: **no tocar filtros ni reglas de autorización**. El trabajo de rendimiento debe concentrarse en lecturas, consultas, caché, paginación, hidratación y procesamiento, manteniendo exactamente los resultados funcionales y los controles de acceso.

### 3.4. Pendiente de Zona IX

No se ha demostrado una mejora sostenida para ZR_IX. El problema quedó pendiente y debe retomarse con una prueba reproducible que registre por separado:

1. tiempo total RPC;
2. tiempo interno de `DirectoryService`;
3. tiempo de consulta Core;
4. lecturas de catálogos/contexto;
5. generación y aciertos de caché de candidatos e instantánea autorizada;
6. número de candidatos, autorizados, filas retenidas e hidratadas;
7. páginas solicitadas y offsets;
8. autorización, relaciones, enriquecimiento y ordenamiento.

La prioridad es averiguar por qué la instantánea autorizada no se reutiliza y por qué la carga de candidatos cuesta varios segundos. No asumir que el ordenamiento o la jerarquía son el cuello de botella: sus tiempos medidos fueron pequeños.

## 4. Restricciones de trabajo para la continuación

- No volver a pedir al usuario que comparta las tablas de seguridad, asignaciones o estructura ya documentadas en el proyecto y analizadas en conversaciones anteriores.
- No volver a analizar ni cambiar la jerarquía, los filtros o las reglas de autorización que ya fueron validadas.
- No sustituir autorización de Core por filtrado exclusivo en frontend ni omitir controles para ganar velocidad.
- No hacer cambios de producción, crear versiones de Apps Script ni desplegar. El usuario realiza la sincronización y las pruebas con su despliegue de prueba.
- El usuario trabaja en Windows CMD. La carpeta local conocida es `D:\SUNARP-Proyectos`; rama `feat/directorio-personas-datos-asignaciones`.
- Después de cada intervención, comparar mediciones frías y calientes y dejar explícito qué mejoró, qué no mejoró y qué quedó pendiente.
- No considerar que una prueba CI aprobada demuestra rendimiento real en Apps Script; la medición debe hacerse con registros de ejecución de Google Apps Script.

## 5. Siguiente orden de trabajo

1. Cerrar la validación de caché de Asignaciones (segunda apertura y `cacheHit:true` de Roles/RolPermiso).
2. Dejar Administración de accesos documentado como pendiente, con foco en bootstrap, contexto de autorización, búsqueda por documento y consultas Core de usuarios.
3. Retomar el rendimiento de Información de personal en ZR_IX, sin alterar funcionalidad.
4. Proponer e implementar optimizaciones únicamente cuando los registros identifiquen el cuello de botella; agregar pruebas de regresión y medir nuevamente en Apps Script.

**Conclusión:** se han conseguido mejoras parciales y se incorporaron mecanismos de caché, pero ambos módulos conservan pendientes de rendimiento. Este documento es la referencia de continuidad y evita reiniciar el análisis funcional.
