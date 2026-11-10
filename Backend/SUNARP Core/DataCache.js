
/**
 * SUNARP Core
 * Módulo: DataCache
 *
 * Responsabilidad:
 * - Almacenar información temporal.
 * - Recuperar información almacenada.
 * - Gestionar la expiración de los datos.
 * - Invalidar elementos individuales o múltiples.
 * - Validar claves, formatos y tamaños.
 *
 * Servicio genérico reutilizable por cualquier aplicación.
 */


/* =========================================================
   CONFIGURACIÓN INTERNA
   ========================================================= */

const _CORE_CACHE_PREFIX_ = 'SUNARP_CORE:';
const _CORE_CACHE_FORMAT_ = 1;
const _CORE_CACHE_DEFAULT_TTL_ = 600;
const _CORE_CACHE_MAX_TTL_ = 21600;
const _CORE_CACHE_MAX_BYTES_ = 95 * 1024;


/* =========================================================
   FUNCIONES AUXILIARES
   ========================================================= */


/**
 * Obtiene una clave completa y valida su longitud.
 *
 * Las aplicaciones deben utilizar espacios de nombres
 * para evitar colisiones entre proyectos consumidores.
 */
function _coreBuildCacheKey_(key) {

  const normalizedKey = String(key || '').trim();

  if (!normalizedKey) {
    throw new Error(
      'SUNARP Core: debes proporcionar una clave de caché.'
    );
  }

  const fullKey = _CORE_CACHE_PREFIX_ + normalizedKey;

  if (fullKey.length > 250) {
    throw new Error(
      'SUNARP Core: la clave de caché supera los 250 caracteres.'
    );
  }

  return fullKey;
}


/**
 * Obtiene la instancia de caché de SUNARP Core.
 *
 * Esta instancia pertenece a la biblioteca y puede
 * compartirse entre las aplicaciones que la utilizan.
 */
function _coreGetCache_() {
  return CacheService.getScriptCache();
}


/* =========================================================
   RECUPERACIÓN
   ========================================================= */


/**
 * Recupera un valor almacenado en caché.
 *
 * Retorna null cuando:
 * - No existe la clave.
 * - El elemento expiró.
 * - El contenido no puede interpretarse.
 *
 * @param {string} key Clave con espacio de nombres.
 * @return {*} Valor recuperado o null.
 */
function getCachedValue(key) {

  const fullKey = _coreBuildCacheKey_(key);
  const cache = _coreGetCache_();

  const cached = cache.get(fullKey);

  if (cached === null) {
    return null;
  }

  try {

    const envelope = JSON.parse(cached);

    if (
      !envelope ||
      envelope.format !== _CORE_CACHE_FORMAT_ ||
      !Object.prototype.hasOwnProperty.call(envelope, 'value')
    ) {
      cache.remove(fullKey);
      return null;
    }

    return envelope.value;

  } catch (error) {

    cache.remove(fullKey);
    return null;

  }
}


/* =========================================================
   ALMACENAMIENTO
   ========================================================= */


/**
 * Almacena un valor en caché.
 *
 * @param {string} key Clave con espacio de nombres.
 * @param {*} value Información serializable.
 * @param {number} expirationSeconds Tiempo de expiración.
 *
 * @return {Object} Resultado del almacenamiento.
 */
function putCachedValue(key, value, expirationSeconds) {

  const fullKey = _coreBuildCacheKey_(key);

  const ttl = expirationSeconds === undefined
    ? _CORE_CACHE_DEFAULT_TTL_
    : Number(expirationSeconds);

  if (
    !Number.isInteger(ttl) ||
    ttl < 1 ||
    ttl > _CORE_CACHE_MAX_TTL_
  ) {
    throw new Error(
      'SUNARP Core: el tiempo de expiración debe estar entre 1 y 21600 segundos.'
    );
  }

  if (value === undefined) {
    throw new Error(
      'SUNARP Core: no se puede almacenar un valor undefined.'
    );
  }

  let serialized;

  try {

    serialized = JSON.stringify({
      format: _CORE_CACHE_FORMAT_,
      value
    });

  } catch (error) {

    throw new Error(
      'SUNARP Core: no se pudo serializar el valor de caché. ' +
      error.message
    );

  }

  if (serialized === undefined) {
    throw new Error(
      'SUNARP Core: el valor proporcionado no es serializable.'
    );
  }

  const sizeBytes = Utilities
    .newBlob(serialized)
    .getBytes()
    .length;

  if (sizeBytes > _CORE_CACHE_MAX_BYTES_) {
    throw new Error(
      `SUNARP Core: el contenido ocupa ${sizeBytes} bytes y supera el límite interno de almacenamiento.`
    );
  }

  _coreGetCache_().put(
    fullKey,
    serialized,
    ttl
  );

  return {
    success: true,
    sizeBytes,
    expirationSeconds: ttl
  };
}


/* =========================================================
   INVALIDACIÓN
   ========================================================= */


/**
 * Elimina un elemento de caché.
 *
 * @param {string} key Clave con espacio de nombres.
 */
function removeCachedValue(key) {

  const fullKey = _coreBuildCacheKey_(key);

  _coreGetCache_().remove(fullKey);

  return {
    success: true,
    key
  };
}


/**
 * Elimina varios elementos de caché.
 *
 * @param {Array<string>} keys Claves que se eliminarán.
 */
function removeCachedValues(keys) {

  if (!Array.isArray(keys)) {
    throw new Error(
      'SUNARP Core: las claves deben proporcionarse como un arreglo.'
    );
  }

  if (keys.length === 0) {
    return {
      success: true,
      removed: 0
    };
  }

  const fullKeys = [
    ...new Set(keys.map(_coreBuildCacheKey_))
  ];

  _coreGetCache_().removeAll(fullKeys);

  return {
    success: true,
    removed: fullKeys.length
  };
}
