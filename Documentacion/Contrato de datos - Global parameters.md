# Contrato de datos y mantenimiento — Global parameters

**Documento de continuidad del proyecto Gestor de intranet SUNARP**  
**Fecha de consolidación:** 27 de noviembre de 2026  
**Repositorio:** \`vinoquito/SUNARP-Proyectos\`  
**Rama de trabajo:** \`feat/directorio-personas-datos-asignaciones\`

Este documento consolida el diccionario de datos proporcionado por el usuario y las decisiones que deben respetarse al construir los módulos de mantenimiento. Debe leerse antes de cambiar fuentes, nombres de pestañas, encabezados, relaciones o validaciones. Su objetivo es que la continuidad entre chats no dependa de volver a solicitar o reconstruir esta información.

---

## 1. Regla principal de persistencia

Todos los catálogos y entidades que correspondan a los **mantenimientos funcionales** se administran en el libro de Google Sheets **Global parameters**.

En el repositorio, la fuente se identifica como:

- Clave lógica: \`MASTER_DATA\`.
- Etiqueta: \`Global parameters\`.
- Configuración: \`Backend/Gestor de intranet SUNARP/AppConfig.js\`.

**No crear otro Spreadsheet, pestañas nuevas, copias maestras, tablas paralelas ni encabezados alternativos.** Los nombres físicos escritos en este documento son los nombres de pestaña que deben utilizar los servicios. Los encabezados son contratos exactos: respetar singular/plural, guiones bajos y nombres como \`nombre\` frente a \`name\`.

Las fuentes \`DIRECTORY\` y \`SECURITY\` que aparecen en el código actual tienen otra responsabilidad:

- \`DIRECTORY\`: libro operativo del Directorio telefónico. Algunas pestañas consumidoras son réplicas de catálogos maestros y se relacionan con \`MASTER_DATA\` mediante \`INTRANET_SOURCE_DEPENDENCIES\`. Los mantenimientos nuevos deben escribir en \`MASTER_DATA\`, no en esas réplicas.
- \`SECURITY\`: libro del sistema de seguridad. Contiene usuarios, módulos, roles, permisos, ámbitos y auditoría. No es un catálogo funcional de mantenimiento y no debe trasladarse a \`Global parameters\` por el hecho de que sus tablas se hayan compartido como referencia.

Las relaciones derivadas o asociativas no se convierten automáticamente en CRUD independientes. Se administran desde el formulario o contexto de la entidad propietaria, conforme al contrato funcional del proyecto.

## 2. Organización funcional y pestañas maestras

El menú acordado contiene una sola categoría **Módulos de mantenimiento**, con cinco grupos. La relación entre grupo, mantenimiento y pestaña maestra es:

| Grupo del menú | Mantenimiento | Pestaña exacta en Global parameters |
|---|---|---|
| Ubicación geográfica | Departamentos | \`departamento\` |
| Ubicación geográfica | Provincias | \`provincia\` |
| Ubicación geográfica | Distritos | \`distrito\` |
| Sedes y locales | Sedes | \`sede\` |
| Sedes y locales | Tipos de local | \`tipos_local\` |
| Sedes y locales | Locales | \`locales\` |
| Organización institucional | Tipos de estructura | \`tipos_estructura\` |
| Organización institucional | Estructura orgánica | \`estructura_org\` |
| Datos de personal | Cargos | \`cargos\` |
| Datos de personal | Condiciones de cargo | \`condicion_cargo\` |
| Datos de personal | Tipos de documento de identidad | \`tipo_documento_identidad\` |
| Directorio telefónico | Tipos de teléfono | \`tipo_telefono\` |
| Directorio telefónico | Teléfonos | **No se proporcionó todavía el contrato de una pestaña maestra independiente \`telefonos\`. No crearla ni inferir sus columnas.** |

La agrupación del menú no cambia los nombres de las pestañas. Cada grupo abre una pantalla con pestañas internas. Cada pestaña de mantenimiento tendrá su propia tabla, búsqueda, formulario y operaciones permitidas.

### Relaciones que no son pestañas CRUD independientes

- \`estructura_local\`: relación entre \`estructura_org\` y \`locales\`; se gestiona desde el contexto de estructura orgánica o del local.
- \`telefonos_ubicaciones\`: relación de ubicación de teléfonos; se gestiona desde el formulario del elemento institucional correspondiente, no como mantenimiento independiente.
- \`anexos_ambientes\`: relación que se integra en el contexto de administración de ambientes y anexos, no como pestaña independiente.
- No crear CRUD independiente para ninguna de estas relaciones.

La existencia y columnas de \`telefonos_ubicaciones\` y \`anexos_ambientes\` no se detallaron en el inventario aportado; deben leerse del modelo/hojas existentes cuando se implemente su contexto, sin inventar encabezados.

---

## 3. Diccionario de Global parameters

### 3.1. Sedes y locales

#### Pestaña \`sede\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador de sede | Clave; conservar el valor existente |
| \`name\` | Nombre visible de la sede | Texto |

Extracto proporcionado:

| id | name |
|---|---|
| SEDE_CENTRAL | Sede Central |
| ZR_I | Zona Registral n.° I |

No existe columna \`active\` en el contrato suministrado. No agregarla ni ofrecer un cambio de estado para esta pestaña.

#### Pestaña \`tipos_local\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador del tipo de local | Clave |
| \`name\` | Nombre del tipo | Texto |
| \`active\` | Estado | Booleano \`TRUE/FALSE\` |

Extracto proporcionado:

| id | name | active |
|---|---|---|
| EDIFICIO_ADMINISTRATIVO | Edificio administrativo | TRUE |
| SEDE_ZONAL | Sede zonal | TRUE |
| OFICINA_REGISTRAL | Oficina Registral | TRUE |

#### Pestaña \`locales\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador del local | Clave |
| \`sede_id\` | Sede propietaria | Referencia a \`sede.id\` |
| \`tipo_local_id\` | Tipo del local | Referencia a \`tipos_local.id\` |
| \`name\` | Nombre visible | Texto |
| \`parent_id\` | Local padre | Referencia opcional a \`locales.id\`; jerarquía autorreferenciada |
| \`order\` | Orden | Número entero para ordenar hermanos |
| \`active\` | Estado | Booleano \`TRUE/FALSE\` |

Extracto proporcionado:

| id | sede_id | tipo_local_id | name | parent_id | order | active |
|---|---|---|---|---|---:|---|
| SC_PRIMAVERA | SEDE_CENTRAL | EDIFICIO_ADMINISTRATIVO | Edificio administrativo Primavera |  |  | TRUE |
| SC_PARDO | SEDE_CENTRAL | EDIFICIO_ADMINISTRATIVO | Edificio administrativo Pardo |  |  | TRUE |
| ZR_I_PIURA | ZR_I | SEDE_ZONAL | Oficina Registral de Piura - Sede Principal |  |  | TRUE |
| ZR_I_SULLANA | ZR_I | OFICINA_REGISTRAL | Oficina Registral Sullana |  |  | TRUE |
| ZR_I_TUMBES | ZR_I | OFICINA_REGISTRAL | Oficina Registral Tumbes |  |  | TRUE |
| ZR_I_TALARA | ZR_I | OFICINA_REGISTRAL | Oficina Registral Talara |  |  | TRUE |
| ZR_I_CHULUCANAS | ZR_I | OFICINA_RECEPTORA | Oficina Receptora Chulucanas |  |  | TRUE |
| ZR_I_SECHURA | ZR_I | OFICINA_RECEPTORA | Oficina Receptora Sechura |  |  | TRUE |

Reglas para futuros formularios:

- Mantener la relación de cada local con una sede.
- Validar \`tipo_local_id\` contra el catálogo real de tipos.
- Validar \`parent_id\` contra un local de la misma sede y prevenir ciclos.
- \`order\` pertenece al orden de los hermanos con la misma \`sede_id\` y \`parent_id\`. No convertirlo en un correlativo global.
- Los extractos muestran \`parent_id\` y \`order\` vacíos. No inventar valores por defecto. La lógica ya existente del Directorio conserva el orden recibido cuando no todos los locales tienen \`order\` configurado.
- La muestra de \`locales\` utiliza \`OFICINA_RECEPTORA\`, pero ese identificador no aparece en el extracto de \`tipos_local\`. Los extractos pueden ser parciales: inspeccionar el catálogo completo antes de declarar huérfana esa relación o bloquear datos existentes.

### 3.2. Organización institucional

#### Pestaña \`tipos_estructura\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador del tipo de estructura | Clave |
| \`name\` | Nombre visible | Texto |
| \`active\` | Estado | Booleano \`TRUE/FALSE\` |

Extracto proporcionado:

| id | name | active |
|---|---|---|
| SUPERINTENDENCIA | Superintendencia | TRUE |
| ORGANO | Órgano | TRUE |
| GERENCIA | Gerencia | TRUE |
| DIRECCION | Dirección | TRUE |
| SUBDIRECCION | Subdirección | TRUE |
| OFICINA | Oficina | TRUE |

#### Pestaña \`estructura_org\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador de la unidad/estructura | Clave |
| \`sede_id\` | Sede a la que pertenece | Referencia a \`sede.id\` |
| \`parent_id\` | Estructura padre | Referencia opcional a \`estructura_org.id\` |
| \`tipo_estructura_id\` | Tipo de estructura | Referencia a \`tipos_estructura.id\` |
| \`name\` | Nombre visible | Texto |
| \`order\` | Orden jerárquico | Número |
| \`active\` | Estado | Booleano \`TRUE/FALSE\` |

Extracto proporcionado:

| id | sede_id | parent_id | tipo_estructura_id | name | order | active |
|---|---|---|---|---|---:|---|
| SC_SUPERINTENDENCIA_NACIONAL | SEDE_CENTRAL |  | SUPERINTENDENCIA | Superintendencia Nacional | 1 | TRUE |
| SC_SUPERINTENDENCIA_ADJUNTA | SEDE_CENTRAL |  | SUPERINTENDENCIA | Superintendencia Adjunta | 2 | TRUE |
| SC_GERENCIA_GENERAL | SEDE_CENTRAL |  | GERENCIA | Gerencia General | 3 | TRUE |
| SC_UF_INTEGRIDAD | SEDE_CENTRAL | SC_GERENCIA_GENERAL | UNIDAD_FUNCIONAL | Unidad Funcional de Integridad Institucional | 4 | TRUE |
| SC_UF_GESTION_DOCUMENTAL | SEDE_CENTRAL | SC_GERENCIA_GENERAL | UNIDAD_FUNCIONAL | Unidad Funcional de Gestión Documental y Atención a la Ciudadanía | 5 | TRUE |
| SC_TRAMITE_DOCUMENTARIO | SEDE_CENTRAL | SC_UF_GESTION_DOCUMENTAL | SERVICIO | Trámite Documentario | 6 | TRUE |
| SC_ARCHIVO_CENTRAL | SEDE_CENTRAL | SC_UF_GESTION_DOCUMENTAL | ARCHIVO | Archivo Central | 7 | TRUE |
| SC_DIRECCION_TECNICA_REGISTRAL | SEDE_CENTRAL |  | DIRECCION | Dirección Técnica Registral | 8 | TRUE |

Reglas para futuros formularios:

- \`parent_id\` define la jerarquía organizacional y puede estar vacío en nodos raíz.
- La sede de un hijo debe ser coherente con la de su padre.
- \`order\` conserva la jerarquía/orden institucional. No renumerar automáticamente toda una sede ni sustituirlo por un contador global.
- El catálogo compartido es el de tipos reales en \`tipos_estructura\`; no inventar identificadores de tipos.
- En el extracto de \`estructura_org\` aparecen \`UNIDAD_FUNCIONAL\`, \`SERVICIO\` y \`ARCHIVO\`, que no figuran en el extracto de \`tipos_estructura\`. No asumir que están ausentes de la hoja completa ni insertar tipos automáticamente. Revisar la hoja completa antes de imponer validación de referencia.

#### Pestaña relacional \`estructura_local\` (no CRUD independiente)

| Columna | Significado |
|---|---|
| \`id\` | Identificador de la relación |
| \`estructura_id\` | Referencia a \`estructura_org.id\` |
| \`local_id\` | Referencia a \`locales.id\` |
| \`referencia\` | Texto complementario de ubicación (por ejemplo, piso) |
| \`active\` | Booleano \`TRUE/FALSE\` |

Extracto proporcionado:

| id | estructura_id | local_id | referencia | active |
|---|---|---|---|---|
| EL_SC_SUPERINTENDENCIA_NACIONAL | SC_SUPERINTENDENCIA_NACIONAL | SC_PRIMAVERA | 5.° piso | TRUE |
| EL_SC_SUPERINTENDENCIA_ADJUNTA | SC_SUPERINTENDENCIA_ADJUNTA | SC_PRIMAVERA | 5.° piso | TRUE |
| EL_SC_GERENCIA_GENERAL | SC_GERENCIA_GENERAL | SC_PRIMAVERA | 5.° piso | TRUE |
| EL_SC_UF_INTEGRIDAD | SC_UF_INTEGRIDAD | SC_PRIMAVERA | 5.° piso | TRUE |
| EL_SC_UF_GESTION_DOCUMENTAL | SC_UF_GESTION_DOCUMENTAL | SC_PRIMAVERA | 5.° piso | TRUE |
| EL_SC_TRAMITE_5 | SC_TRAMITE_DOCUMENTARIO | SC_PRIMAVERA | 5.° piso | TRUE |
| EL_SC_TRAMITE_1 | SC_TRAMITE_DOCUMENTARIO | SC_PRIMAVERA | 1.° piso | TRUE |
| EL_SC_ARCHIVO_CENTRAL | SC_ARCHIVO_CENTRAL | SC_PRIMAVERA | 1.° piso | TRUE |
| EL_SC_DTR_PRIMAVERA | SC_DIRECCION_TECNICA_REGISTRAL | SC_PRIMAVERA | 4.° piso | TRUE |
| EL_SC_DTR_PARDO | SC_DIRECCION_TECNICA_REGISTRAL | SC_PARDO |  | TRUE |
| EL_SC_FORMACION_REGISTRAL | SC_SUBDIR_FORMACION_REGISTRAL | SC_PRIMAVERA | 4.° piso | TRUE |
| EL_SC_OAJ | SC_OFICINA_ASESORIA_JURIDICA | SC_PRIMAVERA | 2.° piso | TRUE |

La tabla es una relación, no una entidad de mantenimiento separada. Una estructura puede relacionarse con ubicaciones distintas y la columna \`referencia\` describe su ubicación física. El extracto contiene \`estructura_id\` que no aparecen en el extracto parcial de \`estructura_org\`; consultar la hoja completa y no borrar ni corregir esas referencias automáticamente.

#### Convención de identificadores para nuevos registros

Los identificadores existentes son claves maestras y no se recalculan ni modifican al editar. Para **nuevos** registros, el formulario propone un identificador derivado del nombre y, cuando corresponde, de su sede y tipo; el backend vuelve a calcularlo y valida colisiones antes de insertar:

- Sedes: `Sede Central` genera `SEDE_CENTRAL`; `Zona Registral n.° I` genera `ZR_I`; otras sedes usan `SEDE_<NOMBRE_NORMALIZADO>`.
- Tipos de local y tipos de estructura: nombre normalizado en mayúsculas, sin tildes y con separadores como guiones bajos.
- Locales: prefijo `SC` para `SEDE_CENTRAL` o el código de la sede (por ejemplo, `ZR_I`), seguido del nombre normalizado del local. Se omite el prefijo descriptivo del tipo cuando está presente en el nombre y los sufijos convencionales `Sede principal` o `Sede Central`.
- Estructura orgánica: prefijo de sede seguido del nombre normalizado; el comienzo `Unidad Funcional de` se abrevia como `UF_`.
- Si el identificador propuesto ya existe, se agrega un sufijo numérico (`_2`, `_3`, etc.) para obtener una clave única.

Esta convención solo propone claves para altas nuevas. No modifica los códigos actuales, no renombra registros existentes y no crea tipos o referencias faltantes.

### 3.3. Datos de personal

#### Pestaña \`cargos\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador del cargo | Clave |
| \`name\` | Nombre del cargo | Texto |
| \`active\` | Estado | Booleano \`TRUE/FALSE\` |

Extracto proporcionado:

| id | name | active |
|---|---|---|
| CARGO_SUPERINTENDENTE_NACIONAL | Superintendente nacional | TRUE |
| CARGO_ASISTENTE_DESPACHO | Asistente de despacho | TRUE |
| CARGO_ASISTENTE_OFICINA | Asistente de oficina | TRUE |
| CARGO_ASESOR | Asesor | TRUE |
| CARGO_COORDINADOR_GESTION | Coordinador en gestión | TRUE |
| CARGO_COORDINADOR_DEFENSA_NACIONAL | Coordinador de defensa nacional | TRUE |
| CARGO_MENSAJERO | Mensajero | TRUE |
| CARGO_SUPERINTENDENTE_ADJUNTO | Superintendente Adjunto | TRUE |
| CARGO_GERENTE_GENERAL | Gerente General | TRUE |
| CARGO_ESPECIALISTA_LEGAL_GESTION_PUBLICA | Especialista legal en gestión pública | TRUE |

#### Pestaña \`condicion_cargo\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador de condición | Clave |
| \`name\` | Nombre visible | Texto |
| \`active\` | Estado | Booleano \`TRUE/FALSE\` |

Valores proporcionados:

| id | name | active |
|---|---|---|
| CONDICION_TITULAR | Titular | TRUE |
| CONDICION_ENCARGADO | Encargado | TRUE |
| CONDICION_SUPLENTE | Suplente | TRUE |

**Semántica funcional:** Titular, Encargado y Suplente describen la condición bajo la cual una persona ocupa un cargo en una asignación. No clasifican el cargo. El catálogo se utiliza desde el formulario de asignaciones de personal.

#### Pestaña \`tipo_documento_identidad\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador del tipo de documento | Clave |
| \`name\` | Nombre visible | Texto |

Valores proporcionados:

| id | name |
|---|---|
| TD_001 | DNI |
| TD_002 | Carné de extranjería |
| TD_003 | Pasaporte |
| TD_004 | Carné de Permiso Temporal de Permanencia (CPP) |
| TD_005 | Carné Temporal Migratorio |

No existe columna \`active\` en el contrato suministrado. No agregarla ni ofrecer cambio de estado sin modificación expresa del modelo.

### 3.4. Directorio telefónico

#### Pestaña \`tipo_telefono\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Identificador del tipo | Clave |
| \`nombre\` | Nombre visible | Texto; el encabezado es \`nombre\`, no \`name\` |
| \`active\` | Estado | Booleano \`TRUE/FALSE\` |

Valores proporcionados:

| id | nombre | active |
|---|---|---|
| CENTRAL_TELEFONICA | Central telefónica | TRUE |
| DIRECTO | Teléfono directo | TRUE |
| MOVIL | Teléfono móvil | TRUE |

El requerimiento de navegación también incluye mantenimiento de **Teléfonos**, pero no se proporcionó el nombre exacto de su pestaña maestra ni sus columnas/filas. No suponer que existe una pestaña \`telefonos\` ni crearla. Antes de implementar ese CRUD, localizar el contrato físico existente en el libro y mantener \`telefonos_ubicaciones\` como relación contextual.

### 3.5. Ubicación geográfica (nombres singulares)

Las pestañas maestras confirmadas son **\`departamento\`, \`provincia\` y \`distrito\`**, en singular.

#### Pestaña \`departamento\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Código UBIGEO de departamento | Dos dígitos; conservar ceros iniciales |
| \`name\` | Nombre | Texto |

Extracto proporcionado:

| id | name |
|---|---|
| 01 | Amazonas |
| 02 | Áncash |
| 03 | Apurímac |
| 04 | Arequipa |
| 05 | Ayacucho |
| 06 | Cajamarca |
| 07 | Callao |
| 08 | Cusco |

#### Pestaña \`provincia\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Código UBIGEO de provincia | Cuatro dígitos; los dos primeros corresponden al departamento |
| \`name\` | Nombre | Texto |
| \`id_departamento\` | Departamento padre inmediato | Referencia obligatoria a \`departamento.id\` |

Extracto proporcionado:

| id | name | id_departamento |
|---|---|---|
| 0101 | Chachapoyas | 01 |
| 0102 | Bagua | 01 |
| 0103 | Bongará | 01 |
| 0104 | Condorcanqui | 01 |
| 0105 | Luya | 01 |
| 0106 | Rodríguez de Mendoza | 01 |
| 0107 | Utcubamba | 01 |
| 0201 | Huaraz | 02 |

#### Pestaña \`distrito\`

| Columna | Significado | Regla conocida |
|---|---|---|
| \`id\` | Código UBIGEO de distrito | Seis dígitos; los cuatro primeros corresponden a la provincia |
| \`name\` | Nombre | Texto |
| \`id_provincia\` | Provincia padre inmediata | Referencia obligatoria a \`provincia.id\` |

Extracto proporcionado:

| id | name | id_provincia |
|---|---|---|
| 010101 | Chachapoyas | 0101 |
| 010102 | Asunción | 0101 |
| 010103 | Balsas | 0101 |
| 010104 | Cheto | 0101 |
| 010105 | Chiliquin | 0101 |
| 010106 | Chuquibamba | 0101 |
| 010107 | Granada | 0101 |
| 010108 | Huancas | 0101 |
| 010109 | La Jalca | 0101 |
| 010110 | Leimebamba | 0101 |

Reglas obligatorias:

1. La jerarquía es \`departamento → provincia → distrito\`.
2. Una provincia solo tiene como padre inmediato \`id_departamento\`.
3. Un distrito solo tiene como padre inmediato \`id_provincia\`; no incorporar \`id_departamento\` a la pestaña \`distrito\`.
4. Verificar padre existente y referencias antes de registrar.
5. El código provincial debe tener cuatro dígitos y comenzar por \`id_departamento\`.
6. El código distrital debe tener seis dígitos y comenzar por \`id_provincia\`.
7. Los códigos UBIGEO son identificadores oficiales. El sistema no debe inventarlos ni asignarlos secuencialmente a partir del máximo actual. El formulario debe solicitar el código oficial, validarlo y conservarlo como texto para no perder ceros iniciales.
8. Los códigos no se modifican en edición. Si cambia la relación territorial, se trata de otra entidad/código y requiere una operación explícita, no una actualización silenciosa.
9. No hay columna \`active\` en estas tres pestañas. La eliminación es física solo cuando se demuestre que no deja referencias. No ofrecer desactivación ni agregar una columna.
10. Proteger la eliminación de padres con hijos. La eliminación de distritos requiere además comprobar las referencias operativas de Agentes SUNARP.

---

## 4. Tablas de seguridad compartidas como referencia

El usuario también proporcionó extractos de seguridad. El código actual del Gestor declara la fuente \`SECURITY\`, separada de \`MASTER_DATA\`, y usa las pestañas físicas \`Roles\`, \`Modulos\`, \`Operaciones\`, \`TiposAmbito\`, entre otras. No trasladar estas tablas al libro Global parameters ni mezclar su mantenimiento con los catálogos funcionales.

### Roles

Encabezados lógicos proporcionados:

\`rol_id, nombre, descripcion, active\`

| rol_id | nombre | descripcion | active |
|---|---|---|---|
| ROL_ADMIN | Administrador | Administración de los módulos y accesos según los permisos y ámbitos asignados | TRUE |
| ROL_EDITOR | Editor | Registro y actualización de información en los módulos y ámbitos autorizados | TRUE |
| ROL_CONSULTA | Consulta | Consulta de información en los módulos y ámbitos autorizados | TRUE |

### Módulos

Encabezados lógicos proporcionados:

\`modulo_id, codigo, nombre, descripcion, active\`

| modulo_id | codigo | nombre | descripcion | active |
|---|---|---|---|---|
| MOD_INFO_PERSONAL | INFORMACION_PERSONAL | Información de personal |  | TRUE |
| MOD_DOC_NORMATIVOS | DOCUMENTOS_NORMATIVOS | Documentos normativos |  | TRUE |
| MOD_ACCESOS | ACCESOS | Administración de accesos |  | TRUE |
| MOD_AUDITORIA | AUDITORIA | Auditoría |  | TRUE |

### Tipos de ámbitos

Encabezados lógicos proporcionados:

\`tipo_ambito_id, nombre, descripcion, entidad_referencia, requiere_referencia, permite_descendientes, active\`

| tipo_ambito_id | nombre | entidad_referencia | requiere_referencia | permite_descendientes | active |
|---|---|---|---|---|---|
| TOTAL | Total | NINGUNA | NO | NO | TRUE |
| SEDE | Sede | SEDE | SÍ | NO | TRUE |
| ESTRUCTURA_ORG | Unidad orgánica | ESTRUCTURA_ORG | SÍ | SÍ | TRUE |
| LOCAL | Local directamente asignado | LOCAL | SÍ | NO | TRUE |

### Operaciones

Encabezados lógicos proporcionados:

\`operacion_id, nombre\`

| operacion_id | nombre |
|---|---|
| VER | Ver |
| CREAR | Crear |
| EDITAR | Editar |
| CAMBIAR_ESTADO | Cambiar estado |
| PUBLICAR | Publicar |
| ELIMINAR | Eliminar |
| ADMINISTRAR | Administrar |

El Gestor mantiene además las hojas de seguridad de usuarios, relaciones persona-rol, permisos, relaciones rol-permiso, ámbitos asignados y auditoría. Usar el esquema existente de Administración de accesos; no crear un segundo mecanismo de seguridad.

El módulo \`MANTENIMIENTOS\` y sus permisos de módulo pertenecen a \`SECURITY\`. La función de provisión incorporada al Gestor solo agrega allí el módulo/permisos/relaciones de rol que falten; no crea pestañas en Global parameters ni asigna usuarios/ámbitos automáticamente. La provisión no debe ejecutarse sin autorización explícita de un administrador.

---

## 5. Semántica transversal de columnas

- \`id\`: identificador de la entidad. No asumir que todas las tablas usan el mismo formato. Ejemplos: claves textuales institucionales (\`SEDE_CENTRAL\`, \`SC_PRIMAVERA\`), códigos de catálogo (\`CARGO_ASESOR\`) y códigos UBIGEO (\`01\`, \`0101\`, \`010101\`).
- \`name\`: encabezado que usan la mayoría de catálogos maestros.
- \`nombre\`: encabezado real de \`tipo_telefono\`; no cambiarlo a \`name\`.
- \`active\`: solo existe en las pestañas donde se ha listado. Su valor es booleano \`TRUE/FALSE\`; no sustituirlo por etiquetas \`ACTIVO/INACTIVO\`.
- \`order\`: dato de orden, cuando está definido. Respetar la jerarquía de padres/hermanos; no renumerar de manera global ni tratarlo como un simple consecutivo universal.
- \`parent_id\`: relación autorreferenciada en \`locales\` y \`estructura_org\`; permitir vacío en raíces, comprobar padre, misma sede y ausencia de ciclos.
- Encabezados, pestañas y nombres de campos son contrato. No normalizar el nombre físico del encabezado al crear una columna nueva.

Los extractos incluidos son muestras proporcionadas, no afirmación de que las pestañas estén completas. Antes de bloquear un mantenimiento por una referencia no encontrada, leer la fuente completa y diferenciar un registro realmente huérfano de un extracto parcial.

---

## 6. Consumo por aplicaciones existentes

### Directorio telefónico del Gestor

El libro operativo \`DIRECTORY\` contiene datos transaccionales como personas, asignaciones y datos personales, además de pestañas consumidoras de algunos catálogos. \`INTRANET_SOURCE_DEPENDENCIES\` define relaciones de maestro a réplica para:

- \`sede\`
- \`tipos_local\`
- \`locales\`
- \`tipos_estructura\`
- \`estructura_org\`
- \`estructura_local\`
- \`cargos\`
- \`tipo_documento_identidad\`
- \`condicion_cargo\`

Las dos últimas dependencias se incorporan para mantener coherencia de generación/caché con el maestro. Los CRUD de mantenimiento escriben únicamente en \`MASTER_DATA\`. Los módulos consumidores conservan sus contratos de lectura existentes hasta que una migración explícita y validada cambie ese diseño.

### Agentes SUNARP

El código actual de Agentes SUNARP usa \`SpreadsheetApp.getActiveSpreadsheet()\` y declara hojas auxiliares locales con nombres plurales:

- \`sede\`
- \`departamentos\`
- \`provincias\`
- \`distritos\`

La resolución interna usa \`distritos.id\`, \`distritos.id_provincia\`, \`provincias.id\`, \`provincias.id_departamento\` y \`departamentos.id\`.

Esto **no cambia** los nombres de pestañas canónicos de Global parameters, que son singulares. Tampoco demuestra por sí mismo que las pestañas plurales del Spreadsheet activo de Agentes sean el mismo libro o réplicas vinculadas por fórmula. No renombrarlas ni suponer la vinculación. Antes de habilitar eliminaciones de distritos o afirmar sincronización inmediata desde Global parameters, verificar el vínculo real de esas pestañas consumidoras. La firma del consumidor se amplió para detectar cambios en las hojas que el proyecto de Agentes observa; no sustituye la verificación de su vínculo con el maestro.

Agentes SUNARP no es parte de \`estructura_org\`, \`estructura_local\`, sedes ni locales institucionales por el solo hecho de consumir ubicación geográfica.

---

## 7. Estado de la implementación geográfica en el Gestor

La primera implementación incorporada al repositorio cubrió la estructura de navegación y el CRUD geográfico, pero se detectó una discrepancia en los nombres de pestaña: la primera versión apuntaba a \`departamentos\`, \`provincias\` y \`distritos\`. Ese supuesto era incorrecto para Global parameters.

La corrección vigente debe usar:

| Entidad interna del servicio | Pestaña maestra real |
|---|---|
| \`departments\` | \`departamento\` |
| \`provinces\` | \`provincia\` |
| \`districts\` | \`distrito\` |

El contrato de CRUD geográfico es:

- Lectura: una consulta de los tres catálogos maestros, con validación de encabezados y relaciones.
- Crear departamento: solicitar código UBIGEO de 2 dígitos y nombre.
- Crear provincia: solicitar código de 4 dígitos, nombre y departamento.
- Crear distrito: solicitar código de 6 dígitos, nombre y provincia. El selector muestra provincia y departamento para identificarla, pero la relación persistida es solamente \`id_provincia\`.
- Editar: conservar el identificador y el padre; modificar nombre.
- Eliminar departamento: impedir si existen provincias.
- Eliminar provincia: impedir si existen distritos.
- Eliminar distrito: permanece protegida hasta comprobar las referencias del consumidor Agentes SUNARP.
- No hay columna de estado en los tres catálogos geográficos, por tanto no implementar desactivación.
- Permisos: \`MANTENIMIENTOS_VER\`, \`MANTENIMIENTOS_CREAR\`, \`MANTENIMIENTOS_EDITAR\`, \`MANTENIMIENTOS_ELIMINAR\`; validar en backend y requerir el ámbito global exclusivo configurado para este módulo.
- Auditoría y persistencia: reutilizar SUNARP Core y los mecanismos de auditoría ya existentes. No escribir directamente en Sheets desde scripts de UI.

El sistema debe continuar usando las pestañas singulares existentes. No crear una pestaña plural alternativa.

---

## 8. Alcance pendiente y reglas para nuevos chats

1. La estructura de menú tiene los cinco grupos acordados; solo Ubicación geográfica está en alcance de CRUD de esta etapa. No dar por implementados los otros cuatro grupos.
2. Sedes y locales deben considerar todos sus campos, incluida jerarquía \`locales.parent_id\`, orden de hermanos, sede y estado booleano.
3. Organización institucional debe considerar jerarquía \`estructura_org.parent_id\`, \`sede_id\`, \`tipo_estructura_id\`, orden y estado; \`estructura_local\` es una relación administrada en contexto.
4. Datos de personal deben usar \`cargos\`, \`condicion_cargo\` y \`tipo_documento_identidad\` con sus encabezados y estados reales. Condición de cargo no clasifica el cargo.
5. Directorio telefónico debe usar \`tipo_telefono\` con columna \`nombre\`; localizar el contrato de teléfonos antes de implementar la pestaña “Teléfonos”. \`telefonos_ubicaciones\` no es un CRUD independiente.
6. No desarrollar CRUD de relaciones \`estructura_local\`, \`telefonos_ubicaciones\` ni \`anexos_ambientes\` como pestañas separadas.
7. No agregar columnas \`active\` donde no existen. En tablas que sí la tienen, usar booleanos.
8. No cambiar nombres de pestañas por pluralización o por consistencia estética.
9. No inventar códigos, identificadores, categorías, columnas, hojas ni mecanismos de autorización.
10. No fusionar el PR ni desplegar o publicar librerías sin autorización expresa del usuario.

**Regla de continuidad:** antes de cada nuevo mantenimiento, releer este documento y el código vigente del módulo consumidor. Inspeccionar las dependencias existentes, trabajar en la rama indicada y reutilizar contratos de SUNARP Core/SUNARP UI. No pedir al usuario que vuelva a proporcionar este diccionario.
