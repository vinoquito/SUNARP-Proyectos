/**
 * SUNARP Core
 * Módulo: DataCache
 *
 * Caché genérica compartida por las aplicaciones consumidoras.
 * Admite valores pequeños directamente y valores grandes mediante
 * compresión GZIP y fragmentos publicados a través de un manifiesto.
 *
 * CacheService es temporal: cualquier ausencia o fragmento incompleto
 * se interpreta como fallo de caché y nunca como un resultado parcial.
 */

const _CORE_CACHE_PREFIX_ = 'SUNARP_CORE:';
const _CORE_CACHE_FORMAT_ = 1;
const _CORE_CACHE_CHUNK_FORMAT_ = 2;
const _CORE_CACHE_DEFAULT_TTL_ = 600;
const _CORE_CACHE_MAX_TTL_ = 21600;
const _CORE_CACHE_MAX_BYTES_ = 95 * 1024;
const _CORE_CACHE_CHUNK_CHARS_ = 70 * 1024;
const _CORE_CACHE_MAX_CHUNKS_ = 128;


/**
 * Genera claves estables para caché de datos de una fuente.
 * La identidad física distingue réplicas que pueden tener retraso
 * de sincronización o esquemas distintos.
 */
function _coreBuildSourceCacheKey_(source, kind) {
  const config = _coreNormalizeSourceConfig_(source);
  const identity = [
    config.spreadsheetId,
    config.sheetName,
    config.headerRow,
    kind || 'records'
  ].join('|');
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    identity
  );
  const hash = Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
  return 'source-data:v1:' + hash;
}


/**
 * Invalida las instantáneas de una fuente después de una escritura.
 */
/**
 * Devuelve la generación vigente de una fuente. Si CacheService expulsa
 * la clave antes de tiempo se crea un UUID nuevo: las consultas anteriores
 * quedan inaccesibles aunque sus entradas físicas todavía existan.
 */
function _coreGetOwnSourceGeneration_(source) {
  const key = _coreBuildSourceCacheKey_(source, 'generation');
  const current = getCachedValue(key);
  if (typeof current === 'string' && current) return current;
  const generation = Utilities.getUuid();
  const stored = putCachedValue(key, generation, _CORE_CACHE_MAX_TTL_);
  return stored && stored.success === true ? generation : null;
}


/**
 * Generación efectiva de una fuente y de todas sus dependencias declaradas.
 * Una modificación del maestro cambia la generación efectiva de sus réplicas
 * y de los resultados derivados, sin modificar ni sustituir esas réplicas.
 */
function _coreGetSourceGeneration_(source, ancestry) {
  try {
    const config = _coreNormalizeSourceConfig_(source);
    const key = _coreBuildSourceCacheKey_(config, 'generation');
    const visited = Array.isArray(ancestry) ? ancestry : [];
    if (visited.includes(key)) {
      console.warn('[SUNARP Core] Se detectó un ciclo en las dependencias de fuentes:', config.label);
      return null;
    }

    const ownGeneration = _coreGetOwnSourceGeneration_(config);
    if (!ownGeneration) return null;

    const dependencies = config.dependencies || [];
    if (!dependencies.length) return ownGeneration;

    const nextAncestry = visited.concat(key);
    const dependencyGenerations = [];
    for (let i = 0; i < dependencies.length; i++) {
      const generation = _coreGetSourceGeneration_(dependencies[i], nextAncestry);
      if (!generation) return null;
      dependencyGenerations.push(generation);
    }
    return _coreCacheDigest_([ownGeneration].concat(dependencyGenerations).join('|'));
  } catch (error) {
    console.warn('[SUNARP Core] No se pudo obtener la generación efectiva de la fuente:', error.message);
    return null;
  }
}


/**
 * Invalida instantáneas y cambia la generación de la fuente.
 * Los resultados derivados incluyen esta generación en su clave; por tanto
 * dejan de ser utilizables incluso si CacheService conserva entradas antiguas.
 */
function _coreInvalidateSourceCache_(source) {
  const recordsKey = _coreBuildSourceCacheKey_(source, 'records');
  const infoKey = _coreBuildSourceCacheKey_(source, 'info');
  const generationKey = _coreBuildSourceCacheKey_(source, 'generation');
  try {
    const generation = Utilities.getUuid();
    const generationStored = putCachedValue(
      generationKey,
      generation,
      _CORE_CACHE_MAX_TTL_
    );
    const removed = removeCachedValues([recordsKey, infoKey]);
    return {
      success: Boolean(generationStored && generationStored.success && removed && removed.success),
      generation,
      removed
    };
  } catch (error) {
    console.warn('[SUNARP Core] No se pudo invalidar la fuente:', error.message);
    return { success: false, error: error.message };
  }
}

function invalidateSourceCache(source) {
  return _coreWithWriteLock_(() => _coreInvalidateSourceCache_(source));
}


function _coreBuildCacheKey_(key) {
  const normalizedKey = String(key || '').trim();

  if (!normalizedKey) {
    throw new Error('SUNARP Core: debes proporcionar una clave de caché.');
  }

  const fullKey = _CORE_CACHE_PREFIX_ + normalizedKey;

  if (fullKey.length > 250) {
    throw new Error('SUNARP Core: la clave de caché supera los 250 caracteres.');
  }

  return fullKey;
}


function _coreGetCache_() {
  return CacheService.getScriptCache();
}


function _coreCacheDigest_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value)
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}


function _coreCacheDecodeGzip_(encoded) {
  const bytes = Utilities.base64Decode(encoded);
  const blob = Utilities.newBlob(bytes, 'application/gzip');
  return Utilities.ungzip(blob).getDataAsString('UTF-8');
}


function _coreCacheReadEnvelope_(cache, fullKey) {
  const raw = cache.get(fullKey);
  if (raw === null) return null;

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch (error) {
    cache.remove(fullKey);
    return null;
  }

  if (!envelope || typeof envelope !== 'object') {
    cache.remove(fullKey);
    return null;
  }

  if (
    envelope.format === _CORE_CACHE_FORMAT_ &&
    Object.prototype.hasOwnProperty.call(envelope, 'value')
  ) {
    return envelope.value;
  }

  if (
    envelope.format !== _CORE_CACHE_CHUNK_FORMAT_ ||
    !['gzip-inline', 'gzip-chunks'].includes(envelope.storage)
  ) {
    cache.remove(fullKey);
    return null;
  }

  if (envelope.storage === 'gzip-inline') {
    try {
      return JSON.parse(_coreCacheDecodeGzip_(envelope.payload));
    } catch (error) {
      cache.remove(fullKey);
      return null;
    }
  }

  const chunkKeys = envelope.chunkKeys;
  if (
    !Array.isArray(chunkKeys) ||
    !chunkKeys.length ||
    chunkKeys.length > _CORE_CACHE_MAX_CHUNKS_
  ) {
    cache.remove(fullKey);
    return null;
  }

  const chunks = cache.getAll(chunkKeys);
  const encoded = [];
  for (let i = 0; i < chunkKeys.length; i++) {
    const chunk = chunks[chunkKeys[i]];
    if (typeof chunk !== 'string') {
      cache.remove(fullKey);
      cache.removeAll(chunkKeys);
      return null;
    }
    encoded.push(chunk);
  }

  const payload = encoded.join('');
  if (
    Number(envelope.payloadLength) !== payload.length ||
    (envelope.checksum &&
      _coreCacheDigest_(payload) !== envelope.checksum)
  ) {
    cache.remove(fullKey);
    cache.removeAll(chunkKeys);
    return null;
  }

  try {
    return JSON.parse(_coreCacheDecodeGzip_(payload));
  } catch (error) {
    cache.remove(fullKey);
    cache.removeAll(chunkKeys);
    return null;
  }
}


/**
 * Recupera un valor. Una entrada incompleta, vencida o corrupta produce
 * un fallo de caché (null); nunca se devuelve una colección parcial.
 */
function getCachedValue(key) {
  const fullKey = _coreBuildCacheKey_(key);
  return _coreCacheReadEnvelope_(_coreGetCache_(), fullKey);
}


/**
 * Almacena valores pequeños directamente. Los valores grandes se comprimen
 * y, si es necesario, se fragmentan. El manifiesto se publica al final:
 * hasta entonces los fragmentos no son visibles como una entrada válida.
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
    throw new Error('SUNARP Core: no se puede almacenar un valor undefined.');
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new Error(
      'SUNARP Core: no se pudo serializar el valor de caché. ' + error.message
    );
  }

  if (serialized === undefined) {
    throw new Error('SUNARP Core: el valor proporcionado no es serializable.');
  }

  const serializedBytes = Utilities.newBlob(serialized).getBytes().length;
  const cache = _coreGetCache_();

  // Reemplazar una entrada grande o pequeña nunca debe dejar disponible
  // una generación anterior si la nueva no puede almacenarse.
  const previousChunkKeys = _coreCacheGetManifestChunkKeys_(cache, fullKey);
  cache.remove(fullKey);
  if (previousChunkKeys.length) cache.removeAll(previousChunkKeys);

  if (serializedBytes <= _CORE_CACHE_MAX_BYTES_) {
    const envelope = JSON.stringify({
      format: _CORE_CACHE_FORMAT_,
      value
    });
    cache.put(fullKey, envelope, ttl);
    return {
      success: true,
      storage: 'direct',
      sizeBytes: serializedBytes,
      expirationSeconds: ttl
    };
  }

  const compressed = Utilities.gzip(
    Utilities.newBlob(serialized, 'application/json')
  ).getBytes();
  const encoded = Utilities.base64Encode(compressed);
  const inlineEnvelope = JSON.stringify({
    format: _CORE_CACHE_CHUNK_FORMAT_,
    storage: 'gzip-inline',
    payload: encoded
  });
  const inlineBytes = Utilities.newBlob(inlineEnvelope).getBytes().length;

  if (inlineBytes <= _CORE_CACHE_MAX_BYTES_) {
    cache.put(fullKey, inlineEnvelope, ttl);
    return {
      success: true,
      storage: 'gzip-inline',
      sizeBytes: serializedBytes,
      compressedBytes: compressed.length,
      expirationSeconds: ttl
    };
  }

  const chunkCount = Math.ceil(encoded.length / _CORE_CACHE_CHUNK_CHARS_);
  if (chunkCount > _CORE_CACHE_MAX_CHUNKS_) {
    return {
      success: false,
      storage: 'not-cached',
      reason: 'chunk-limit',
      sizeBytes: serializedBytes,
      compressedBytes: compressed.length,
      chunkCount
    };
  }

  const generation = Utilities.getUuid().replace(/-/g, '');
  const digest = _coreCacheDigest_(fullKey);
  const chunkKeys = [];
  const chunkValues = {};

  for (let i = 0; i < chunkCount; i++) {
    const chunkKey = _CORE_CACHE_PREFIX_ +
      'chunk:' + digest + ':' + generation + ':' + i;
    const chunk = encoded.slice(
      i * _CORE_CACHE_CHUNK_CHARS_,
      (i + 1) * _CORE_CACHE_CHUNK_CHARS_
    );
    chunkKeys.push(chunkKey);
    chunkValues[chunkKey] = chunk;
  }

  try {
    cache.putAll(chunkValues, ttl);

    const manifest = JSON.stringify({
      format: _CORE_CACHE_CHUNK_FORMAT_,
      storage: 'gzip-chunks',
      generation,
      chunkKeys,
      payloadLength: encoded.length,
      checksum: _coreCacheDigest_(encoded),
      sizeBytes: serializedBytes,
      compressedBytes: compressed.length
    });

    if (Utilities.newBlob(manifest).getBytes().length > _CORE_CACHE_MAX_BYTES_) {
      cache.removeAll(chunkKeys);
      return {
        success: false,
        storage: 'not-cached',
        reason: 'manifest-limit',
        sizeBytes: serializedBytes,
        chunkCount
      };
    }

    // Publicación atómica lógica: el manifiesto aparece solo después
    // de escribir todos los fragmentos de esta generación.
    cache.put(fullKey, manifest, ttl);

    return {
      success: true,
      storage: 'gzip-chunks',
      sizeBytes: serializedBytes,
      compressedBytes: compressed.length,
      chunkCount,
      expirationSeconds: ttl
    };
  } catch (error) {
    try {
      cache.removeAll(chunkKeys);
    } catch (cleanupError) {
      console.warn('[SUNARP Core] No se pudieron limpiar fragmentos incompletos:', cleanupError.message);
    }

    return {
      success: false,
      storage: 'not-cached',
      reason: 'cache-write-failed',
      message: error.message,
      sizeBytes: serializedBytes,
      chunkCount
    };
  }
}


function _coreCacheGetManifestChunkKeys_(cache, fullKey) {
  const raw = cache.get(fullKey);
  if (raw === null) return [];

  try {
    const envelope = JSON.parse(raw);
    return envelope &&
      envelope.format === _CORE_CACHE_CHUNK_FORMAT_ &&
      envelope.storage === 'gzip-chunks' &&
      Array.isArray(envelope.chunkKeys)
      ? envelope.chunkKeys
      : [];
  } catch (error) {
    return [];
  }
}


/**
 * Elimina tanto el manifiesto como los fragmentos de la generación actual.
 * Los fragmentos huérfanos por expiración anticipada desaparecen por TTL.
 */
function removeCachedValue(key) {
  const fullKey = _coreBuildCacheKey_(key);
  const cache = _coreGetCache_();
  const chunkKeys = _coreCacheGetManifestChunkKeys_(cache, fullKey);

  cache.remove(fullKey);
  if (chunkKeys.length) cache.removeAll(chunkKeys);

  return {
    success: true,
    key,
    removedChunks: chunkKeys.length
  };
}


/**
 * Invalida múltiples entradas y todos sus fragmentos conocidos.
 * Se agrupan las eliminaciones para respetar límites de CacheService.
 */
function removeCachedValues(keys) {
  if (!Array.isArray(keys)) {
    throw new Error(
      'SUNARP Core: las claves deben proporcionarse como un arreglo.'
    );
  }

  if (!keys.length) {
    return { success: true, removed: 0, removedChunks: 0 };
  }

  const cache = _coreGetCache_();
  const fullKeys = [...new Set(keys.map(_coreBuildCacheKey_))];
  const allKeys = new Set(fullKeys);

  fullKeys.forEach(fullKey => {
    _coreCacheGetManifestChunkKeys_(cache, fullKey)
      .forEach(chunkKey => allKeys.add(chunkKey));
  });

  const removalKeys = [...allKeys];
  for (let i = 0; i < removalKeys.length; i += 900) {
    cache.removeAll(removalKeys.slice(i, i + 900));
  }

  return {
    success: true,
    removed: fullKeys.length,
    removedChunks: removalKeys.length - fullKeys.length
  };
}
