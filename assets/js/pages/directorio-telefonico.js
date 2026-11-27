const PAGE_NAME = 'directorio-telefonico';

const CONFIG = {
    appId: 'directorio-telefonico'
};


/*
 * Devuelve la jerarquía organizacional para las tablas telefónicas.
 * Mantiene el mismo criterio visual del directorio de personal.
 */
function getDirectoryStructureParts(item) {

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

    const fallbackLevels = String(item.organo || '')

        .split(/\s*\/\s*/)

        .filter(value => value.trim() !== '');

    const resolvedLevels = levels.length
        ? levels
        : fallbackLevels;

    return {

        primary: resolvedLevels[0] || '',

        secondary: resolvedLevels.slice(1)

    };

}

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
             * REGISTROS TELEFÓNICOS PUBLICADOS EN CSV
             */

            directPhones: [],

            annexEnvironmentRecords: [],

            /*
             * SELECCIONES DEL LISTADO PRINCIPAL
             */

            selectedDirectoryFilters: {},

            // Estado de exportación conservado en la aplicación de la página.
            isExportingPdf: false,

            /*
             * ========================================================
             * ELEMENTOS CONFIGURADOS PARA LA PÁGINA
             * ========================================================
             */

            pageElementLinks: [],


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
                 * TELÉFONO
                 */

                {
                    key: 'telefono',
                    label: 'Teléfono',
                    nowrap: true
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
             * COLUMNAS DE TELÉFONOS DIRECTOS
             * ========================================================
             */

            directPhoneTableColumns: [

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

                {
                    key: 'estructura',
                    label: 'Órgano / Unidad',
                    parts: item => getDirectoryStructureParts(item),
                    class: 'table-default-hierarchy-cell'
                },

                {
                    key: 'numero',
                    label: 'Teléfono',
                    nowrap: true
                }

            ],


            /*
             * ========================================================
             * COLUMNAS DE ANEXOS DE AMBIENTES Y SERVICIOS
             * ========================================================
             */

            annexEnvironmentTableColumns: [

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

                {
                    key: 'estructura',
                    label: 'Órgano / Unidad',
                    parts: item => getDirectoryStructureParts(item),
                    class: 'table-default-hierarchy-cell'
                },

                {
                    key: 'ambiente',
                    label: 'Ambiente'
                },

                {
                    key: 'numero',
                    label: 'Teléfono de acceso',
                    nowrap: true
                },

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
                    key: 'telefonoExport',
                    label: 'Teléfono'
                },

                {
                    key: 'anexo',
                    label: 'Anexo'
                }

            ],

            /*
             * COLUMNAS DEL PDF: LOS DATOS DE UBICACIÓN Y DEPENDENCIA
             * SE REPRESENTAN COMO TÍTULOS DE AGRUPACIÓN.
             */

            directoryPdfColumns: [

                {
                    key: 'nombreCompleto',
                    label: 'Nombre',
                    width: 62,
                    value: item => [
                        item.nombres,
                        item.apellidos
                    ].filter(Boolean).join(' ')
                },

                {
                    key: 'cargo',
                    label: 'Cargo',
                    width: 58
                },

                {
                    key: 'telefonoExport',
                    label: 'Teléfono',
                    width: 40
                },

                {
                    key: 'anexo',
                    label: 'Anexo',
                    width: 20
                }

            ],

            /*
             * COLUMNAS DE EXCEL: TELÉFONOS DIRECTOS.
             */

            directPhoneExportColumns: [

                { key: 'sede', label: 'Sede' },
                { key: 'local', label: 'Local' },
                { key: 'referencia', label: 'Referencia' },
                { key: 'organo', label: 'Órgano / Unidad' },
                { key: 'numero', label: 'Teléfono' }

            ],

            /*
             * COLUMNAS DE PDF: TELÉFONOS DIRECTOS.
             */

            directPhonePdfColumns: [

                { key: 'numero', label: 'Teléfono', width: 55 }

            ],

            /*
             * COLUMNAS DE EXCEL: ANEXOS DE AMBIENTES Y SERVICIOS.
             */

            annexEnvironmentExportColumns: [

                { key: 'sede', label: 'Sede' },
                { key: 'local', label: 'Local' },
                { key: 'referencia', label: 'Referencia' },
                { key: 'organo', label: 'Órgano / Unidad' },
                { key: 'ambiente', label: 'Ambiente' },
                { key: 'numero', label: 'Teléfono de acceso' },
                { key: 'anexo', label: 'Anexo' }

            ],

            /*
             * COLUMNAS DE PDF: ANEXOS DE AMBIENTES Y SERVICIOS.
             */

            annexEnvironmentPdfColumns: [

                { key: 'ambiente', label: 'Ambiente', width: 65 },
                { key: 'numero', label: 'Teléfono de acceso', width: 70 },
                { key: 'anexo', label: 'Anexo', width: 25 }

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

                rows,

                pageElements,

                directPhoneRows,

                annexEnvironmentRows

            ] = await Promise.all([

                getPage(PAGE_NAME),

                getNavbarData(PAGE_NAME),

                getFooterData(PAGE_NAME),

                fetchSheet(PAGE_NAME),

                fetchSheet('page-elements'),

                fetchSheet('data-telefonos').catch(error => {

                    console.error(
                        'No se pudieron cargar los teléfonos directos:',
                        error
                    );

                    return [];

                }),

                fetchSheet('data-anexos-ambientes').catch(error => {

                    console.error(
                        'No se pudieron cargar los anexos de ambientes:',
                        error
                    );

                    return [];

                })

            ]);


            this.pageData = pageData;

            this.navbarData = navbarData;

            this.footerData = footerData;


            /*
             * ========================================================
             * ENLACES RELACIONADOS
             * ========================================================
             */

            this.pageElementLinks =

                (Array.isArray(pageElements) ? pageElements : [])

                    .filter(i =>

                        String(i.page || '').trim() === PAGE_NAME &&

                        String(i.group || '').trim() === 'Enlaces relacionados' &&

                        String(i.block || '').trim() === 'featured-links' &&

                        String(i.type || '').trim() === 'list' &&

                        String(i.state || '').trim().toLowerCase() === 'activo' &&

                        String(i.url_destination || '').trim() !== ''

                    )

                    .sort((a, b) =>

                        Number(a.order || 0) - Number(b.order || 0)

                    );


            /*
             * ========================================================
             * REGISTROS ACTIVOS
             * ========================================================
             */

            const activeRows =

                (Array.isArray(rows) ? rows : [])

                    .filter(i =>

                        String(i.page || '').trim() === PAGE_NAME &&

                        (i.active === true || String(i.active || '').trim().toLowerCase() === 'true') &&

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

                    // Identificadores necesarios para agrupar por ubicación física.
                    local_id: i.local_id || '',
                    estructura_local_id: i.estructura_local_id || '',


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
                     * TELÉFONO
                     */

                    telefono: i.Telefono || i.telefono || '',


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
             * REGISTROS DE TELÉFONOS DIRECTOS
             * ========================================================
             */

            const isActivePublishedRow = row =>

                String(row.page || '').trim() === PAGE_NAME &&

                (
                    row.active === true ||
                    String(row.active || '').trim().toLowerCase() === 'true'
                ) &&

                String(row.id ?? '').trim() !== '';


            const mapLocationFields = row => {

                const item = {

                    id: row.id,

                    // Identificadores físicos para mantener separadas las ubicaciones.
                    local_id: row.local_id || '',
                    estructura_local_id: row.estructura_local_id || '',

                    sede: row.Sede || row.sede || '',

                    local: row.Local || row.local || '',

                    referencia: row.Referencia || row.referencia || '',

                    organo:
                        row['Órgano / Unidad'] ||
                        row.organo ||
                        row['Organo / Unidad'] ||
                        '',

                    template: 'table-default'

                };

                structureLevelKeys.forEach(key => {

                    item[key] = row[key] || '';

                });

                return item;

            };


            this.directPhones =

                (Array.isArray(directPhoneRows) ? directPhoneRows : [])

                    .filter(isActivePublishedRow)

                    .map(row => ({

                        ...mapLocationFields(row),

                        numero: row.numero || row.Telefono || ''

                    }));


            /*
             * ========================================================
             * REGISTROS DE ANEXOS DE AMBIENTES Y SERVICIOS
             * ========================================================
             */

            this.annexEnvironmentRecords =

                (Array.isArray(annexEnvironmentRows) ? annexEnvironmentRows : [])

                    .filter(isActivePublishedRow)

                    .map(row => ({

                        ...mapLocationFields(row),

                        ambiente: row.ambiente || row.Ambiente || '',

                        numero: row.numero || row.Telefono || '',

                        anexo: row.Anexo || row.anexo || ''

                    }));


            /*
             * TELÉFONO PARA EXPORTACIÓN
             *
             * En el directorio de personal se deja el teléfono general.
             * Los números directos se publican en su sección independiente.
             * No se modifica el teléfono que utiliza la tabla en pantalla.
             */

            this.directory = this.directory.map(item => ({

                ...item,

                telefonoExport: this.getDirectoryPhoneForExport(item)

            }));


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
                 * LOCAL
                 */

                {
                    key: 'local',
                    label: 'Local',
                    placeholder: 'Todos los locales',
                    showAfterSelection: true,
                    hideWhenEmpty: true
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

                'telefono',

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

    },

    computed: {

        directoryContextLabel() {

            const selectedValues = this.directoryFilterFields

                .map(field =>
                    typeof field === 'string'
                        ? field
                        : field.key
                )

                .filter(key =>
                    key && key !== 'cargo'
                )

                .map(key =>
                    this.selectedDirectoryFilters[key]
                )

                .filter(value =>
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ''
                );

            return selectedValues.length
                ? selectedValues.join(' · ')
                : 'Todas las sedes';

        },

        directoryTableTitle() {

            return `Directorio de personal — ${this.directoryContextLabel}`;

        },

        directPhoneTableTitle() {

            return `Teléfonos directos — ${this.directoryContextLabel}`;

        },

        annexEnvironmentTableTitle() {

            return `Anexos de ambientes y servicios — ${this.directoryContextLabel}`;

        },

        /*
         * Contexto completo de filtros que se incorpora al encabezado del PDF.
         * Cargo se identifica expresamente porque solo afecta al personal.
         */

        exportContextLabel() {

            const selected = this.directoryFilterFields

                .map(field =>
                    typeof field === 'string'
                        ? { key: field, label: field }
                        : field
                )

                .filter(field =>
                    field.key &&
                    this.selectedDirectoryFilters[field.key] !== undefined &&
                    this.selectedDirectoryFilters[field.key] !== null &&
                    String(this.selectedDirectoryFilters[field.key]).trim() !== ''
                )

                .map(field => {

                    const value = this.selectedDirectoryFilters[field.key];

                    const label = field.key === 'cargo'
                        ? 'Cargo (solo personal)'
                        : field.label;

                    return `${label}: ${value}`;

                });

            return selected.length
                ? selected.join(' · ')
                : 'Todas las sedes';

        },

        /*
         * Secciones adicionales ya filtradas por sede, local y jerarquía.
         * No se les aplica Cargo ni el buscador del directorio, porque
         * esos controles no forman parte de las otras dos tablas.
         */

        additionalExportSections() {

            return [

                {
                    title: 'Teléfonos directos',
                    sheetName: 'Teléfonos directos',
                    data: this.filteredDirectPhones,
                    columns: this.directPhoneExportColumns,
                    pdfColumns: this.directPhonePdfColumns,
                    groupByLocationAndOrg: true
                },

                {
                    title: 'Anexos de ambientes y servicios',
                    sheetName: 'Anexos de ambientes',
                    data: this.filteredAnnexEnvironmentRecords,
                    columns: this.annexEnvironmentExportColumns,
                    pdfColumns: this.annexEnvironmentPdfColumns,
                    groupByLocationAndOrg: true
                }

            ];

        },

        filteredDirectPhones() {

            return this.filterRowsByDirectoryFilters(
                this.directPhones
            );

        },

        filteredAnnexEnvironmentRecords() {

            return this.filterRowsByDirectoryFilters(
                this.annexEnvironmentRecords
            );

        }

    },


    methods: {

        getDirectoryPhoneForExport(item) {

            const directNumbers = new Set(

                this.directPhones

                    .filter(phone => {

                        if (phone.estructura_local_id) {

                            return (
                                phone.estructura_local_id === item.estructura_local_id &&
                                (
                                    !phone.local_id ||
                                    phone.local_id === item.local_id
                                )
                            );

                        }

                        if (phone.local_id) {

                            return (
                                phone.local_id === item.local_id &&
                                (
                                    !phone.sede ||
                                    phone.sede === item.sede
                                )
                            );

                        }

                        return Boolean(
                            phone.sede &&
                            phone.sede === item.sede
                        );

                    })

                    .map(phone => String(phone.numero || '').trim())
                    .filter(Boolean)

            );

            return String(item.telefono || '')

                .split('/')

                .map(number => number.trim())

                .filter(number =>
                    number && !directNumbers.has(number)
                )

                .join(' / ');

        },

        onDirectoryFiltersChange(filters) {

            this.selectedDirectoryFilters = {
                ...filters
            };

        },

        onPdfExportStart() {

            this.isExportingPdf = true;

        },

        onPdfExportEnd() {

            this.isExportingPdf = false;

        },

        filterRowsByDirectoryFilters(rows) {

            const filterKeys = this.directoryFilterFields

                .map(field =>
                    typeof field === 'string'
                        ? field
                        : field.key
                )

                /*
                 * Cargo solo corresponde al directorio de personal.
                 */
                .filter(key =>
                    key && key !== 'cargo'
                );

            return rows.filter(row =>

                filterKeys.every(key => {

                    const selectedValue =
                        this.selectedDirectoryFilters[key];

                    if (!selectedValue) {
                        return true;
                    }

                    return String(row[key] ?? '') === String(selectedValue);

                })

            );

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