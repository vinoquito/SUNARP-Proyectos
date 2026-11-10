// js/content.js

const TEMPLATE_MAP = {
    'content-page': 'content-page-template',
    'detail-page': 'detail-page-template'
};

const CONFIG = {
    appId: 'intranet'
};

const app = createBaseApp({

    data() {

        return {

            loading: true,

            page: null,

            blocks: [],

            breadcrumbItems: [],

            sidebarPrimary: [],

            sidebarSecondary: [],

            socialItems: [],

            brand: {},

            record: null,

            detailConfig: [],

            codigo: ''

        };

    },


    async mounted() {

        await this.loadPage();

        window.addEventListener(
            'hashchange',
            this.loadPage
        );

    },


    beforeUnmount() {

        window.removeEventListener(
            'hashchange',
            this.loadPage
        );

    },


    methods: {

        /*
         * ============================================================
         * OBTENER NOMBRE DE LA PÁGINA
         *
         * Ejemplo:
         *
         * #detalle-portafolio-institucional-innovacion-publica?codigo=I-001
         *
         * devuelve:
         *
         * detalle-portafolio-institucional-innovacion-publica
         * ============================================================
         */

        getPageName() {

            const hash =
                location.hash.slice(1);

            return (
                hash.split('?')[0] ||
                'index'
            );

        },


        /*
         * ============================================================
         * OBTENER PARÁMETROS DEL HASH
         * ============================================================
         */

        getHashParams() {

            const hash =
                location.hash.slice(1);

            const query =
                hash.includes('?')
                    ? hash.substring(
                        hash.indexOf('?') + 1
                    )
                    : '';

            return new URLSearchParams(query);

        },


        /*
         * ============================================================
         * NORMALIZAR TEXTO
         *
         * Permite comparar:
         *
         * codigo
         * Código
         * CÓDIGO
         *
         * como el mismo campo.
         * ============================================================
         */

        normalizeKey(value) {

            return String(value ?? '')
                .normalize('NFD')
                .replace(
                    /[\u0300-\u036f]/g,
                    ''
                )
                .toLowerCase()
                .replace(
                    /[^a-z0-9]/g,
                    ''
                );

        },


        /*
         * ============================================================
         * OBTENER CONFIGURACIÓN DE DETALLE
         *
         * Busca las hojas de configuración registradas en "pages".
         *
         * Una hoja se considera configuración cuando su nombre
         * termina en "-config".
         *
         * Luego busca dentro de esas hojas las filas cuyo campo
         * "page" corresponde a la página actual.
         * ============================================================
         */

        async getDetailConfig(pageName) {

            const pagesRows =
                await fetchSheet('pages');

            const configNames =
                pagesRows

                    .map(row =>
                        String(
                            row.name ?? ''
                        ).trim()
                    )

                    .filter(name =>
                        name &&
                        name
                            .toLowerCase()
                            .endsWith('-config')
                    );

            if (!configNames.length) {
                return [];
            }

            const configResults =
                await Promise.all(
                    configNames.map(
                        name =>
                            fetchSheet(name)
                    )
                );

            const configRows = [];

            configResults.forEach(rows => {

                rows.forEach(row => {

                    const rowPage =
                        String(
                            row.page ?? ''
                        ).trim();

                    if (
                        this.normalizeKey(
                            rowPage
                        ) ===
                        this.normalizeKey(
                            pageName
                        )
                    ) {

                        configRows.push(row);

                    }

                });

            });

            return configRows.sort(
                (a, b) =>
                    Number(a.order || 0) -
                    Number(b.order || 0)
            );

        },


        /*
         * ============================================================
         * OBTENER REGISTRO
         *
         * El nombre del parámetro de la URL se utiliza para encontrar
         * automáticamente el campo correspondiente en el registro.
         *
         * Ejemplo:
         *
         * ?codigo=I-001
         *
         * busca un campo:
         *
         * Código
         *
         * ============================================================
         */

        getRecord(rows, params) {

            if (
                !rows.length ||
                !params
            ) {
                return null;
            }

            const entries = [
                ...params.entries()
            ];

            if (!entries.length) {
                return null;
            }

            /*
             * Actualmente el detalle recibe "codigo".
             *
             * Se toma el primer parámetro para identificar
             * el registro.
             */

            const [
                paramName,
                paramValue
            ] = entries[0];

            if (!paramValue) {
                return null;
            }

            /*
             * Buscar automáticamente el campo cuyo nombre
             * corresponde al parámetro.
             */

            const firstRow =
                rows[0];

            const keyField =
                Object.keys(firstRow).find(
                    field =>
                        this.normalizeKey(field) ===
                        this.normalizeKey(paramName)
                );

            if (!keyField) {
                return null;
            }

            return rows.find(row =>
                String(
                    row[keyField] ?? ''
                ).trim() ===
                String(
                    paramValue
                ).trim()
            ) || null;

        },


        /*
         * ============================================================
         * CARGAR PÁGINA
         * ============================================================
         */

        async loadPage() {

            try {

                this.loading = true;

                /*
                 * Limpiar información anterior.
                 *
                 * Importante cuando se cambia de página o de registro
                 * mediante hash.
                 */

                this.page = null;

                this.blocks = [];

                this.record = null;

                this.detailConfig = [];

                this.codigo = '';


                const pageName =
                    this.getPageName();

                const params =
                    this.getHashParams();


                const [

                    page,

                    breadcrumbItems,

                    sidebar,

                    socialItems,

                    brand,

                    rows

                ] = await Promise.all([

                    getPage(pageName),

                    getBreadcrumb(pageName),

                    getSidebarData(),

                    getSocialData(),

                    getBrandData(),

                    fetchSheet(pageName)

                ]);


                this.page =
                    page;

                this.breadcrumbItems =
                    breadcrumbItems;

                this.brand =
                    brand;

                this.sidebarPrimary =
                    sidebar.primary;

                this.sidebarSecondary =
                    sidebar.secondary;

                this.socialItems =
                    socialItems;


                /*
                 * ====================================================
                 * PÁGINA DE DETALLE
                 * ====================================================
                 */

                if (
                    page?.template ===
                    'detail-page'
                ) {

                    /*
                     * Obtener parámetro.
                     */

                    const entries = [
                        ...params.entries()
                    ];

                    if (entries.length) {

                        this.codigo =
                            entries[0][1];

                    }


                    /*
                     * Buscar registro.
                     */

                    this.record =
                        this.getRecord(
                            rows,
                            params
                        );


                    /*
                     * Obtener configuración.
                     */

                    this.detailConfig =
                        await this.getDetailConfig(
                            pageName
                        );

                }


                /*
                 * ====================================================
                 * PÁGINA DE CONTENIDO NORMAL
                 * ====================================================
                 */

                else {

                    this.blocks =
                        getPageContent(rows);

                }


                await this.$nextTick();


                if (window.initFlowbite) {

                    initFlowbite();

                }

            } catch (error) {

                console.error(
                    'Error loading page:',
                    error
                );

            } finally {

                this.loading = false;

            }

        },


        /*
         * ============================================================
         * OBTENER TEMPLATE
         * ============================================================
         */

        getTemplate(page) {

            return (
                TEMPLATE_MAP[
                    page?.template
                ] ||
                'content-page-template'
            );

        }

    }

});


registerGlobalComponents(app);

app.component(
    'breadcrumb',
    Breadcrumb
);

app.component(
    'page-header',
    PageHeader
);

app.component(
    'content-renderer',
    ContentRenderer
);

app.component(
    'content-page-template',
    ContentPageTemplate
);

app.component(
    'detail-page-template',
    DetailPageTemplate
);

app.component(
    'accordion',
    Accordion
);

app.component(
    'data-list',
    DataList
);

app.component(
    'card-list',
    CardList
);

app.component(
    'card-grid',
    CardGrid
);

app.component(
    'card-grid-compact',
    CardGridCompact
);

app.component(
    'card-vertical-desc',
    CardVerticalDesc
);

app.component(
    'card-vertical-simple',
    CardVerticalSimple
);

app.component(
    'info-card',
    InfoCard
);

app.component(
    'app-slider',
    Slider
);

app.component(
    'data-table',
    DataTable
);

app.component(
    'app-select',
    AppSelect
);

app.component(
    'app-input-search',
    AppInputSearch
);

app.component(
    'listing-block',
    ListingBlock
);

app.component(
    'app-button',
    AppButton
);

app.component(
    'export-excel-button',
    ExportExcelButton
);

app.component(
    'export-pdf-button',
    ExportPdfButton
);

app.component(
    'app-badge',
    AppBadge
);

app.mount('#app');

// // js/content.js

// const TEMPLATE_MAP = {
//     'content-page': 'content-page-template',
//     'detail-page': 'detail-page-template'
// };

// const CONFIG = {
//     appId: 'intranet'
// };

// const app = createBaseApp({
//     data() {
//         return {
//             loading: true,
//             page: null,
//             blocks: [],
//             breadcrumbItems: [],
//             sidebarPrimary: [],
//             sidebarSecondary: [],
//             socialItems: [],
//             brand: {}
//         };
//     },

//     async mounted() {
//         await this.loadPage();
//         window.addEventListener('hashchange', this.loadPage);
//     },

//     beforeUnmount() {
//         window.removeEventListener('hashchange', this.loadPage);
//     },

//     methods: {
//         getPageName() {
//             return location.hash.slice(1) || 'index';
//         },

//         async loadPage() {
//             try {
//                 this.loading = true;
//                 const pageName = this.getPageName();

//                 const [
//                     page,
//                     breadcrumbItems,
//                     sidebar,
//                     socialItems,
//                     brand,
//                     rows
//                 ] = await Promise.all([
//                     getPage(pageName),
//                     getBreadcrumb(pageName),
//                     getSidebarData(),
//                     getSocialData(),
//                     getBrandData(),
//                     fetchSheet(pageName)
//                 ]);

//                 this.page = page;
//                 this.breadcrumbItems = breadcrumbItems;
//                 this.brand = brand;
//                 this.sidebarPrimary = sidebar.primary;
//                 this.sidebarSecondary = sidebar.secondary;
//                 this.socialItems = socialItems;
//                 this.blocks = getPageContent(rows);

//                 await this.$nextTick();

//                 if (window.initFlowbite) {
//                     initFlowbite();
//                 }

//             } catch (error) {
//                 console.error('Error loading page:', error);
//             } finally {
//                 this.loading = false;
//             }
//         },

//         getTemplate(page) {
//             return TEMPLATE_MAP[page?.template] || 'content-page-template';
//         }
//     }
// });

// registerGlobalComponents(app);

// app.component('breadcrumb', Breadcrumb);
// app.component('page-header', PageHeader);
// app.component('content-renderer', ContentRenderer);
// app.component('content-page-template', ContentPageTemplate);
// app.component('detail-page-template', DetailPageTemplate);
// app.component('accordion', Accordion);
// app.component('data-list', DataList);
// app.component('card-list', CardList);
// app.component('card-grid', CardGrid);
// app.component('card-grid-compact', CardGridCompact);
// app.component('card-vertical-desc', CardVerticalDesc);
// app.component('card-vertical-simple', CardVerticalSimple);
// app.component('info-card', InfoCard);
// app.component('app-slider', Slider);
// app.component('data-table', DataTable);
// app.component('app-select', AppSelect);
// app.component('app-input-search', AppInputSearch);
// app.component('listing-block', ListingBlock);
// app.component('app-button', AppButton);
// app.component('export-excel-button', ExportExcelButton);
// app.component('export-pdf-button', ExportPdfButton);

// app.mount('#app');