
/**
 * SUNARP Core
 * Módulo: DataValidation
 *
 * Responsabilidad:
 * - Validar campos obligatorios.
 * - Validar tipos de datos.
 * - Validar longitudes.
 * - Validar rangos numéricos.
 * - Validar valores permitidos.
 * - Validar patrones mediante expresiones regulares.
 *
 * No contiene reglas de negocio de ninguna aplicación.
 *
 * Estructura del esquema:
 *
 * {
 *   nombre: {
 *     label: 'Nombre',
 *     required: true,
 *     type: 'string',
 *     minLength: 2,
 *     maxLength: 100
 *   },
 *   edad: {
 *     label: 'Edad',
 *     required: true,
 *     type: 'integer',
 *     min: 18,
 *     max: 100
 *   }
 * }
 */


/**
 * Determina si un objeto tiene una propiedad propia.
 */
function _coreHasOwn_(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}


/**
 * Determina si un valor está vacío.
 */
function _coreIsBlankValue_(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  );
}


/**
 * Comprueba que el esquema de validación tenga una estructura válida.
 */
function _coreNormalizeValidationSchema_(schema) {
  if (
    !schema ||
    typeof schema !== 'object' ||
    Array.isArray(schema)
  ) {
    throw new Error(
      'SUNARP Core: el esquema de validación debe ser un objeto.'
    );
  }

  Object.keys(schema).forEach(field => {
    const rule = schema[field];

    if (
      !rule ||
      typeof rule !== 'object' ||
      Array.isArray(rule)
    ) {
      throw new Error(
        `SUNARP Core: las reglas del campo "${field}" no son válidas.`
      );
    }

    if (rule.type !== undefined) {
      const allowedTypes = [
        'string',
        'number',
        'integer',
        'boolean',
        'date',
        'email'
      ];

      if (!allowedTypes.includes(rule.type)) {
        throw new Error(
          `SUNARP Core: el tipo "${rule.type}" del campo "${field}" no está admitido.`
        );
      }
    }

    ['minLength', 'maxLength', 'min', 'max'].forEach(property => {
      if (rule[property] !== undefined) {
        if (
          typeof rule[property] !== 'number' ||
          !Number.isFinite(rule[property])
        ) {
          throw new Error(
            `SUNARP Core: la regla "${property}" del campo "${field}" debe ser numérica.`
          );
        }
      }
    });

    if (
      rule.minLength !== undefined &&
      rule.maxLength !== undefined &&
      rule.minLength > rule.maxLength
    ) {
      throw new Error(
        `SUNARP Core: minLength no puede superar maxLength en "${field}".`
      );
    }

    if (
      rule.min !== undefined &&
      rule.max !== undefined &&
      rule.min > rule.max
    ) {
      throw new Error(
        `SUNARP Core: min no puede superar max en "${field}".`
      );
    }

    if (
      rule.allowedValues !== undefined &&
      !Array.isArray(rule.allowedValues)
    ) {
      throw new Error(
        `SUNARP Core: allowedValues de "${field}" debe ser un arreglo.`
      );
    }

    if (
      rule.pattern !== undefined &&
      typeof rule.pattern !== 'string'
    ) {
      throw new Error(
        `SUNARP Core: pattern de "${field}" debe ser una cadena.`
      );
    }

    if (rule.pattern !== undefined) {
      try {
        new RegExp(rule.pattern, rule.patternFlags || '');
      } catch (error) {
        throw new Error(
          `SUNARP Core: la expresión regular del campo "${field}" no es válida.`
        );
      }
    }

    if (
      rule.required !== undefined &&
      typeof rule.required !== 'boolean'
    ) {
      throw new Error(
        `SUNARP Core: required de "${field}" debe ser booleano.`
      );
    }

    if (
      rule.nullable !== undefined &&
      typeof rule.nullable !== 'boolean'
    ) {
      throw new Error(
        `SUNARP Core: nullable de "${field}" debe ser booleano.`
      );
    }
  });

  return schema;
}


/**
 * Valida el tipo de dato de un campo.
 */
function _coreValidateFieldType_(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';

    case 'number':
      return typeof value === 'number' && Number.isFinite(value);

    case 'integer':
      return Number.isInteger(value);

    case 'boolean':
      return typeof value === 'boolean';

    case 'date':
      if (value instanceof Date) {
        return !isNaN(value.getTime());
      }

      if (typeof value === 'string') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return false;
        }

        const date = new Date(`${value}T00:00:00`);

        return (
          !isNaN(date.getTime()) &&
          date.getFullYear() === Number(value.slice(0, 4)) &&
          date.getMonth() + 1 === Number(value.slice(5, 7)) &&
          date.getDate() === Number(value.slice(8, 10))
        );
      }

      return false;

    case 'email':
      return (
        typeof value === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      );

    default:
      return true;
  }
}


/**
 * Valida las reglas de un campo.
 */
function _coreValidateField_(field, value, rule) {
  const errors = [];
  const label = rule.label || field;

  const blank = _coreIsBlankValue_(value);

  if (blank) {
    if (rule.required) {
      errors.push({
        field,
        message: `${label} es obligatorio.`
      });

    } else if (value === null && rule.nullable === false) {
      errors.push({
        field,
        message: `${label} no admite valores nulos.`
      });
    }

    return errors;
  }

  if (value === null && rule.nullable === false) {
    errors.push({
      field,
      message: `${label} no admite valores nulos.`
    });

    return errors;
  }

  // Tipo de dato.
  if (rule.type && !_coreValidateFieldType_(value, rule.type)) {
    errors.push({
      field,
      message: `${label} no tiene un tipo de dato válido.`
    });

    return errors;
  }

  // Longitud mínima.
  if (
    rule.minLength !== undefined &&
    typeof value === 'string' &&
    value.length < rule.minLength
  ) {
    errors.push({
      field,
      message: `${label} debe tener al menos ${rule.minLength} caracteres.`
    });
  }

  // Longitud máxima.
  if (
    rule.maxLength !== undefined &&
    typeof value === 'string' &&
    value.length > rule.maxLength
  ) {
    errors.push({
      field,
      message: `${label} no puede superar los ${rule.maxLength} caracteres.`
    });
  }

  // Valor mínimo.
  if (
    rule.min !== undefined &&
    typeof value === 'number' &&
    value < rule.min
  ) {
    errors.push({
      field,
      message: `${label} debe ser mayor o igual a ${rule.min}.`
    });
  }

  // Valor máximo.
  if (
    rule.max !== undefined &&
    typeof value === 'number' &&
    value > rule.max
  ) {
    errors.push({
      field,
      message: `${label} debe ser menor o igual a ${rule.max}.`
    });
  }

  // Valores permitidos.
  if (
    rule.allowedValues &&
    !rule.allowedValues.some(allowed =>
      _coreValuesEqual_(value, allowed)
    )
  ) {
    errors.push({
      field,
      message: `${label} contiene un valor no permitido.`
    });
  }

  // Expresión regular.
  if (
    rule.pattern !== undefined &&
    typeof value === 'string'
  ) {
    const expression = new RegExp(
      rule.pattern,
      rule.patternFlags || ''
    );

    if (!expression.test(value)) {
      errors.push({
        field,
        message: rule.patternMessage ||
          `${label} no cumple el formato requerido.`
      });
    }
  }

  return errors;
}


/**
 * Valida un registro según un esquema configurable.
 *
 * Parámetros:
 * - record: objeto con los datos recibidos.
 * - schema: reglas de validación por campo.
 * - options:
 *   - partial: permite validar solo los campos enviados.
 *   - allowUnknownFields: permite campos que no están en el esquema.
 *
 * Retorna:
 * {
 *   valid: true | false,
 *   errors: [],
 *   messages: []
 * }
 */
function validateRecord(record, schema, options) {
  options = options || {};

  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record)
  ) {
    throw new Error(
      'SUNARP Core: el registro debe ser un objeto.'
    );
  }

  schema = _coreNormalizeValidationSchema_(schema);

  const partial = options.partial === true;
  const allowUnknownFields = options.allowUnknownFields === true;

  const errors = [];

  // Validar los campos definidos en el esquema.
  Object.keys(schema).forEach(field => {
    const rule = schema[field];

    const exists = _coreHasOwn_(record, field);

    // En una actualización parcial no se validan
    // campos que no fueron enviados.
    if (partial && !exists) {
      return;
    }

    const value = exists ? record[field] : undefined;

    const fieldErrors = _coreValidateField_(
      field,
      value,
      rule
    );

    errors.push(...fieldErrors);
  });

  // Detectar campos no declarados en el esquema.
  if (!allowUnknownFields) {
    Object.keys(record).forEach(field => {
      if (!_coreHasOwn_(schema, field)) {
        errors.push({
          field,
          message: `El campo "${field}" no está definido en el esquema de validación.`
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    messages: errors.map(error => error.message)
  };
}


/**
 * Ejecuta la validación y detiene la operación
 * cuando existen errores.
 *
 * Puede utilizarse directamente desde otros módulos
 * de SUNARP Core.
 */
function assertValidRecord(record, schema, options) {
  const result = validateRecord(
    record,
    schema,
    options
  );

  if (!result.valid) {
    throw new Error(
      'SUNARP Core: se encontraron errores de validación:\n- ' +
      result.messages.join('\n- ')
    );
  }

  return true;
}
