const PAGE_NAME = 'directorio-telefonico';

const CONFIG = {
    appId: 'directorio-telefonico'
};

const app = createBaseApp({

    data() {

        return {

            loading: true,

            pageData: {},

            navbarData: {
                template: '',
                items: []
            },

            footerData: {
                template: '',
                items: []
            },

            /*
             * ========================================================
             * REGISTROS DEL DIRECTORIO TELEFÓNICO
             * ========================================================
             */

            directory: [],


            /*
             * ========================================================
             * CONFIGURACIÓN DE TABLEDEFAULT
             * ========================================================
             */

            directoryTableColumns: [

                /*
                 * NOMBRE COMPLETO
                 */

                {
                    key: 'nombreCompleto',
                    label: 'Nombre',
                    value: item => [

                        item.nombres,

                        item.apellidos

                    ].filter(Boolean).join(' ')
                },


                /*
                 * CARGO
                 */

                {
                    key: 'cargo',
                    label: 'Cargo'
                },


                /*
                 * SEDE + LOCAL
                 */

                {
                    key: 'sedeDetalle',
                    label: 'Sede',
                    parts: item => ({
                        primary: item.sede,
                        secondary: [
                            item.local,
                            item.referencia
                        ]
                    }),
                    class: 'table-default-hierarchy-cell'
                },


                /*
                * ESTRUCTURA ORGANIZACIONAL
                */

                {
                    key: 'estructura',
                    label: 'Órgano / Unidad',

                    parts: item => {

                        /*
                        * Obtener los niveles organizacionales
                        * ordenados jerárquicamente.
                        */

                        const levels = Object.keys(item)

                            .filter(key =>
                                /^estructura_nivel_\d+$/i.test(key)
                            )

                            .sort((a, b) =>

                                Number(a.match(/\d+$/)[0]) -
                                Number(b.match(/\d+$/)[0])

                            )

                            .map(key => item[key])

                            .filter(value =>
                                value !== undefined &&
                                value !== null &&
                                String(value).trim() !== ''
                            );


                        /*
                        * Alternativa: utilizar Órgano / Unidad
                        * cuando no existen niveles separados.
                        */

                        const fallbackLevels = String(item.organo || '')

                            .split(/\s*\/\s*/)

                            .filter(value => value.trim() !== '');


                        /*
                        * Determinar los niveles definitivos.
                        */

                        const resolvedLevels = levels.length
                            ? levels
                            : fallbackLevels;


                        /*
                        * Separar jerarquía principal y secundaria.
                        */

                        return {

                            primary: resolvedLevels[0] || '',

                            secondary: resolvedLevels.slice(1)

                        };

                    },

                    class: 'table-default-hierarchy-cell'
                },

                /*
                 * ANEXO
                 */

                {
                    key: 'anexo',
                    label: 'Anexo',
                    nowrap: true
                }

            ],


            /*
             * ========================================================
             * CONFIGURACIÓN DE FILTROS
             * ========================================================
             */

            directoryFilterFields: [],


            /*
             * ========================================================
             * CONFIGURACIÓN DEL BUSCADOR
             * ========================================================
             */

            directorySearchFields: [],


            /*
             * ========================================================
             * CONFIGURACIÓN DE EXPORTACIÓN
             * ========================================================
             */

            directoryExportColumns: [

                {
                    key: 'nombreCompleto',
                    label: 'Nombre',
                    value: item => [

                        item.nombres,

                        item.apellidos

                    ].filter(Boolean).join(' ')
                },

                {
                    key: 'cargo',
                    label: 'Cargo'
                },

                {
                    key: 'sede',
                    label: 'Sede'
                },

                {
                    key: 'local',
                    label: 'Local'
                },

                {
                    key: 'referencia',
                    label: 'Referencia'
                },

                {
                    key: 'organo',
                    label: 'Órgano / Unidad'
                },

                {
                    key: 'anexo',
                    label: 'Anexo'
                }

            ]

        };

    },


    /*
     * ================================================================
     * MOUNTED
     * ================================================================
     */

    async mounted() {

        try {

            const [

                pageData,

                navbarData,

                footerData,

                rows

            ] = await Promise.all([

                getPage(PAGE_NAME),

                getNavbarData(PAGE_NAME),

                getFooterData(PAGE_NAME),

                fetchSheet(PAGE_NAME)

            ]);


            this.pageData = pageData;

            this.navbarData = navbarData;

            this.footerData = footerData;


            /*
             * ========================================================
             * REGISTROS ACTIVOS
             * ========================================================
             */

            const activeRows =

                (Array.isArray(rows) ? rows : [])

                    .filter(i =>

                        String(i.page || '').trim() === PAGE_NAME &&

                        String(i.state || '')
                            .trim()
                            .toLowerCase() === 'activo' &&

                        String(i.id ?? '').trim() !== ''

                    );


            /*
             * ========================================================
             * DETECTAR NIVELES ORGANIZACIONALES
             * ========================================================
             */

            const structureLevelKeys = [

                ...new Set(

                    activeRows

                        .flatMap(i => Object.keys(i))

                )

            ]

                .filter(key =>
                    /^estructura_nivel_\d+$/i.test(key)
                )

                .sort((a, b) =>

                    Number(a.match(/\d+$/)[0]) -

                    Number(b.match(/\d+$/)[0])

                );


            /*
             * ========================================================
             * TRANSFORMAR REGISTROS
             * ========================================================
             */

            this.directory = activeRows.map(i => {

                const item = {

                    id: i.id,


                    /*
                     * PERSONA
                     */

                    nombres: i.Nombres || i.nombres || '',

                    apellidos: i.Apellidos || i.apellidos || '',


                    /*
                     * CARGO
                     */

                    cargo: i.Cargo || i.cargo || '',


                    /*
                     * SEDE
                     */

                    sede: i.Sede || i.sede || '',


                    /*
                     * LOCAL / EDIFICIO
                     *
                     * Se consideran posibles encabezados
                     * de la hoja ensamblada.
                     */

                    local:

                        i.local ||

                        i.Local ||

                        i.local_nombre ||

                        i.nombre_local ||

                        i['Nombre del local'] ||

                        '',


                    /*
                     * REFERENCIA DEL LOCAL
                     *
                     * Ejemplo: 5.° piso
                     */

                    referencia:

                        i.referencia ||

                        i.Referencia ||

                        i['Referencia del local'] ||

                        '',


                    /*
                     * ÓRGANO / UNIDAD
                     */

                    organo:

                        i['Órgano / Unidad'] ||

                        i.organo ||

                        i['Organo / Unidad'] ||

                        '',


                    /*
                     * ANEXO
                     */

                    anexo: i.Anexo || i.anexo || '',


                    template: 'table-default'

                };


                /*
                 * Agregar niveles organizacionales
                 * conservando sus claves originales.
                 */

                structureLevelKeys.forEach(key => {

                    item[key] = i[key] || '';

                });


                return item;

            });


            /*
             * ========================================================
             * CONFIGURACIÓN DE FILTROS
             * ========================================================
             */

            this.directoryFilterFields = [

                /*
                 * SEDE
                 */

                {
                    key: 'sede',
                    label: 'Sede',
                    placeholder: 'Todas las sedes'
                },


                /*
                 * NIVELES ORGANIZACIONALES
                 */

                ...structureLevelKeys.map((key, index) => {

                    let label;


                    switch (index) {

                        case 0:

                            label = 'Órgano / unidad principal';

                            break;


                        case 1:

                            label = 'Dependencia';

                            break;


                        case 2:

                            label = 'Subdependencia';

                            break;


                        case 3:

                            label = 'Área / servicio';

                            break;


                        default:

                            label = `Estructura (nivel ${index + 1})`;

                            break;

                    }


                    return {

                        key,

                        label,

                        placeholder: 'Todas',

                        showAfterSelection: true,

                        hideWhenEmpty: true

                    };

                }),


                /*
                 * CARGO
                 */

                {
                    key: 'cargo',
                    label: 'Cargo',
                    placeholder: 'Todos los cargos'
                }

            ];


            /*
             * ========================================================
             * CONFIGURACIÓN DEL BUSCADOR
             * ========================================================
             */

            this.directorySearchFields = [

                'nombres',

                'apellidos',

                'cargo',

                'sede',

                'local',

                'referencia',

                'organo',

                'anexo',

                ...structureLevelKeys

            ];


            /*
             * ========================================================
             * FINALIZAR CARGA
             * ========================================================
             */

            await this.$nextTick();

            this.loading = false;


        } catch (e) {

            console.error(
                'Error al cargar el directorio telefónico:',
                e
            );

            this.loading = false;

        }

    }

});


/*
 * ================================================================
 * COMPONENTES GLOBALES
 * ================================================================
 */

registerGlobalComponents(app);

app.component('navbar-default', NavbarDefault);

app.component('page-header-split', PageHeaderSplit);

app.component('footer-default', FooterDefault);


/*
 * ================================================================
 * LISTING
 * ================================================================
 */

app.component('listing-block', ListingBlock);


/*
 * Componentes utilizados internamente por ListingBlock
 */

app.component('search-input', SearchInput);

app.component('select-gob', SelectGob);

app.component('listing-summary', Summary);

app.component('pagination', Pagination);

app.component('pagination-default', PaginationDefault);

app.component('clear-filters-button', ClearFiltersButton);


/*
 * ================================================================
 * TABLAS
 * ================================================================
 */

app.component('data-table', DataTable);

app.component('table-default', TableDefault);


/*
 * ================================================================
 * BOTONES DE EXPORTACIÓN
 * ================================================================
 */

app.component('app-button', AppButton);

app.component('export-excel-button', ExportExcelButton);

app.component('export-pdf-button', ExportPdfButton);


/*
 * ================================================================
 * MONTAR APLICACIÓN
 * ================================================================
 */

app.mount('#app');