const ListingBlock = {

    props: {

        items: {
            type: Array,
            default: () => []
        },

        /*
         * Valores esperados:
         *
         * listing-block-table
         * listing-block-card
         */
        type: {
            type: String,
            default: 'listing-block-table'
        },

        filterFields: {
            type: Array,
            default: () => [
                'Tipo de registro',
                'Estado',
                'Categoría',
                'Tipo de proceso',
                'Proceso',
                'Área de proceso',
                'Clasificación',
                'Sede',
                'Órgano responsable',
                'Unidad de organización',
                'Tipo de documento',
                'Rol'
            ]
        },

        searchFields: {
            type: Array,
            default: () => []
        },

        perPage: {
            type: Number,
            default: 10
        },

        itemLabel: {
            type: String,
            default: 'elementos'
        },

        exportColumns: {
            type: Array,
            default: () => []
        },

        filename: {
            type: String,
            default: 'exportacion'
        }

    },


    data() {

        return {

            selectedFilters: {},

            searchQuery: '',

            currentPage: 1

        };

    },


    computed: {

        /*
         * ============================================================
         * VARIANTE DE PRESENTACIÓN
         * ============================================================
         */

        variant() {

            return this.type === 'listing-block-card'
                ? 'card'
                : 'table';

        },


        /*
         * ============================================================
         * ORDEN DE FILTROS
         *
         * Mantiene únicamente los campos definidos en filterFields,
         * respetando el orden en que aparecen las columnas de los datos.
         * ============================================================
         */

        orderedFilterFields() {

            if (!this.items.length) {
                return this.filterFields;
            }

            const columns =
                Object.keys(this.items[0]);

            return columns.filter(
                column =>
                    this.filterFields.includes(column)
            );

        },


        /*
         * ============================================================
         * OPCIONES DE CADA FILTRO
         *
         * Los filtros funcionan en cascada.
         * ============================================================
         */

        filterOptions() {

            const result = {};

            this.orderedFilterFields.forEach(
                (field, index) => {

                    let rows = this.items;

                    /*
                     * Aplicar filtros anteriores.
                     */

                    for (
                        let i = 0;
                        i < index;
                        i++
                    ) {

                        const previousField =
                            this.orderedFilterFields[i];

                        const value =
                            this.selectedFilters[
                                previousField
                            ];

                        if (!value) {
                            continue;
                        }

                        rows = rows.filter(row =>
                            String(
                                row[previousField] ?? ''
                            ) === String(value)
                        );

                    }

                    /*
                     * Obtener valores únicos.
                     */

                    const values = [
                        ...new Set(
                            rows
                                .map(row => row[field])
                                .filter(value =>
                                    value !== undefined &&
                                    value !== null &&
                                    String(value).trim() !== ''
                                )
                        )
                    ];

                    /*
                     * Orden alfabético.
                     */

                    values.sort((a, b) =>
                        String(a).localeCompare(
                            String(b),
                            'es',
                            {
                                sensitivity: 'base'
                            }
                        )
                    );

                    result[field] =
                        values.map(value => ({
                            value,
                            label: value
                        }));

                }
            );

            return result;

        },


        /*
         * ============================================================
         * FILTROS QUE TIENEN OPCIONES
         * ============================================================
         */

        availableFilterFields() {

            return this.orderedFilterFields.filter(
                field =>
                    this.filterOptions[field]?.length > 0
            );

        },


        /*
         * ============================================================
         * RESULTADO DESPUÉS DE APLICAR SELECTORES
         * ============================================================
         */

        filteredBySelectors() {

            let rows = this.items;

            for (
                const field
                of this.orderedFilterFields
            ) {

                const value =
                    this.selectedFilters[field];

                if (!value) {
                    continue;
                }

                rows = rows.filter(row =>
                    String(
                        row[field] ?? ''
                    ) === String(value)
                );

            }

            return rows;

        },


        /*
         * ============================================================
         * CAMPOS DE BÚSQUEDA
         *
         * Si se especifican, se respetan.
         * Si no, se determinan automáticamente.
         * ============================================================
         */

        resolvedSearchFields() {

            if (
                this.searchFields &&
                this.searchFields.length
            ) {
                return this.searchFields;
            }

            /*
             * Para cards se buscan los campos
             * principales del contenido.
             */

            if (this.variant === 'card') {

                return [
                    'text',
                    'description'
                ];

            }

            /*
             * Para tablas se buscan las columnas visibles.
             */

            return this.detectVisibleKeys(
                this.items
            );

        },


        /*
         * ============================================================
         * RESULTADO FINAL
         *
         * SELECTORES + BÚSQUEDA
         * ============================================================
         */

        filteredRows() {

            const rows =
                this.filteredBySelectors;

            const query =
                this.searchQuery
                    .trim()
                    .toLowerCase();

            if (
                !query ||
                !this.resolvedSearchFields.length
            ) {
                return rows;
            }

            return rows.filter(row =>
                this.resolvedSearchFields.some(field => {

                    const value =
                        row[field];

                    if (
                        value === undefined ||
                        value === null
                    ) {
                        return false;
                    }

                    return String(value)
                        .toLowerCase()
                        .includes(query);

                })
            );

        },


        /*
         * ============================================================
         * TOTAL DE REGISTROS
         * ============================================================
         */

        totalItems() {

            return this.filteredRows.length;

        },


        /*
         * ============================================================
         * TOTAL DE PÁGINAS
         * ============================================================
         */

        totalPages() {

            return Math.max(
                1,
                Math.ceil(
                    this.totalItems /
                    this.perPage
                )
            );

        },


        /*
         * ============================================================
         * REGISTROS DE LA PÁGINA ACTUAL
         * ============================================================
         */

        paginatedRows() {

            const start =
                (this.currentPage - 1) *
                this.perPage;

            return this.filteredRows.slice(
                start,
                start + this.perPage
            );

        },


        /*
         * ============================================================
         * CANTIDAD VISIBLE
         * ============================================================
         */

        visibleItems() {

            return this.paginatedRows.length;

        },


        /*
         * ============================================================
         * PÁGINAS PARA EL PAGINADOR
         * ============================================================
         */

        pages() {

            const range = 2;

            const total =
                this.totalPages;

            const current =
                this.currentPage;

            const pages = [];

            let start =
                Math.max(
                    1,
                    current - range
                );

            let end =
                Math.min(
                    total,
                    current + range
                );

            if (start > 1) {

                pages.push(1);

                if (start > 2) {
                    pages.push('...');
                }

            }

            for (
                let page = start;
                page <= end;
                page++
            ) {

                pages.push(page);

            }

            if (end < total) {

                if (end < total - 1) {
                    pages.push('...');
                }

                pages.push(total);

            }

            return pages;

        },


        /*
         * ============================================================
         * COLUMNAS VISIBLES
         *
         * Solo utilizadas por listing-block-table.
         * ============================================================
         */

        visibleColumns() {

            if (!this.items.length) {
                return [];
            }

            const columnsToShow =
                (
                    this.exportColumns &&
                    this.exportColumns.length
                )
                    ? this.exportColumns
                    : this.detectVisibleKeys(
                        this.items
                    );

            return columnsToShow

                .filter(key =>
                    this.items.some(row => {

                        const value =
                            row[key];

                        return (
                            value !== undefined &&
                            value !== null &&
                            String(value).trim() !== ''
                        );

                    })
                )

                .map(key => ({

                    key,

                    label:
                        this.getColumnLabel(key),

                    bold: false,

                    type:
                        this.isBadgeField(key)
                            ? 'badge'
                            : 'text'

                }));

        },

        /*
         * ============================================================
         * DETERMINAR SI HAY ACCIONES
         * ============================================================
         */
        hasActions() {

            return this.items.some(row =>
                row.url_destination &&
                String(row.url_destination).trim() !== ''
            );

        },

        /*
         * ============================================================
         * COLUMNAS DE EXPORTACIÓN
         * ============================================================
         */

        resolvedExportColumns() {

            if (
                this.exportColumns &&
                this.exportColumns.length
            ) {

                return this.exportColumns.map(column => {

                    if (typeof column === 'string') {

                        return {
                            key: column,
                            label:
                                this.getColumnLabel(
                                    column
                                )
                        };

                    }

                    return column;

                });

            }

            if (!this.items.length) {
                return [];
            }

            return this.detectVisibleKeys(
                this.items
            ).map(key => ({

                key,

                label:
                    this.getColumnLabel(key)

            }));

        }

    },


    watch: {

        selectedFilters: {

            deep: true,

            handler() {

                this.currentPage = 1;

            }

        },


        searchQuery() {

            this.currentPage = 1;

        },


        items() {

            this.currentPage = 1;

        },


        totalPages(value) {

            if (
                this.currentPage > value
            ) {

                this.currentPage =
                    value;

            }

        }

    },


    methods: {

        /*
         * ============================================================
         * DETECTAR COLUMNAS
         * ============================================================
         */

        detectVisibleKeys(rows) {

            if (!rows.length) {
                return [];
            }

            const excluded = [

                'id',
                'block',
                'mode',
                'type',
                'order',
                'state',
                'page',
                'image_id',
                'image_name',
                'icon',
                'url_destination',
                'target'

            ];

            return Object.keys(rows[0])
                .filter(
                    key =>
                        !excluded.includes(key)
                );

        },


        /*
         * ============================================================
         * DETERMINAR SI UN CAMPO ES BADGE
         * ============================================================
         */

        isBadgeField(key) {

            if (!key) {
                return false;
            }

            const normalized =
                String(key)
                    .normalize('NFD')
                    .replace(
                        /[\u0300-\u036f]/g,
                        ''
                    )
                    .toLowerCase()
                    .trim();

            return normalized === 'estado';

        },


        /*
         * ============================================================
         * VARIANTE DEL BADGE
         * ============================================================
         */

        getBadgeVariant(value) {

            const map = {

                'Presentado':
                    'brand',

                'Iniciativa aprobada':
                    'success',

                'Producto aprobado':
                    'success',

                'Proyecto en ejecución':
                    'warning',

                'Suspendido':
                    'warning',

                'Iniciativa archivada':
                    'gray',

                'Producto no aprobado':
                    'danger',

                'Cancelado':
                    'danger'

            };

            return map[value] ||
                'neutral';

        },


        /*
         * ============================================================
         * ETIQUETAS DE FILTROS / COLUMNAS
         * ============================================================
         */

        getColumnLabel(key) {

            if (!key) {
                return '';
            }

            const labels = {

                group: 'Categoría',

                subgroup: 'Subcategoría',

                text: 'Nombre',

                description: 'Descripción',

                Clasificación:
                    'Clasificación',

                'Unidad de organización':
                    'Unidad de organización',

                'Órgano responsable':
                    'Órgano responsable',

                'Tipo de documento':
                    'Tipo de documento',

                Sede:
                    'Sede'

            };

            return labels[key] ||
                key
                    .replace(
                        /_/g,
                        ' '
                    )
                    .replace(
                        /\b\w/g,
                        letter =>
                            letter.toUpperCase()
                    );

        },


        /*
         * ============================================================
         * ITEMS PARA LAS CARDS
         * ============================================================
         */

        getCardItems(row) {

            const items = this.visibleColumns

                .filter(
                    column =>
                        column.key !== 'text'
                )

                .map(column => ({

                    label:
                        column.label,

                    value:
                        row[column.key],

                    type:
                        column.type,

                    variant:
                        column.type === 'badge'
                            ? this.getBadgeVariant(
                                row[column.key]
                            )
                            : undefined

                }));


        if (
            row.url_destination &&
            String(row.url_destination).trim() !== ''
        ) {

            items.push({
                value: row.url_destination,
                type: 'link',
                icon: 'chevron-right',
                target: row.target || '_blank'
            });

        }

            return items;

        },


        /*
         * ============================================================
         * CAMBIO DE FILTRO
         *
         * Limpia los filtros posteriores.
         * ============================================================
         */

        onFilterChange(changedField) {

            const changedIndex =
                this.orderedFilterFields.indexOf(
                    changedField
                );

            if (
                changedIndex === -1
            ) {
                return;
            }

            for (
                let i =
                    changedIndex + 1;
                i < this.orderedFilterFields.length;
                i++
            ) {

                this.selectedFilters[
                    this.orderedFilterFields[i]
                ] = '';

            }

            this.currentPage = 1;

        },


        /*
         * ============================================================
         * CAMBIAR PÁGINA
         * ============================================================
         */

        goToPage(page) {

            const targetPage =
                Number(page);

            if (
                !Number.isInteger(
                    targetPage
                ) ||
                targetPage < 1 ||
                targetPage > this.totalPages
            ) {
                return;
            }

            this.currentPage =
                targetPage;

        },


        /*
         * ============================================================
         * ABRIR DETALLE
         * ============================================================
         */

        openLink(url) {

            if (url) {

                window.open(
                    url,
                    '_blank'
                );

            }

        }

    },


    template: `

        <div class="space-y-4">

            <!-- =====================================================
                FILTROS + BÚSQUEDA
                ===================================================== -->

            <div
                class="grid grid-cols-1 gap-4"
                :class="{
                    'md:grid-cols-[minmax(180px,auto)_minmax(280px,1fr)]':
                        availableFilterFields.length === 1,

                    'md:grid-cols-[minmax(180px,auto)_minmax(180px,auto)_minmax(280px,1fr)]':
                        availableFilterFields.length === 2,

                    'md:grid-cols-3':
                        availableFilterFields.length === 3,

                    'md:grid-cols-4':
                        availableFilterFields.length >= 4
                }"
            >

                <app-select
                    v-for="field in availableFilterFields"
                    :key="field"
                    v-model="selectedFilters[field]"
                    :placeholder="'Seleccionar: ' + getColumnLabel(field)"
                    :options="filterOptions[field] || []"
                    @update:modelValue="onFilterChange(field)"
                />

                <app-input-search
                    v-if="resolvedSearchFields.length"
                    v-model="searchQuery"
                    placeholder="Buscar..."
                    :class="{
                        'md:col-span-3':
                            availableFilterFields.length === 3,

                        'md:col-span-4':
                            availableFilterFields.length >= 4
                    }"
                />

            </div>


            <!-- =====================================================
                 RESUMEN + EXPORTACIÓN
                 ===================================================== -->

            <div
                class="
                    flex
                    flex-col
                    md:flex-row
                    items-start
                    md:items-center
                    justify-between
                    gap-4
                "
            >

                <div class="text-sm text-gray-600">

                    Página
                    <span class="font-medium text-gray-900">
                        {{ currentPage }}
                    </span>

                    de

                    <span class="font-medium text-gray-900">
                        {{ totalPages }}
                    </span>

                    <span class="mx-2 text-gray-400">|</span>

                    Mostrando
                    <span class="font-medium text-gray-900">
                        {{ visibleItems }}
                    </span>

                    de

                    <span class="font-medium text-gray-900">
                        {{ totalItems }}
                    </span>

                    {{ itemLabel }}

                </div>


                <div
                    v-if="filteredRows.length"
                    class="flex gap-2"
                >

                    <div
                        class="
                            flex
                            items-center
                        "
                    >

                        <span
                            class="
                                text-sm
                                text-gray-600
                            "
                        >
                            Descargar:
                        </span>

                    </div>


                    <export-excel-button
                        :data="filteredRows"
                        :columns="resolvedExportColumns"
                        :filename="filename"
                    />


                    <export-pdf-button
                        :data="filteredRows"
                        :columns="resolvedExportColumns"
                        :filename="filename"
                    />

                </div>

            </div>


            <!-- =====================================================
                 RESULTADOS: TABLA
                 ===================================================== -->

            <data-table
                v-if="variant === 'table'"
                :columns="visibleColumns"
                :rows="paginatedRows"
                :actions="hasActions"
                :per-page="perPage"
                :show-search="false"
            >

                <template #actions="{ row }">

                    <app-button
                        v-if="row.url_destination"
                        icon="eye"
                        variant="tertiary"
                        icon-only
                        tooltip="Ver detalle"
                        @click="
                            openLink(
                                row.url_destination
                            )
                        "
                    />

                </template>


                <!-- BADGES DINÁMICOS -->

                <template
                    v-for="
                        column in visibleColumns.filter(
                            column => column.type === 'badge'
                        )
                    "
                    :key="'badge-' + column.key"
                    v-slot:[column.key]="{ value }"
                >

                    <app-badge
                        :label="value"
                        :variant="
                            getBadgeVariant(value)
                        "
                    >
                    </app-badge>

                </template>

            </data-table>


            <!-- =====================================================
                 RESULTADOS: CARDS
                 ===================================================== -->

            <div
                v-else-if="variant === 'card'"
                class="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >

                <card-list
                    v-for="row in paginatedRows"
                    :key="row.text"
                    variant="info"
                    :title="row.text"
                    :items="getCardItems(row)"
                />

            </div>


            <!-- =====================================================
                 SIN RESULTADOS
                 ===================================================== -->

            <div
                v-if="!paginatedRows.length"
                class="
                    py-8
                    text-center
                    text-gray-500
                "
            >

                No se encontraron resultados.

            </div>


            <!-- =====================================================
                 PAGINACIÓN
                 ===================================================== -->

            <nav
                v-if="totalPages > 1"
                class="
                    flex
                    items-center
                    justify-center
                    gap-1
                    mt-6
                "
                aria-label="Paginación"
            >

                <button
                    type="button"
                    class="
                        px-3
                        py-2
                        text-sm
                        border
                        border-gray-300
                        rounded-md
                        text-gray-700
                        hover:bg-gray-50
                        disabled:opacity-50
                        disabled:cursor-not-allowed
                    "
                    :disabled="
                        currentPage === 1
                    "
                    @click="
                        goToPage(
                            currentPage - 1
                        )
                    "
                >
                    Anterior
                </button>


                <template
                    v-for="(page, index) in pages"
                    :key="index"
                >

                    <button
                        v-if="page !== '...'"
                        type="button"
                        class="
                            min-w-[36px]
                            px-3
                            py-2
                            text-sm
                            border
                            border-gray-300
                            rounded-md
                            hover:bg-gray-50
                        "
                        :class="
                            page === currentPage
                                ? 'bg-gray-800 text-white border-gray-800'
                                : 'text-gray-700'
                        "
                        @click="
                            goToPage(page)
                        "
                    >
                        {{ page }}
                    </button>


                    <span
                        v-else
                        class="
                            px-2
                            text-sm
                            text-gray-500
                        "
                    >
                        ...
                    </span>

                </template>


                <button
                    type="button"
                    class="
                        px-3
                        py-2
                        text-sm
                        border
                        border-gray-300
                        rounded-md
                        text-gray-700
                        hover:bg-gray-50
                        disabled:opacity-50
                        disabled:cursor-not-allowed
                    "
                    :disabled="
                        currentPage === totalPages
                    "
                    @click="
                        goToPage(
                            currentPage + 1
                        )
                    "
                >
                    Siguiente
                </button>

            </nav>

        </div>

    `

};