# Modelo de permisos y ámbitos de acceso

**Propósito:** documentar la estructura de las hojas que construyen la autorización, las relaciones entre ellas, los datos de referencia compartidos y el comportamiento que implementa actualmente el código. Este documento sirve como contexto persistente para continuar el proyecto en otros chats sin volver a solicitar la misma explicación.

**Fecha de referencia:** 25 de noviembre de 2026  
**Rama:** `feat/directorio-personas-datos-asignaciones`  
**HEAD examinado antes de incorporar este documento:** `1ecc71b098cb60bd3de151d79512dd1e9d013a36`

Este documento registra los datos de ejemplo proporcionados por el responsable del proyecto y los contrasta con la implementación vigente. Cuando se distingue entre ambos, no se debe asumir que un nombre mostrado en una tabla coincide necesariamente con el nombre literal de una pestaña.

---

## 1. Libros y pestañas que forman el modelo

### 1.1. Libro Seguridad

Las tablas de autorización compartidas corresponden a estas pestañas:

- `Usuarios`
- `Roles`
- `UsuarioRol`
- `Permisos`
- `RolPermiso`
- `AmbitoAcceso` (nombre usado en la tabla compartida)
- `Modulos`
- `TipoAmbito` (nombre usado en la tabla compartida)
- `Operaciones`
- `Sedes`
- `EstructuraOrg`

`Sedes` y `EstructuraOrg` contienen los mismos datos de referencia que `sede` y `estructura_org` del libro Directorios telefónicos. Son utilizadas por distintas hojas para resolver relaciones. Su fuente maestra es el libro **Global parameters**; no son catálogos independientes que deban reconstruirse manualmente.

El código actual también declara la pestaña `Auditoria` para los registros de auditoría. No se recibió una tabla de ejemplo de esa pestaña en los datos compartidos; no forma parte de las relaciones necesarias para explicar la concesión de permisos.

**Diferencia de nombres que debe verificarse antes de modificar código:** las tablas recibidas se titularon `AmbitoAcceso` y `TipoAmbito`, pero `AccessManagementService.js` tiene configurados actualmente los nombres literales `AmbitosAcceso` y `TiposAmbito` (en plural). No se debe renombrar ninguna pestaña ni cambiar la configuración por inferencia. Para la ejecución real, debe respetarse el nombre literal que exista en el libro conectado y mantenerlo sincronizado con `ACCESS_MANAGEMENT_CONFIG.sheets`.

### 1.2. Libro Directorios telefónicos

Para analizar la construcción de las relaciones de permisos y los ámbitos de Información de personal, las pestañas necesarias de este libro son **exactamente estas seis**:

1. `personas`
2. `sede`
3. `locales`
4. `estructura_org`
5. `estructura_local`
6. `cargos`

No volver a solicitar otras pestañas de este libro para este análisis, salvo que una necesidad técnica nueva y concreta lo justifique. La lista anterior reemplaza cualquier lista anterior más amplia o incorrecta.

### 1.3. Libro Global parameters

Es la fuente maestra de catálogos compartidos. En particular:

- `sede` es la fuente de `Directorios telefónicos.sede` y de `Seguridad.Sedes`.
- `estructura_org` es la fuente de `Directorios telefónicos.estructura_org` y de `Seguridad.EstructuraOrg`.

La configuración de dependencias está declarada en `Backend/Gestor de intranet SUNARP/AppConfig.js`, bajo `MASTER_DATA`, `DIRECTORY`, `SECURITY` e `INTRANET_SOURCE_DEPENDENCIES`. Las pestañas consumidoras se conservan; la dependencia documenta la relación con la fuente maestra.

---

## 2. Estructura de las tablas de autorización

Los encabezados siguientes son los proporcionados para las tablas.

### 2.1. Usuarios

| Campo | Uso |
|---|---|
| `persona_id` | Identificador que relaciona la cuenta con `personas.persona_id` |
| `active` | Estado de la cuenta; los datos compartidos usan `TRUE` |

Ejemplos activos: `PER_117`, `PER_105` y `PER_350`.

La tabla `Usuarios` no contiene el correo institucional ni los nombres. La identidad se resuelve desde `personas`; `Usuarios` almacena `persona_id` y `active`.

### 2.2. Roles

Encabezados: `rol_id, nombre, descripcion, active`.

| rol_id | nombre | Descripción funcional |
|---|---|---|
| `ROL_ADMIN` | Administrador | Administración de los módulos y accesos según los permisos y ámbitos asignados |
| `ROL_EDITOR` | Editor | Registro y actualización de información en los módulos y ámbitos autorizados |
| `ROL_CONSULTA` | Consulta | Consulta de información en los módulos y ámbitos autorizados |

Los tres roles compartidos están activos.

### 2.3. UsuarioRol

Encabezados: `persona_id, modulo_id, rol_id, active`.

Relaciona una persona con un rol **en un módulo concreto**. Una persona puede tener roles distintos en módulos diferentes. La implementación exige como máximo una asignación de rol activa por persona y módulo; más de una asignación activa en el mismo módulo es una inconsistencia.

Asignaciones de ejemplo:

| persona_id | modulo_id | rol_id | active |
|---|---|---|---|
| `PER_117` | `MOD_INFO_PERSONAL` | `ROL_ADMIN` | TRUE |
| `PER_117` | `MOD_ACCESOS` | `ROL_ADMIN` | TRUE |
| `PER_105` | `MOD_INFO_PERSONAL` | `ROL_EDITOR` | TRUE |
| `PER_350` | `MOD_INFO_PERSONAL` | `ROL_EDITOR` | TRUE |

### 2.4. Modulos

Encabezados: `modulo_id, codigo, nombre, descripcion, active`.

| modulo_id | codigo | nombre | active |
|---|---|---|---|
| `MOD_INFO_PERSONAL` | `INFORMACION_PERSONAL` | Información de personal | TRUE |
| `MOD_DOC_NORMATIVOS` | `DOCUMENTOS_NORMATIVOS` | Documentos normativos | TRUE |
| `MOD_ACCESOS` | `ACCESOS` | Administración de accesos | TRUE |
| `MOD_AUDITORIA` | `AUDITORIA` | Auditoría | TRUE |

La existencia de un módulo activo no concede acceso por sí sola. Se requiere una asignación activa en `UsuarioRol` y un rol activo.

### 2.5. Permisos

Encabezados: `permiso_id, codigo, modulo_id, operacion_id, descripcion, active`.

| permiso_id | codigo | modulo_id | operacion_id | descripcion |
|---|---|---|---|---|
| PERM_001 | INFORMACION_PERSONAL_VER | MOD_INFO_PERSONAL | VER | Consultar registros del directorio |
| PERM_002 | INFORMACION_PERSONAL_CREAR | MOD_INFO_PERSONAL | CREAR | Registrar servidores en el directorio |
| PERM_003 | INFORMACION_PERSONAL_EDITAR | MOD_INFO_PERSONAL | EDITAR | Actualizar registros del directorio |
| PERM_004 | INFORMACION_PERSONAL_CAMBIAR_ESTADO | MOD_INFO_PERSONAL | CAMBIAR_ESTADO | Activar o desactivar registros del directorio |
| PERM_005 | INFORMACION_PERSONAL_ELIMINAR | MOD_INFO_PERSONAL | ELIMINAR | Eliminar registros del directorio |
| PERM_006 | DOCUMENTOS_NORMATIVOS_VER | MOD_DOC_NORMATIVOS | VER | Consultar documentos normativos |
| PERM_007 | DOCUMENTOS_NORMATIVOS_CREAR | MOD_DOC_NORMATIVOS | CREAR | Registrar documentos normativos |
| PERM_008 | DOCUMENTOS_NORMATIVOS_EDITAR | MOD_DOC_NORMATIVOS | EDITAR | Actualizar documentos normativos |
| PERM_009 | DOCUMENTOS_NORMATIVOS_PUBLICAR | MOD_DOC_NORMATIVOS | PUBLICAR | Publicar documentos normativos |
| PERM_010 | DOCUMENTOS_NORMATIVOS_ELIMINAR | MOD_DOC_NORMATIVOS | ELIMINAR | Eliminar documentos normativos |
| PERM_011 | USUARIOS_ADMINISTRAR | MOD_ACCESOS | ADMINISTRAR | Administrar usuarios |
| PERM_012 | ROLES_ADMINISTRAR | MOD_ACCESOS | ADMINISTRAR | Administrar roles |
| PERM_013 | PERMISOS_ADMINISTRAR | MOD_ACCESOS | ADMINISTRAR | Administrar permisos |
| PERM_014 | AMBITOS_ACCESO_ADMINISTRAR | MOD_ACCESOS | ADMINISTRAR | Administrar ámbitos de acceso de los usuarios |
| PERM_015 | AUDITORIA_VER | MOD_ACCESOS | VER | Consultar registros de auditoría |

Los quince permisos compartidos están activos. Se conserva la asignación exactamente como fue proporcionada: `PERM_015 AUDITORIA_VER` pertenece a `MOD_ACCESOS`, no a `MOD_AUDITORIA`. No se debe reasignar por inferencia.

### 2.6. RolPermiso

Encabezados: `rol_id, permiso_id, active`.

La matriz recibida es:

| Rol | Permisos asignados |
|---|---|
| `ROL_ADMIN` | `PERM_001` a `PERM_015` |
| `ROL_EDITOR` | `PERM_001`, `PERM_002`, `PERM_003`, `PERM_004`, `PERM_006`, `PERM_007`, `PERM_008` |
| `ROL_CONSULTA` | `PERM_001`, `PERM_006` |

Todas las relaciones compartidas están activas.

Interpretación funcional:

- **Administrador:** tiene asignados todos los permisos definidos en la tabla, pero sus permisos efectivos siguen aislados por el módulo de `UsuarioRol`.
- **Editor:** puede ver, crear, editar y cambiar el estado de Información de personal; para Documentos normativos puede ver, crear y editar. No tiene asignados eliminar ni publicar.
- **Consulta:** puede ver Información de personal y Documentos normativos.

Un rol no concede por sí solo acceso a todos los módulos: `UsuarioRol` determina en cuáles se aplica.

### 2.7. Operaciones

Encabezados: `operacion_id, nombre`.

| operacion_id | nombre |
|---|---|
| VER | Ver |
| CREAR | Crear |
| EDITAR | Editar |
| CAMBIAR_ESTADO | Cambiar estado |
| PUBLICAR | Publicar |
| ELIMINAR | Eliminar |
| ADMINISTRAR | Administrar |

`Permisos.operacion_id` referencia `Operaciones.operacion_id`.

---

## 3. Construcción de los ámbitos de acceso

### 3.1. Tipos de ámbito

Encabezados: `tipo_ambito_id, nombre, descripcion, entidad_referencia, requiere_referencia, permite_descendientes, active`.

La tabla compartida define estos cuatro tipos:

| tipo_ambito_id | nombre | entidad_referencia | requiere_referencia | permite_descendientes |
|---|---|---|---|---|
| TOTAL | Total | NINGUNA | NO | NO |
| SEDE | Sede | SEDE | SÍ | NO |
| ESTRUCTURA_ORG | Unidad orgánica | ESTRUCTURA_ORG | SÍ | SÍ |
| LOCAL | Local directamente asignado | LOCAL | SÍ | NO |

Los cuatro tipos base deben mantenerse activos y conservar exactamente esta semántica. El catálogo ya no se limita a esos cuatro identificadores: puede incluir tipos adicionales únicamente cuando declaren una entidad que SUNARP Core sabe resolver. El Gestor entrega a Core la entidad resuelta en cada ámbito y valida la configuración antes de guardar.

Reglas de interpretación admitidas:

- `NINGUNA` se reserva exclusivamente para `TOTAL`, sin referencia ni descendientes.
- `SEDE` requiere una referencia de sede y no admite descendientes.
- `ESTRUCTURA_ORG` requiere una referencia de estructura orgánica; puede permitir o no descendientes. El registro de ámbito concreta `incluir_descendientes`, y la validación impide marcarlo cuando el tipo no lo permite.
- `LOCAL` requiere una referencia de local y no admite descendientes.
- No se aceptan entidades distintas de `NINGUNA`, `SEDE`, `ESTRUCTURA_ORG` y `LOCAL`. Los nuevos tipos no incorporan nuevas formas de resolver referencias.
- Los tipos base `TOTAL`, `SEDE`, `ESTRUCTURA_ORG` y `LOCAL` no pueden desactivarse, eliminarse ni cambiar su semántica. Cualquier tipo con referencias en `AmbitosAcceso` tampoco puede desactivarse ni eliminarse.

### 3.2. AmbitoAcceso

Encabezados: `persona_id, modulo_id, tipo_ambito_id, referencia_id, incluir_descendientes, active`.

Cada fila limita el acceso de una persona dentro de un módulo. El ámbito es independiente del rol y de los permisos funcionales: se requiere tanto el permiso para realizar la operación como que el registro esté dentro del ámbito autorizado.

Reglas de referencia:

- `TOTAL`: `referencia_id` debe estar vacío y no admite descendientes. Es exclusivo dentro del módulo: no se debe combinar con ámbitos específicos en ese mismo módulo.
- `SEDE`: `referencia_id` identifica un registro de `sede`; no admite descendientes.
- `ESTRUCTURA_ORG`: `referencia_id` identifica un registro de `estructura_org`. El tipo permite descendientes; cada fila determina si los incluye mediante `incluir_descendientes`.
- `LOCAL`: `referencia_id` identifica un registro de `locales`; autoriza solo registros adscritos directamente a ese local y sin estructura orgánica. No incluye descendientes.

En todos los casos, `active` determina si la fila de ámbito se considera activa.

### 3.3. Ámbitos de los tres usuarios de ejemplo

| persona_id | modulo_id | tipo_ambito_id | referencia_id | incluir_descendientes | active |
|---|---|---|---|---|---|
| PER_117 | MOD_INFO_PERSONAL | TOTAL | vacío | NO | TRUE |
| PER_117 | MOD_ACCESOS | TOTAL | vacío | NO | TRUE |
| PER_105 | MOD_INFO_PERSONAL | ESTRUCTURA_ORG | SC_OFICINA_COMUNICACIONES | NO | TRUE |
| PER_350 | MOD_INFO_PERSONAL | SEDE | ZR_I | NO | TRUE |

Interpretación:

- `PER_117` tiene ámbito total, por separado, en Información de personal y Administración de accesos.
- `PER_105` está limitado a la unidad orgánica `SC_OFICINA_COMUNICACIONES`. Como `incluir_descendientes = NO`, no se amplía a sus unidades descendientes.
- `PER_350` está limitado a la sede `ZR_I`.

No se proporcionó en esta muestra una asignación de tipo `LOCAL` ni una fila de estructura orgánica que incluya descendientes.

---

## 4. Cadena de relaciones para resolver la autorización

La identidad y autorización se construyen siguiendo esta secuencia:

```text
personas.correo_institucional
    → personas.persona_id
        → Usuarios.persona_id + active
            → UsuarioRol.persona_id + modulo_id + rol_id
                → Modulos.modulo_id + active
                → Roles.rol_id + active
                    → RolPermiso.rol_id + permiso_id + active
                        → Permisos.permiso_id + modulo_id + active
            → AmbitoAcceso.persona_id + modulo_id + active
                → TipoAmbito.tipo_ambito_id
                    → entidad_referencia
                        → sede.id
                        → estructura_org.id
                        → locales.id
```

La implementación vigente refleja estas etapas:

1. `SUNARPCore.getCurrentUserEmail()` obtiene el correo institucional de la sesión.
2. `SUNARPCore.resolveIdentity()` busca ese correo en `DIRECTORY.personas`, usando `correo_institucional` como campo de correo y `persona_id` como identificador. Se exige exactamente una coincidencia.
3. Con `persona_id`, el Gestor busca una cuenta activa en `Usuarios`.
4. Carga las asignaciones activas de `UsuarioRol` y los ámbitos activos de la persona.
5. A partir de los roles asociados, carga los roles activos, sus relaciones activas en `RolPermiso` y los permisos activos correspondientes.
6. Carga el catálogo de módulos.
7. `SUNARPCore.resolveAuthorizationContext()` compone el contexto efectivo por módulo.

### 4.1. Reglas de resolución que no deben perderse

- Una persona necesita una cuenta activa en `Usuarios` para autenticarse.
- Una asignación `UsuarioRol` inactiva no concede acceso.
- Un módulo o rol inexistente/inactivo no concede acceso.
- Solo se consideran permisos y relaciones `RolPermiso` activos.
- El permiso debe pertenecer al mismo `modulo_id` de la asignación persona-rol. La coincidencia de código o de rol no permite cruzar permisos entre módulos.
- Los ámbitos se consideran únicamente cuando la persona tiene una asignación activa de rol en ese mismo módulo.
- Más de un rol activo para la misma persona y módulo es inconsistente.
- Más de una cuenta activa para la misma persona es inconsistente.
- Los indicadores de estado de los datos usan `TRUE/FALSE`; no se deben sustituir por etiquetas como `ACTIVO/INACTIVO`.

### 4.2. Evaluación de registros frente a un ámbito

El Core evalúa el ámbito con los catálogos de estructuras y locales:

- **TOTAL:** autoriza todos los registros del módulo solo si es el único ámbito activo de ese módulo y no tiene referencia. Una combinación de TOTAL con ámbitos específicos se considera inconsistente y no amplía acceso.
- **SEDE:** compara la sede de la asignación resuelta con `referencia_id`.
- **ESTRUCTURA_ORG:** autoriza el nodo exacto referenciado. Si `incluir_descendientes` es verdadero, también recorre `estructura_org.parent_id` hacia los ancestros para determinar si el registro pertenece al subárbol.
- **LOCAL:** autoriza únicamente cuando el registro tiene ese `local_id` y no tiene estructura orgánica.

Para resolver la estructura y ubicación de una asignación de Información de personal se debe conservar la distinción ya documentada en **Modelo de datos y filtros jerárquicos de Información de personal**:

- `estructura_org.parent_id` define la jerarquía orgánica.
- `estructura_local` relaciona `estructura_org` con `locales`; no define la jerarquía orgánica.
- `locales.parent_id` describe relaciones entre locales; no reemplaza `estructura_org.parent_id`.
- Si una asignación declara estructura y local, ambos deben ser compatibles. El Core rechaza la asignación cuando la sede de la estructura y la del local no coinciden.

---

## 5. Dependencias e invalidación de la caché del contexto de autorización

La construcción del contexto en `_accessGetAuthContext_()` utiliza una clave por correo institucional normalizado:

`access-auth-context:v1:<correo-institucional>`

El tiempo de vida configurado es de **3600 segundos**. Las ocho fuentes declaradas como dependencias de este contexto son:

1. `DIRECTORY.personas`
2. `SECURITY.Usuarios`
3. `SECURITY.Modulos`
4. `SECURITY.Roles`
5. `SECURITY.UsuarioRol`
6. `SECURITY.Permisos`
7. `SECURITY.RolPermiso`
8. `SECURITY.AmbitosAcceso` (nombre literal configurado actualmente en código)
9. `SECURITY.TiposAmbito` (dependencia de la semántica de ámbitos cacheada en el contexto)

Por tanto, un cambio en cualquiera de esas fuentes debe afectar la validez del contexto cacheado según el mecanismo de dependencias de SUNARP Core.

El constructor normal no carga `Operaciones`. Carga `TiposAmbito` solo cuando la persona tiene ámbitos activos, para añadir a cada ámbito la entidad de referencia que el Core debe interpretar. La generación de `TiposAmbito` forma parte de las dependencias del contexto: cambiar su semántica invalida el contexto cacheado. No se cargan las nueve tablas de seguridad completas en cada autenticación.

En un análisis de tiempos, `cacheLookupMs` puede incluir el constructor completo cuando hay un miss; no debe interpretarse como tiempo puro de consulta de caché. El log `Authorization data stages` desglosa las lecturas de usuarios, asignaciones, ámbitos, roles, relaciones rol-permiso, permisos y módulos.

---

## 6. Código fuente que implementa el modelo

La documentación de datos debe contrastarse con estos archivos de la rama, sin reconstruir el modelo desde cero:

| Archivo | Responsabilidad |
|---|---|
| `Backend/Gestor de intranet SUNARP/AccessManagementService.js` | Nombres de pestañas, resolución de identidad, carga de datos de autorización, validaciones, construcción y caché del contexto |
| `Backend/SUNARP Core/CoreAuthorization.js` | Resolución de roles, permisos y ámbitos efectivos por módulo; validación de registros contra ámbitos |
| `Backend/Gestor de intranet SUNARP/AppConfig.js` | Libros de datos, claves de fuentes y dependencias entre catálogos maestros y sus réplicas |
| `Documentacion/Modelo de datos y filtros jerarquicos de Informacion de personal.md` | Modelo de personas, asignaciones, estructura orgánica, ubicación física y filtro jerárquico |

Funciones principales para seguir el recorrido:

- `_accessGetAuthContext_()`
- `_accessBuildAuthContext_()`
- `_accessLoadAuthorizationData_()`
- `SUNARPCore.resolveIdentity()`
- `SUNARPCore.resolveAuthorizationContext()`
- `SUNARPCore.authorizationIsRecordInScope()`
- `SUNARPCore.authorizationFilterRecordsByScope()`

---

## 7. Límites de la muestra compartida

La muestra contiene tres personas, tres roles, cuatro módulos, quince permisos y ejemplos de ámbitos para los módulos de Información de personal y Administración de accesos. No debe tratarse como un inventario exhaustivo de todos los usuarios o ámbitos existentes en producción.

No se compartieron filas de `Auditoria`, permisos adicionales para `MOD_AUDITORIA`, ámbitos de tipo `LOCAL` ni ejemplos con `incluir_descendientes = SÍ`. No completar esos datos por suposición.

La estructura de permisos que debe preservarse es la recibida en las tablas de este documento. Cualquier propuesta de cambio funcional debe distinguir claramente entre:
1. dato que existe en las hojas compartidas;
2. regla que implementa el código;
3. validación o cambio nuevo que se propone.

---

## 8. Instrucción de continuidad para futuros chats

Antes de preguntar por la construcción de permisos, ámbitos o fuentes de datos:

1. Leer este documento.
2. Leer `Documentacion/Modelo de datos y filtros jerarquicos de Informacion de personal.md`.
3. Revisar en la rama activa los cuatro archivos indicados en la sección 6.
4. Usar como conjunto exacto de pestañas de Directorios telefónicos: `personas`, `sede`, `locales`, `estructura_org`, `estructura_local` y `cargos`.
5. No volver a solicitar la explicación de las tablas de permisos ni la procedencia de `Sedes` y `EstructuraOrg` descrita aquí.
6. Preguntar solo por un dato nuevo, concreto y necesario que no esté documentado. No volver a pedir archivos completos cuando baste con consultar el código o el documento existente.

### Prompt de continuidad

> Continúa el proyecto SUNARP-Proyectos desde la rama `feat/directorio-personas-datos-asignaciones`. Antes de analizar o preguntar, lee `Documentacion/Modelo de permisos y ámbitos de acceso.md` y `Documentacion/Modelo de datos y filtros jerarquicos de Informacion de personal.md`, y revisa el código vigente citado en esos documentos. Ya está documentada la construcción de permisos, roles, módulos, ámbitos, la relación con `personas), y la procedencia desde Global parameters de `Sedes` y `EstructuraOrg`. Para Directorios telefónicos, las pestañas requeridas son exactamente `personas`, `sede`, `locales`, `estructura_org`, `estructura_local` y `cargos`. No repitas esas preguntas ni reinicies el análisis. Continúa desde el estado real de Git y distingue los datos existentes de las reglas del código y de cualquier propuesta nueva.
