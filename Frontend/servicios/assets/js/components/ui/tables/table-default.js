
const TableDefault = {

    props: {

        title: {
            type: String,
            default: ''
        },

        items: {
            type: Array,
            default: () => []
        },

        columns: {
            type: Array,
            default: () => []
        },

        emptyText: {
            type: String,
            default: 'No se encontraron registros.'
        }
    },


    computed: {

        /*
         * ============================================================
         * COLUMNAS NORMALIZADAS
         *
         * Permite recibir:
         *
         * ['nombre', 'telefono']
         *
         * o:
         *
         * [
         *     {
         *         key: 'nombre',
         *         label: 'Nombre'
         *     }
         * ]
         * ============================================================
         */

        resolvedColumns() {

            if (this.columns.length) {

                return this.columns.map(column => {

                    if (typeof column === 'string') {

                        return {
                            key: column,
                            label: column
                        };
                    }

                    return {
                        ...column,
                        label: column.label || column.key || ''
                    };
                });
            }

            /*
             * Generación automática
             * cuando no se especifican columnas.
             */

            if (!this.items.length) {
                return [];
            }

            return Object.keys(this.items[0])

                .filter(key => key !== 'template')

                .map(key => ({
                    key,
                    label: key
                }));
        }
    },


    methods: {

        /*
         * ============================================================
         * OBTENER VALOR DE UNA CELDA
         * ============================================================
         */

        getCellValue(item, column, index) {

            const value = typeof column.value === 'function'

                ? column.value(item, index)

                : item?.[column.key];

            if (
                value === undefined ||
                value === null ||
                value === ''
            ) {
                return '—';
            }

            return value;
        },

        /*
        * ============================================================
        * OBTENER NIVELES DE UNA CELDA
        * ============================================================
        */

        getCellParts(item, column, index) {

            if (typeof column.parts !== 'function') {
                return {
                    primary: '',
                    secondary: []
                };
            }

            const parts = column.parts(item, index) || {};

            return {

                primary: parts.primary ?? '',

                secondary: Array.isArray(parts.secondary)

                    ? parts.secondary.filter(value =>
                        value !== undefined &&
                        value !== null &&
                        String(value).trim() !== ''
                    )

                    : []

            };

        },

        /*
         * ============================================================
         * OBTENER URL DE UN ENLACE
         * ============================================================
         */

        getCellHref(item, column, index) {

            if (typeof column.href === 'function') {

                return column.href(item, index);
            }

            return column.href || '';
        }

    },


    template: `

        <section class="max-w-7xl mx-auto px-16 py-8">

            <div class="table-default-container">

                <div
                    class="table-default-scroll"
                    role="region"
                    tabindex="0"
                    :aria-label="title || 'Tabla de datos'"
                >

                    <table class="table-default">

                        <!-- TITULO -->

                        <caption
                            v-if="title"
                            class="table-default-caption"
                        >
                            {{ title }}
                        </caption>


                        <!-- ENCABEZADOS -->

                        <thead v-if="resolvedColumns.length">

                            <tr>

                                <th
                                    v-for="(column, index) in resolvedColumns"
                                    :key="index"
                                    scope="col"
                                    :class="[
                                        column.headerClass,
                                        {
                                            'table-default-align-center':
                                                column.align === 'center',

                                            'table-default-align-right':
                                                column.align === 'right'
                                        }
                                    ]"
                                    :style="column.width
                                        ? { width: column.width }
                                        : null"
                                >

                                    {{ column.label }}

                                </th>

                            </tr>

                        </thead>


                        <!-- REGISTROS -->

                        <tbody v-if="resolvedColumns.length">

                            <tr
                                v-for="(item, rowIndex) in items"
                                :key="item.id ?? rowIndex"
                            >

                                <td
                                    v-for="(column, colIndex) in resolvedColumns"
                                    :key="colIndex"
                                    :class="[
                                        column.class,
                                        {
                                            'table-default-align-center':
                                                column.align === 'center',

                                            'table-default-align-right':
                                                column.align === 'right',

                                            'table-default-nowrap':
                                                column.nowrap
                                        }
                                    ]"
                                >

                                    <!-- CELDA CON ENLACE -->

                                    <a
                                        v-if="getCellHref(item, column, rowIndex)"
                                        :href="getCellHref(item, column, rowIndex)"
                                        :target="column.target || '_self'"
                                        :rel="column.target === '_blank'
                                            ? 'noopener noreferrer'
                                            : null"
                                        :class="column.linkClass || 'table-default-link'"
                                    >
                                        {{ getCellValue(item, column, rowIndex) }}
                                    </a>


                                    <!-- CELDA NORMAL -->

                                    <template v-else>

                                        <!-- CELDA CON JERARQUÍA -->

                                        <div
                                            v-if="typeof column.parts === 'function'"
                                            class="table-default-hierarchy"
                                        >

                                            <span
                                                v-if="getCellParts(item, column, rowIndex).primary"
                                                class="table-default-hierarchy-primary"
                                            >
                                                {{ getCellParts(item, column, rowIndex).primary }}
                                            </span>


                                            <span
                                                v-for="(part, index) in getCellParts(item, column, rowIndex).secondary"
                                                :key="index"
                                                class="table-default-hierarchy-secondary"
                                            >
                                                {{ part }}
                                            </span>

                                        </div>


                                        <!-- CELDA NORMAL -->

                                        <span v-else>
                                            {{ getCellValue(item, column, rowIndex) }}
                                        </span>

                                    </template>

                                </td>

                            </tr>


                            <!-- SIN RESULTADOS -->

                            <tr v-if="!items.length">

                                <td
                                    :colspan="resolvedColumns.length"
                                    class="table-default-empty"
                                >
                                    {{ emptyText }}
                                </td>

                            </tr>

                        </tbody>


                        <!-- SIN COLUMNAS CONFIGURADAS -->

                        <tbody v-else>

                            <tr>

                                <td class="table-default-empty">

                                    {{ items.length
                                        ? 'No hay columnas configuradas.'
                                        : emptyText
                                    }}

                                </td>

                            </tr>

                        </tbody>

                    </table>

                </div>

            </div>

        </section>

    `
};
