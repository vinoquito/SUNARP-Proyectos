const ListingBlock = {

    props: {

        items: {
            type: Array,
            default: () => []
        },

        filterFields: {
            type: Array,
            default: () => []
        },

        searchFields: {
            type: Array,
            default: () => []
        },

        perPage: {
            type: Number,
            default: 12
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
        },

        pdfColumns: {
            type: Array,
            default: () => []
        },

        pdfGrouping: {
            type: Object,
            default: null
        },

        pdfLogo: {
            type: String,
            default: ''
        },

        showExport: {
            type: Boolean,
            default: true
        },

    },


    data() {

        return {

            selectedFilters: {},

            searchQuery: '',

            currentPage: 1,

            pageSize: [12, 24, 48].includes(Number(this.perPage))
                ? Number(this.perPage)
                : 12

        };

    },


    computed: {

        /*
         * CAMPOS DE FILTRO NORMALIZADOS
         */

        normalizedFilterFields() {

            return this.filterFields.map(field => {

                if (typeof field === 'string') {

                    return {
                        key: field,
                        label: field
                    };

                }

                return field;

            });

        },

        /*
        * CANTIDAD DE FILTROS ACTUALMENTE VISIBLES
        *
        * Se utiliza para adaptar la distribución del buscador
        * y el botón de limpieza.
        */

        visibleFilterCount() {

            return this.normalizedFilterFields.filter(
                (field, index) => this.shouldShowFilter(field, index)
            ).length;

        },


        /*
         * OPCIONES DE CADA SELECT
         *
         * Los filtros funcionan en cascada.
         */

        filterOptions() {

            const result = {};

            this.normalizedFilterFields.forEach(
                (fieldConfig, index) => {

                    let rows = this.items;

                    /*
                     * Aplicar los filtros anteriores.
                     */

                    for (let i = 0; i < index; i++) {

                        const previousField =
                            this.normalizedFilterFields[i];

                        const value =
                            this.selectedFilters[
                                previousField.key
                            ];

                        if (!value) {
                            continue;
                        }

                        rows = rows.filter(row =>
                            String(
                                row[previousField.key] ?? ''
                            ) === String(value)
                        );

                    }


                    /*
                     * Obtener valores únicos.
                     */

                    const values = [
                        ...new Set(

                            rows

                                .map(row => row[fieldConfig.key])

                                .filter(value =>

                                    value !== undefined &&
                                    value !== null &&
                                    String(value).trim() !== ''

                                )

                        )
                    ];


                    /*
                     * Ordenar opciones alfabéticamente.
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


                    result[fieldConfig.key] = values.map(
                        value => ({

                            value,

                            label: value

                        })
                    );

                }
            );


            return result;

        },


        /*
         * RESULTADO DESPUÉS DE APLICAR LOS SELECT
         */

        filteredBySelectors() {

            let rows = this.items;

            for (
                const fieldConfig
                of this.normalizedFilterFields
            ) {

                const value =
                    this.selectedFilters[
                        fieldConfig.key
                    ];

                if (!value) {
                    continue;
                }

                rows = rows.filter(row =>
                    String(
                        row[fieldConfig.key] ?? ''
                    ) === String(value)
                );

            }

            return rows;

        },


        /*
         * RESULTADO FINAL: SELECT + BÚSQUEDA
         *
         * Este array completo también se utiliza para exportar.
         */

        filteredRows() {

            const rows =
                this.filteredBySelectors;

            const query =
                this.searchQuery
                    .trim()
                    .toLowerCase();

            if (!query) {
                return rows;
            }

            return rows.filter(row => {

                return this.searchFields.some(field => {

                    const value = row[field];

                    if (
                        value === undefined ||
                        value === null
                    ) {
                        return false;
                    }

                    return String(value)
                        .toLowerCase()
                        .includes(query);

                });

            });

        },


        /*
         * TOTAL DE REGISTROS FILTRADOS
         */

        totalItems() {

            return this.filteredRows.length;

        },


        /*
         * TOTAL DE PÁGINAS
         */

        totalPages() {

            return Math.max(
                1,
                Math.ceil(
                    this.totalItems /
                    this.pageSize
                )
            );

        },


        /*
         * REGISTROS DE LA PÁGINA ACTUAL
         */

        paginatedRows() {

            const start =
                (this.currentPage - 1) *
                this.pageSize;

            return this.filteredRows.slice(
                start,
                start + this.pageSize
            );

        },


        /*
         * CANTIDAD VISIBLE EN LA PÁGINA
         */

        visibleItems() {

            return this.paginatedRows.length;

        },


        /*
         * COLUMNAS DE EXPORTACIÓN
         */

        resolvedExportColumns() {

            if (
                this.exportColumns &&
                this.exportColumns.length
            ) {

                return this.exportColumns;

            }

            if (!this.items.length) {
                return [];
            }

            return Object.keys(
                this.items[0]
            ).map(key => ({

                key,

                label: key

            }));

        },


        /*
         * PÁGINAS PARA EL PAGINADOR
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

        }

    },


    watch: {

        /*
         * CUALQUIER CAMBIO EN LOS FILTROS
         */

        selectedFilters: {

            deep: true,

            handler() {

                this.currentPage = 1;

            }

        },


        /*
         * CAMBIO EN EL BUSCADOR
         */

        searchQuery() {

            this.currentPage = 1;

        },


        /*
         * CAMBIO DEL DATASET DESDE EL PADRE
         */

        items() {

            this.currentPage = 1;

        },


        /*
         * PROTECCIÓN CONTRA PÁGINAS FUERA DE RANGO
         */

        totalPages(value) {

            if (this.currentPage > value) {

                this.currentPage = value;

            }

        }

    },


    methods: {

        /*
         * VISIBILIDAD DE FILTROS EN CASCADA
         */

        shouldShowFilter(field, index) {

            /*
             * Verificar selección del filtro anterior.
             */

            if (field.showAfterSelection) {

                const previousField =
                    this.normalizedFilterFields[index - 1];

                if (
                    !previousField ||
                    !this.selectedFilters[previousField.key]
                ) {

                    return false;

                }

            }


            /*
             * Verificar si existen opciones disponibles.
             */

            if (field.hideWhenEmpty) {

                const options =
                    this.filterOptions[field.key] || [];

                if (!options.length) {

                    return false;

                }

            }

            return true;

        },


        /*
         * CAMBIO DE SELECT
         */

        onFilterChange(fieldKey) {

            const changedIndex =
                this.normalizedFilterFields.findIndex(
                    field => field.key === fieldKey
                );

            if (changedIndex === -1) {
                return;
            }


            /*
             * Limpiar los filtros posteriores.
             */

            for (
                let i = changedIndex + 1;
                i < this.normalizedFilterFields.length;
                i++
            ) {

                const field =
                    this.normalizedFilterFields[i];

                this.selectedFilters[field.key] = '';

            }

            this.currentPage = 1;

        },


        /*
         * LIMPIAR FILTROS Y BÚSQUEDA
         */

        clearFilters() {

            this.selectedFilters = {};

            this.normalizedFilterFields.forEach(field => {
                this.selectedFilters[field.key] = '';
            });

            this.searchQuery = '';

            this.currentPage = 1;

        },


        /*
         * CAMBIAR CANTIDAD DE REGISTROS POR PÁGINA
         */

        onPerPageChange(value) {

            const pageSize = Number(value);

            if (![12, 24, 48].includes(pageSize)) {
                return;
            }

            this.pageSize = pageSize;
            this.currentPage = 1;

        },


        /*
         * CAMBIAR PÁGINA
         */

        goToPage(page) {

            const targetPage =
                Number(page);

            if (
                !Number.isInteger(targetPage) ||
                targetPage < 1 ||
                targetPage > this.totalPages
            ) {

                return;

            }

            this.currentPage =
                targetPage;

        }

    },


    template: `

        <div class="space-y-6">

            <!-- =====================================================
                 FILTROS
                 ===================================================== -->

            <div
                v-if="normalizedFilterFields.length || searchFields.length"
                class="listing-filters max-w-7xl mx-auto px-16 py-8"
            >

                <div
                    class="listing-filters-grid"
                    :class="{
                        'listing-filters-grid--one-filter': visibleFilterCount === 1,
                        'listing-filters-grid--two-filters': visibleFilterCount === 2,
                        'listing-filters-grid--actions-full-row':
                            visibleFilterCount === 2 ||
                            (
                                visibleFilterCount >= 4 &&
                                (visibleFilterCount - 1) % 3 === 0
                            )
                    }"
                >

                    <!-- SELECTS -->

                    <template
                        v-for="(field, index) in normalizedFilterFields"
                        :key="field.key"
                    >

                        <div
                            v-if="shouldShowFilter(field, index)"
                            class="listing-filter-item"
                        >

                            <select-gob
                                v-model="selectedFilters[field.key]"
                                :label="field.label"
                                :placeholder="field.placeholder || 'Todas'"
                                :options="filterOptions[field.key] || []"
                                @update:modelValue="onFilterChange(field.key)"
                            >
                            </select-gob>

                        </div>

                    </template>


                    <!-- BUSCADOR -->

                    <div
                        v-if="searchFields.length"
                        class="listing-search listing-filter-item"
                    >

                        <search-input
                            v-model="searchQuery"
                            label="Buscar"
                            placeholder="Buscar"
                        >
                        </search-input>

                    </div>


                    <!-- LIMPIAR FILTROS -->

                    <div class="listing-filter-actions">

                        <clear-filters-button
                            @clear="clearFilters"
                        >
                        </clear-filters-button>

                    </div>

                </div>

            </div>


            <!-- =====================================================
                 RESUMEN + EXPORTACIÓN
                 ===================================================== -->

            <div
                class="
                    max-w-7xl
                    mx-auto
                    px-16
                    flex
                    flex-col
                    md:flex-row
                    items-start
                    md:items-center
                    justify-between
                    gap-4
                "
            >

                <listing-summary
                    :page="currentPage"
                    :total-pages="totalPages"
                    :visible="visibleItems"
                    :total="totalItems"
                    :label="itemLabel"
                    :per-page="pageSize"
                    @update:per-page="onPerPageChange"
                >
                </listing-summary>


                <div
                    v-if="showExport"
                    class="flex gap-2"
                >

                    <div class="flex items-center">

                        <span class="filter-label">
                            Descargar:
                        </span>

                    </div>


                    <export-excel-button
                        :data="filteredRows"
                        :columns="pdfColumns.length ? pdfColumns : resolvedExportColumns"
                        :filename="filename"
                        :grouping="pdfGrouping"
                        :logo="pdfLogo"
                    >
                    </export-excel-button>


                    <export-pdf-button
                        :data="filteredRows"
                        :columns="pdfColumns.length ? pdfColumns : resolvedExportColumns"
                        :filename="filename"
                        :grouping="pdfGrouping"
                        :logo="pdfLogo"
                    >
                    </export-pdf-button>

                </div>

            </div>


            <!-- =====================================================
                 RESULTADOS
                 ===================================================== -->

            <div>

                <slot
                    name="results"
                    :items="paginatedRows"
                    :filtered-items="filteredRows"
                    :page="currentPage"
                    :total-pages="totalPages"
                >

                    <div
                        v-if="!paginatedRows.length"
                        class="py-8 text-center text-gray-500"
                    >
                        No se encontraron resultados.
                    </div>

                </slot>

            </div>


            <!-- =====================================================
                 PAGINACIÓN
                 ===================================================== -->

            <nav
                v-if="totalPages > 1"
                class="pagination-gob"
            >

                <button
                    :disabled="currentPage === 1"
                    @click="goToPage(currentPage - 1)"
                >
                    Anterior
                </button>


                <template
                    v-for="(page, index) in pages"
                    :key="index"
                >

                    <button
                        v-if="page !== '...'"
                        @click="goToPage(page)"
                        :class="{
                            active: page === currentPage
                        }"
                    >
                        {{ page }}
                    </button>


                    <span v-else>
                        ...
                    </span>

                </template>


                <button
                    :disabled="currentPage === totalPages"
                    @click="goToPage(currentPage + 1)"
                >
                    Siguiente
                </button>

            </nav>

        </div>

    `

};

// const ListingBlock = {

//     props: {

//         /*
//          * ============================================================
//          * DATOS
//          * ============================================================
//          */

//         items: {
//             type: Array,
//             default: () => []
//         },


//         /*
//          * ============================================================
//          * FILTROS SELECT
//          * ============================================================
//          */

//         filterFields: {
//             type: Array,
//             default: () => []
//         },


//         /*
//          * ============================================================
//          * CAMPOS UTILIZADOS POR EL BUSCADOR
//          * ============================================================
//          */

//         searchFields: {
//             type: Array,
//             default: () => []
//         },


//         /*
//          * ============================================================
//          * REGISTROS POR PAGINA
//          * ============================================================
//          */

//         perPage: {
//             type: Number,
//             default: 10
//         },


//         /*
//          * ============================================================
//          * TEXTO DEL RESUMEN
//          * ============================================================
//          */

//         itemLabel: {
//             type: String,
//             default: 'elementos'
//         },


//         /*
//          * ============================================================
//          * EXPORTACION
//          * ============================================================
//          */

//         exportColumns: {
//             type: Array,
//             default: () => []
//         },


//         /*
//          * ============================================================
//          * NOMBRE DEL ARCHIVO DE EXPORTACION
//          * ============================================================
//          */

//         filename: {
//             type: String,
//             default: 'exportacion'
//         }

//     },


//     data() {

//         return {

//             selectedFilters: {},

//             searchQuery: '',

//             currentPage: 1

//         };

//     },


//     computed: {

//         /*
//          * ============================================================
//          * CAMPOS DE FILTRO NORMALIZADOS
//          * ============================================================
//          */

//         normalizedFilterFields() {

//             return this.filterFields.map(field => {

//                 if (typeof field === 'string') {

//                     return {
//                         key: field,
//                         label: field
//                     };

//                 }

//                 return field;

//             });

//         },


//         /*
//          * ============================================================
//          * OPCIONES DE CADA SELECT
//          *
//          * Los filtros funcionan en cascada.
//          *
//          * Cada filtro utiliza las selecciones anteriores
//          * para determinar sus opciones disponibles.
//          * ============================================================
//          */

//         filterOptions() {

//             const result = {};

//             this.normalizedFilterFields.forEach(
//                 (fieldConfig, index) => {

//                     let rows = this.items;


//                     /*
//                      * Aplicar los filtros anteriores
//                      * para construir las opciones disponibles.
//                      */

//                     for (let i = 0; i < index; i++) {

//                         const previousField =
//                             this.normalizedFilterFields[i];

//                         const value =
//                             this.selectedFilters[
//                                 previousField.key
//                             ];

//                         if (!value) {
//                             continue;
//                         }

//                         rows = rows.filter(row =>
//                             String(
//                                 row[previousField.key] ?? ''
//                             ) === String(value)
//                         );

//                     }


//                     /*
//                      * Obtener valores únicos.
//                      */

//                     const values = [
//                         ...new Set(

//                             rows

//                                 .map(row => row[fieldConfig.key])

//                                 .filter(value =>

//                                     value !== undefined &&
//                                     value !== null &&
//                                     String(value).trim() !== ''

//                                 )

//                         )
//                     ];


//                     /*
//                      * Ordenar opciones alfabéticamente.
//                      */

//                     values.sort((a, b) =>
//                         String(a).localeCompare(
//                             String(b),
//                             'es',
//                             {
//                                 sensitivity: 'base'
//                             }
//                         )
//                     );


//                     result[fieldConfig.key] = values.map(
//                         value => ({

//                             value,

//                             label: value

//                         })
//                     );

//                 }
//             );


//             return result;

//         },


//         /*
//          * ============================================================
//          * RESULTADO DESPUES DE APLICAR LOS SELECT
//          * ============================================================
//          */

//         filteredBySelectors() {

//             let rows = this.items;

//             for (
//                 const fieldConfig
//                 of this.normalizedFilterFields
//             ) {

//                 const value =
//                     this.selectedFilters[
//                         fieldConfig.key
//                     ];

//                 if (!value) {
//                     continue;
//                 }

//                 rows = rows.filter(row =>
//                     String(
//                         row[fieldConfig.key] ?? ''
//                     ) === String(value)
//                 );

//             }

//             return rows;

//         },


//         /*
//          * ============================================================
//          * RESULTADO FINAL
//          *
//          * SELECT + BUSQUEDA
//          *
//          * ESTE ES EL ARRAY COMPLETO FILTRADO.
//          *
//          * SE UTILIZA PARA EXPORTAR.
//          * ============================================================
//          */

//         filteredRows() {

//             const rows =
//                 this.filteredBySelectors;

//             const query =
//                 this.searchQuery
//                     .trim()
//                     .toLowerCase();

//             if (!query) {
//                 return rows;
//             }

//             return rows.filter(row => {

//                 return this.searchFields.some(field => {

//                     const value = row[field];

//                     if (
//                         value === undefined ||
//                         value === null
//                     ) {
//                         return false;
//                     }

//                     return String(value)
//                         .toLowerCase()
//                         .includes(query);

//                 });

//             });

//         },


//         /*
//          * ============================================================
//          * TOTAL DE REGISTROS FILTRADOS
//          * ============================================================
//          */

//         totalItems() {

//             return this.filteredRows.length;

//         },


//         /*
//          * ============================================================
//          * TOTAL DE PAGINAS
//          *
//          * Nunca será 0.
//          * ============================================================
//          */

//         totalPages() {

//             return Math.max(
//                 1,
//                 Math.ceil(
//                     this.totalItems /
//                     this.perPage
//                 )
//             );

//         },


//         /*
//          * ============================================================
//          * REGISTROS DE LA PAGINA ACTUAL
//          *
//          * ESTE ES EL ARRAY QUE SE ENTREGA AL SLOT.
//          * ============================================================
//          */

//         paginatedRows() {

//             const start =
//                 (this.currentPage - 1) *
//                 this.perPage;

//             return this.filteredRows.slice(
//                 start,
//                 start + this.perPage
//             );

//         },


//         /*
//          * ============================================================
//          * CANTIDAD VISIBLE EN LA PAGINA
//          * ============================================================
//          */

//         visibleItems() {

//             return this.paginatedRows.length;

//         },


//         /*
//          * ============================================================
//          * COLUMNAS DE EXPORTACION
//          *
//          * Si el padre las proporciona, se respetan.
//          *
//          * Si no, se detectan automáticamente.
//          * ============================================================
//          */

//         resolvedExportColumns() {

//             if (
//                 this.exportColumns &&
//                 this.exportColumns.length
//             ) {

//                 return this.exportColumns;

//             }

//             if (!this.items.length) {
//                 return [];
//             }

//             return Object.keys(
//                 this.items[0]
//             ).map(key => ({

//                 key,

//                 label: key

//             }));

//         },


//         /*
//          * ============================================================
//          * PAGINAS PARA EL PAGINADOR
//          * ============================================================
//          */

//         pages() {

//             const range = 2;

//             const total =
//                 this.totalPages;

//             const current =
//                 this.currentPage;

//             const pages = [];

//             let start =
//                 Math.max(
//                     1,
//                     current - range
//                 );

//             let end =
//                 Math.min(
//                     total,
//                     current + range
//                 );


//             if (start > 1) {

//                 pages.push(1);

//                 if (start > 2) {
//                     pages.push('...');
//                 }

//             }


//             for (
//                 let page = start;
//                 page <= end;
//                 page++
//             ) {

//                 pages.push(page);

//             }


//             if (end < total) {

//                 if (end < total - 1) {
//                     pages.push('...');
//                 }

//                 pages.push(total);

//             }

//             return pages;

//         }

//     },


//     watch: {

//         /*
//          * ============================================================
//          * CUALQUIER CAMBIO EN LOS FILTROS
//          * ============================================================
//          */

//         selectedFilters: {

//             deep: true,

//             handler() {

//                 this.currentPage = 1;

//             }

//         },


//         /*
//          * ============================================================
//          * CAMBIO EN EL BUSCADOR
//          * ============================================================
//          */

//         searchQuery() {

//             this.currentPage = 1;

//         },


//         /*
//          * ============================================================
//          * CAMBIO DEL DATASET DESDE EL PADRE
//          * ============================================================
//          */

//         items() {

//             this.currentPage = 1;

//         },


//         /*
//          * ============================================================
//          * PROTECCION CONTRA PAGINA FUERA DE RANGO
//          * ============================================================
//          */

//         totalPages(value) {

//             if (this.currentPage > value) {

//                 this.currentPage = value;

//             }

//         }

//     },


//     methods: {

//         /*
//          * ============================================================
//          * VISIBILIDAD DE FILTROS EN CASCADA
//          *
//          * Permite mostrar progresivamente los filtros
//          * según las selecciones anteriores.
//          *
//          * showAfterSelection:
//          * Muestra el filtro cuando se selecciona
//          * una opción en el filtro anterior.
//          *
//          * hideWhenEmpty:
//          * Oculta el filtro cuando no tiene opciones.
//          * ============================================================
//          */

//         shouldShowFilter(field, index) {

//             /*
//              * Verificar selección del filtro anterior.
//              */

//             if (field.showAfterSelection) {

//                 const previousField =
//                     this.normalizedFilterFields[index - 1];

//                 if (
//                     !previousField ||
//                     !this.selectedFilters[previousField.key]
//                 ) {

//                     return false;

//                 }

//             }


//             /*
//              * Verificar si existen opciones disponibles.
//              */

//             if (field.hideWhenEmpty) {

//                 const options =
//                     this.filterOptions[field.key] || [];

//                 if (!options.length) {

//                     return false;

//                 }

//             }

//             return true;

//         },


//         /*
//          * ============================================================
//          * CAMBIO DE SELECT
//          * ============================================================
//          */

//         onFilterChange(fieldKey) {

//             const changedIndex =
//                 this.normalizedFilterFields.findIndex(
//                     field => field.key === fieldKey
//                 );

//             if (changedIndex === -1) {
//                 return;
//             }


//             /*
//              * Limpia los filtros posteriores.
//              */

//             for (
//                 let i = changedIndex + 1;
//                 i < this.normalizedFilterFields.length;
//                 i++
//             ) {

//                 const field =
//                     this.normalizedFilterFields[i];

//                 this.selectedFilters[field.key] = '';

//             }

//             this.currentPage = 1;

//         },


//         /*
//          * ============================================================
//          * CAMBIAR PAGINA
//          * ============================================================
//          */

//         goToPage(page) {

//             const targetPage =
//                 Number(page);

//             if (
//                 !Number.isInteger(targetPage) ||
//                 targetPage < 1 ||
//                 targetPage > this.totalPages
//             ) {

//                 return;

//             }

//             this.currentPage =
//                 targetPage;

//         }

//     },


//     template: `

//         <div class="space-y-6">

//             <!-- =====================================================
//                 FILTROS
//                 ===================================================== -->

//             <div
//                 v-if="normalizedFilterFields.length || searchFields.length"
//                 class="listing-filters max-w-7xl mx-auto px-16 py-8"
//             >

//                 <!-- SELECTS -->

//                 <div class="listing-filters-grid">

//                     <template
//                         v-for="(field, index) in normalizedFilterFields"
//                         :key="field.key"
//                     >

//                         <div
//                             v-if="shouldShowFilter(field, index)"
//                             class="listing-filter-item"
//                         >

//                             <select-gob
//                                 v-model="selectedFilters[field.key]"
//                                 :label="field.label"
//                                 :placeholder="field.placeholder || 'Todas'"
//                                 :options="filterOptions[field.key] || []"
//                                 @update:modelValue="onFilterChange(field.key)"
//                             >
//                             </select-gob>

//                         </div>

//                     </template>

//                 </div>


//                 <!-- BUSCADOR -->

//                 <div
//                     v-if="searchFields.length"
//                     class="listing-search"
//                 >

//                     <search-input
//                         v-model="searchQuery"
//                         label="Buscar"
//                         placeholder="Buscar"
//                     >
//                     </search-input>

//                 </div>

//             </div>


//             <!-- =====================================================
//                  RESUMEN + EXPORTACION
//                  ===================================================== -->

//             <div
//                 class="
//                     max-w-7xl
//                     mx-auto
//                     px-16
//                     flex
//                     flex-col
//                     md:flex-row
//                     items-start
//                     md:items-center
//                     justify-between
//                     gap-4
//                 "
//             >

//                 <listing-summary
//                     :page="currentPage"
//                     :total-pages="totalPages"
//                     :visible="visibleItems"
//                     :total="totalItems"
//                     :label="itemLabel"
//                 >
//                 </listing-summary>


//                 <div class="flex gap-2">

//                     <div class="flex items-center">

//                         <span class="filter-label">
//                             Descargar:
//                         </span>

//                     </div>


//                     <export-excel-button
//                         :data="filteredRows"
//                         :columns="resolvedExportColumns"
//                         :filename="filename"
//                     >
//                     </export-excel-button>


//                     <export-pdf-button
//                         :data="filteredRows"
//                         :columns="resolvedExportColumns"
//                         :filename="filename"
//                     >
//                     </export-pdf-button>

//                 </div>

//             </div>


//             <!-- =====================================================
//                  RESULTADOS

//                  EL COMPONENTE NO SABE SI SON CARDS O TABLA.
//                  EL PADRE DECIDE MEDIANTE EL SLOT.
//                  ===================================================== -->

//             <div>

//                 <slot
//                     name="results"
//                     :items="paginatedRows"
//                     :filtered-items="filteredRows"
//                     :page="currentPage"
//                     :total-pages="totalPages"
//                 >

//                     <div
//                         v-if="!paginatedRows.length"
//                         class="py-8 text-center text-gray-500"
//                     >
//                         No se encontraron resultados.
//                     </div>

//                 </slot>

//             </div>


//             <!-- =====================================================
//                  PAGINACION
//                  ===================================================== -->

//             <nav
//                 v-if="totalPages > 1"
//                 class="pagination-gob"
//             >

//                 <button
//                     :disabled="currentPage === 1"
//                     @click="
//                         goToPage(currentPage - 1)
//                     "
//                 >
//                     Anterior
//                 </button>


//                 <template
//                     v-for="(page, index) in pages"
//                     :key="index"
//                 >

//                     <button
//                         v-if="page !== '...'"
//                         @click="goToPage(page)"
//                         :class="{
//                             active:
//                                 page === currentPage
//                         }"
//                     >
//                         {{ page }}
//                     </button>


//                     <span v-else>
//                         ...
//                     </span>

//                 </template>


//                 <button
//                     :disabled="
//                         currentPage === totalPages
//                     "
//                     @click="
//                         goToPage(currentPage + 1)
//                     "
//                 >
//                     Siguiente
//                 </button>

//             </nav>

//         </div>

//     `

// };