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
    if (!generationStored || generationStored.success !== true) {
      // Si no se pudo publicar la generación nueva, retirar la anterior
      // para que la siguiente lectura no pueda reutilizarla silenciosamente.
      try { removeCachedValue(generationKey); } catch (cleanupError) {
        console.warn('[SUNARP Core] No se pudo retirar la generación anterior:', cleanupError.message);
      }
      try { removeCachedValues([recordsKey, infoKey]); } catch (cleanupError) {
        console.warn('[SUNARP Core] No se pudieron retirar instantáneas base:', cleanupError.message);
      }
      return {
        success: false,
        generation: null,
        error: generationStored && generationStored.reason || 'generation-write-failed'
      };
    }

    const removed = removeCachedValues([recordsKey, infoKey]);
    return {
      success: Boolean(removed && removed.success),
      generation,
      removed
    };
  } catch (error) {
    // Fallar al invalidar no debe dejar intacta deliberadamente la generación
    // anterior. La limpieza es best-effort: CacheService puede estar indisponible.
    try { removeCachedValue(generationKey); } catch (cleanupError) {
      console.warn('[SUNARP Core] No se pudo retirar la generación anterior:', cleanupError.message);
    }
    try { removeCachedValues([recordsKey, infoKey]); } catch (cleanupError) {
      console.warn('[SUNARP Core] No se pudieron retirar instantáneas base:', cleanupError.message);
    }
    console.warn('[SUNARP Core] No se pudo invalidar la fuente:', error.message);
    return { success: false, generation: null, error: error.message };
  }
}

/**
 * Asegura que una escritura Core no reporte éxito normal si falló la
 * invalidación de su fuente. La escritura de Sheets puede estar ya aplicada;
 * el mensaje lo declara para que el consumidor reconcilie sin duplicarla.
 */
function _coreInvalidateSourceCacheOrThrow_(source) {
  const result = _coreInvalidateSourceCache_(source);
  if (!result || result.success !== true) {
    throw new Error(
      'SUNARP Core: la escritura en Sheets pudo haberse aplicado, pero falló la invalidación de caché. ' +
      'No repitas la escritura a ciegas; comprueba el registro y ejecuta invalidateSourceCache(source). ' +
      (result && result.error ? 'Detalle: ' + result.error : '')
    );
  }
  return result;
}

/**
 * Ejecuta el tramo de escritura de una fuente y garantiza que la ruta normal
 * y la ruta de error intenten flush + invalidación si ya comenzó a modificar
 * celdas. No ofrece rollback: ante un error posterior al primer write, avisa
 * que el consumidor debe inspeccionar el estado antes de repetir la operación.
 */
function _coreRunSourceWrite_(source, writer) {
  if (typeof writer !== 'function') {
    throw new Error('SUNARP Core: se requiere una función para ejecutar la escritura.');
  }

  let writeStarted = false;
  let finalizationStarted = false;

  const finalize = () => {
    finalizationStarted = true;
    let flushError = null;
    let invalidationError = null;

    try {
      SpreadsheetApp.flush();
    } catch (error) {
      flushError = error;
    }

    try {
      _coreInvalidateSourceCacheOrThrow_(source);
    } catch (error) {
      invalidationError = error;
    }

    if (flushError || invalidationError) {
      const details = [];
      if (flushError) details.push('flush: ' + flushError.message);
      if (invalidationError) details.push('invalidación: ' + invalidationError.message);
      throw new Error(
        'SUNARP Core: la escritura pudo haberse aplicado, pero no se pudo completar ' +
        'su finalización segura. Comprueba los datos antes de reintentar. ' +
        details.join(' | ')
      );
    }
  };

  try {
    const result = writer(() => {
      writeStarted = true;
    });
    if (writeStarted) finalize();
    return result;
  } catch (error) {
    if (writeStarted && !finalizationStarted) {
      try {
        finalize();
      } catch (finalizationError) {
        throw new Error(
          'SUNARP Core: la operación falló después de iniciar una escritura y también ' +
          'falló la finalización/invalidación. Puede existir una actualización parcial; ' +
          'comprueba los datos antes de reintentar. Error original: ' + error.message +
          '. Error de finalización: ' + finalizationError.message
        );
      }

      throw new Error(
        'SUNARP Core: la operación falló después de iniciar una escritura. Se ejecutaron ' +
        'flush e invalidación de la fuente; puede haber cambios parciales. Comprueba ' +
        'los datos antes de reintentar. Detalle: ' + error.message
      );
    }
    throw error;
  }
}

/**
 * Ejecuta escrituras directas del consumidor como un lote coordinado por Core.
 *
 * El callback recibe markWriteStarted(), que debe invocarse inmediatamente
 * antes de la primera mutación de Sheets. Core mantiene el mismo ScriptLock
 * de la biblioteca que utilizan las escrituras CRUD, ejecuta un único flush
 * y trata de invalidar todas las fuentes declaradas tanto al finalizar con
 * éxito como después de un error posterior a la primera escritura.
 *
 * No ofrece rollback ni transacción entre pestañas. El callback no debe llamar
 * a otros métodos públicos de escritura o invalidación de Core, porque el
 * bloqueo ya está adquirido.
 */
function runSourceWriteBatch(sources, writer) {
  if (!Array.isArray(sources) || !sources.length) {
    throw new Error('SUNARP Core: runSourceWriteBatch requiere al menos una fuente afectada.');
  }
  if (typeof writer !== 'function') {
    throw new Error('SUNARP Core: runSourceWriteBatch requiere una función de escritura.');
  }

  const uniqueSources = [];
  const seenSources = new Set();

  sources.forEach(source => {
    const config = _coreNormalizeSourceConfig_(source);
    const key = _coreBuildSourceCacheKey_(config, 'generation');
    if (seenSources.has(key)) return;
    seenSources.add(key);
    uniqueSources.push(config);
  });

  return _coreWithWriteLock_(() => {
    let writeStarted = false;
    let finalizationStarted = false;

    const finalize = () => {
      finalizationStarted = true;
      let flushError = null;
      const invalidationErrors = [];

      try {
        SpreadsheetApp.flush();
      } catch (error) {
        flushError = error;
      }

      // No detenerse ante el primer fallo: cada fuente afectada debe intentar
      // publicar su propia generación nueva.
      uniqueSources.forEach(source => {
        try {
          _coreInvalidateSourceCacheOrThrow_(source);
        } catch (error) {
          invalidationErrors.push(
            source.label + ': ' + error.message
          );
        }
      });

      if (flushError || invalidationErrors.length) {
        const details = [];
        if (flushError) details.push('flush: ' + flushError.message);
        if (invalidationErrors.length) {
          details.push('invalidación: ' + invalidationErrors.join(' | '));
        }
        throw new Error(
          'SUNARP Core: el lote pudo haberse aplicado, pero no se pudo completar ' +
          'su finalización segura. Comprueba todas las fuentes antes de reintentar. ' +
          details.join(' | ')
        );
      }
    };

    try {
      const result = writer(() => {
        writeStarted = true;
      });

      if (writeStarted) finalize();
      return result;

    } catch (error) {
      if (writeStarted && !finalizationStarted) {
        try {
          finalize();
        } catch (finalizationError) {
          throw new Error(
            'SUNARP Core: el lote falló después de iniciar una escritura y también ' +
            'falló la finalización/invalidación. Puede haber cambios parciales; ' +
            'comprueba todas las fuentes antes de reintentar. Error original: ' +
            error.message + '. Error de finalización: ' + finalizationError.message
          );
        }

        throw new Error(
          'SUNARP Core: el lote falló después de iniciar una escritura. Se ejecutó ' +
          'flush y se intentó invalidar todas las fuentes declaradas; puede haber ' +
          'cambios parciales. Comprueba los datos antes de reintentar. Detalle: ' +
          error.message
        );
      }

      throw error;
    }
  });
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
    !Number.isInteger(Number(envelope.payloadLength)) ||
    Number(envelope.payloadLength) !== payload.length ||
    typeof envelope.checksum !== 'string' ||
    !envelope.checksum ||
    _coreCacheDigest_(payload) !== envelope.checksum
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


/**
 * Recupera o construye un valor derivado de varias fuentes.
 * La clave incorpora la generación efectiva de cada fuente y sus dependencias.
 * El builder solo se ejecuta cuando no existe una entrada vigente.
 * El consumidor debe comprobar su autorización antes de invocar esta función.
 */
function getOrBuildCachedValue(key, sources, builder, expirationSeconds) {
  const logicalKey = String(key || '').trim();
  if (!logicalKey || logicalKey.length > 180) {
    throw new Error('SUNARP Core: la clave lógica del valor derivado debe tener entre 1 y 180 caracteres.');
  }
  if (!Array.isArray(sources) || !sources.length) {
    throw new Error('SUNARP Core: debes indicar las fuentes que determinan el valor derivado.');
  }
  if (typeof builder !== 'function') {
    throw new Error('SUNARP Core: builder debe ser una función.');
  }

  const ttl = expirationSeconds === undefined ? 300 : Number(expirationSeconds);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > _CORE_CACHE_MAX_TTL_) {
    throw new Error('SUNARP Core: el TTL del valor derivado debe estar entre 1 y 21600 segundos.');
  }

  const sourceConfigs = sources.map(source => _coreNormalizeSourceConfig_(source));
  const readGenerations = () => sourceConfigs.map((config, index) => {
    const generation = _coreGetSourceGeneration_(sources[index]);
    if (!generation) return null;
    return {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      headerRow: config.headerRow,
      generation
    };
  });

  const before = readGenerations();
  const cacheable = before.every(Boolean);
  const cacheKey = cacheable
    ? 'derived:v1:' + _coreCacheDigest_(logicalKey + '|' + JSON.stringify(before))
    : null;

  if (cacheKey) {
    const cached = getCachedValue(cacheKey);
    if (cached && cached.version === 1 &&
        Object.prototype.hasOwnProperty.call(cached, 'value')) {
      return { value: cached.value, cacheHit: true, cacheStored: true };
    }
  }

  const value = builder();
  if (value === undefined) {
    throw new Error('SUNARP Core: builder no puede devolver undefined.');
  }
  if (!cacheable) {
    return {
      value,
      cacheHit: false,
      cacheStored: false,
      cacheReason: 'source-generation-unavailable'
    };
  }

  const after = readGenerations();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      'SUNARP Core: una de las fuentes cambió durante la construcción del valor derivado; vuelve a solicitarlo.'
    );
  }

  try {
    const stored = putCachedValue(cacheKey, { version: 1, value }, ttl);
    return {
      value,
      cacheHit: false,
      cacheStored: Boolean(stored && stored.success === true),
      cacheReason: stored && stored.success === true ? '' : stored && stored.reason || 'cache-unavailable'
    };
  } catch (error) {
    console.warn('[SUNARP Core] No se pudo conservar el valor derivado en caché:', error.message);
    return {
      value,
      cacheHit: false,
      cacheStored: false,
      cacheReason: 'cache-write-failed'
    };
  }
}
