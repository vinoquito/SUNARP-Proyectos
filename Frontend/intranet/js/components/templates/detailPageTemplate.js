// js/components/templates/detailPageTemplate.js

const DetailPageTemplate = {

    props: {

        page: {
            type: Object,
            default: () => ({})
        },

        breadcrumbItems: {
            type: Array,
            default: () => []
        },

        record: {
            type: Object,
            default: null
        },

        detailConfig: {
            type: Array,
            default: () => []
        }

    },


    computed: {

        /*
         * ============================================================
         * CONFIGURACIÓN DE LA PÁGINA
         * ============================================================
         */

        pageConfig() {

            if (!this.detailConfig.length) {
                return [];
            }

            return this.detailConfig

                .filter(config =>
                    String(config.page ?? '').trim() ===
                    String(this.page.name ?? '').trim()
                )

                .sort((a, b) =>
                    Number(a.order || 0) -
                    Number(b.order || 0)
                );

        },


        /*
         * ============================================================
         * SECCIÓN DE ENCABEZADO
         *
         * La sección que contenga "Encabezado" se renderiza
         * de forma especial.
         * ============================================================
         */

        headerSection() {

            if (!this.record) {
                return null;
            }

            const configs =
                this.pageConfig.filter(config =>
                    String(
                        config.section ?? ''
                    )
                        .trim()
                        .toLowerCase()
                        .includes('encabezado')
                );

            if (!configs.length) {
                return null;
            }

            const items = [];

            configs.forEach(config => {

                const field =
                    String(
                        config.field ?? ''
                    ).trim();

                if (!field) {
                    return;
                }

                const value =
                    this.record[field];

                if (
                    value === undefined ||
                    value === null ||
                    String(value).trim() === ''
                ) {
                    return;
                }

                items.push({

                    field,

                    label:
                        String(
                            config.label ??
                            field
                        ).trim(),

                    value,

                    type:
                        String(
                            config.type ??
                            'text'
                        ).trim(),

                    order:
                        Number(
                            config.order ||
                            0
                        )

                });

            });

            items.sort(
                (a, b) =>
                    a.order - b.order
            );

            return {

                title:
                    configs[0].section,

                items

            };

        },


        /*
         * ============================================================
         * TÍTULO DEL REGISTRO
         * ============================================================
         */

        headerTitle() {

            if (!this.headerSection) {
                return '';
            }

            const item =
                this.headerSection.items.find(
                    item =>
                        item.type === 'title'
                );

            return item
                ? item.value
                : '';

        },


        /*
         * ============================================================
         * DATOS DEL ENCABEZADO
         *
         * Excluye el elemento usado como título.
         * ============================================================
         */

        headerItems() {

            if (!this.headerSection) {
                return [];
            }

            return this.headerSection.items.filter(
                item =>
                    item.type !== 'title'
            );

        },


        /*
         * ============================================================
         * SECCIONES RESTANTES
         * ============================================================
         */

        detailSections() {

            if (
                !this.record ||
                !this.pageConfig.length
            ) {
                return [];
            }

            const sections = [];
            const sectionMap = {};

            this.pageConfig.forEach(config => {

                const section =
                    String(
                        config.section ?? ''
                    ).trim();

                const field =
                    String(
                        config.field ?? ''
                    ).trim();

                if (
                    !section ||
                    !field
                ) {
                    return;
                }

                /*
                 * El encabezado se procesa aparte.
                 */

                if (
                    section
                        .toLowerCase()
                        .includes('encabezado')
                ) {
                    return;
                }

                const value =
                    this.record[field];

                if (
                    value === undefined ||
                    value === null ||
                    String(value).trim() === ''
                ) {
                    return;
                }

                if (!sectionMap[section]) {

                    sectionMap[section] = {

                        title: section,

                        items: []

                    };

                    sections.push(
                        sectionMap[section]
                    );

                }

                sectionMap[section].items.push({

                    label:
                        String(
                            config.label ??
                            field
                        ).trim(),

                    value,

                    type:
                        String(
                            config.type ??
                            'text'
                        ).trim(),

                    icon:
                        String(
                            config.icon ??
                            ''
                        ).trim(),

                    target:
                        String(
                            config.target ??
                            '_blank'
                        ).trim(),

                    order:
                        Number(
                            config.order ||
                            0
                        )

                });

            });

            sections.forEach(section => {

                section.items.sort(
                    (a, b) =>
                        a.order - b.order
                );

            });

            return sections;

        }

    },


    methods: {

        /*
         * ============================================================
         * VARIANTE DEL BADGE
         *
         * Se aplica cuando el campo es "Estado".
         * ============================================================
         */

        getEstadoVariant(estado) {

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

            return map[estado] ||
                'neutral';

        },


        /*
         * ============================================================
         * DETERMINAR SI UN ITEM ES ESTADO
         * ============================================================
         */

        isEstado(item) {

            const field =
                String(
                    item.field ??
                    ''
                )
                    .normalize('NFD')
                    .replace(
                        /[\u0300-\u036f]/g,
                        ''
                    )
                    .toLowerCase()
                    .trim();

            const label =
                String(
                    item.label ??
                    ''
                )
                    .normalize('NFD')
                    .replace(
                        /[\u0300-\u036f]/g,
                        ''
                    )
                    .toLowerCase()
                    .trim();

            return (
                field === 'estado' ||
                label === 'estado'
            );

        }

    },


    template: `

        <div class="p-4">

            <!-- =====================================================
                 BREADCRUMB
                 ===================================================== -->

            <breadcrumb
                :items="breadcrumbItems"
            >
            </breadcrumb>


            <!-- =====================================================
                 HEADER DE PÁGINA
                 ===================================================== -->

            <page-header
                :title="page.title"
                :subtitle="page.subtitle"
                :description="page.description"
            >
            </page-header>


            <!-- =====================================================
                 DETALLE
                 ===================================================== -->

            <section
                v-if="record"
                class="mt-8"
            >

                <!-- =================================================
                     ENCABEZADO DEL REGISTRO
                     ================================================= -->

                <div
                    v-if="headerSection"
                    class="
                        bg-white
                        border
                        border-gray-200
                        p-6
                        mb-6
                    "
                >

                    <!-- =============================================
                         TÍTULO + ESTADO
                         ============================================= -->

                    <div
                        class="
                            flex
                            flex-col
                            md:flex-row
                            md:items-start
                            md:justify-between
                            gap-4
                        "
                    >

                        <h2
                            v-if="headerTitle"
                            class="
                                text-xl
                                font-bold
                                text-gray-900
                            "
                        >

                            {{ headerTitle }}

                        </h2>


                        <template
                            v-for="item in headerItems"
                            :key="item.field"
                        >

                            <div
                                v-if="isEstado(item)"
                                class="flex items-center gap-2"
                            >
                                <span class="text-sm text-gray-500">
                                    {{ item.label }}:
                                </span>

                                <app-badge
                                    :label="item.value"
                                    :variant="getEstadoVariant(item.value)"
                                >
                                </app-badge>
                            </div>

                        </template>

                    </div>


                    <!-- =============================================
                         RESTO DEL ENCABEZADO
                         ============================================= -->

                    <div
                        v-if="headerItems.some(item => !isEstado(item))"
                        class="
                            grid
                            grid-cols-1
                            md:grid-cols-2
                            gap-6
                            mt-6
                        "
                    >

                        <template
                            v-for="item in headerItems"
                            :key="item.field"
                        >

                            <div
                                v-if="!isEstado(item)"
                            >

                                <div
                                    class="
                                        text-sm
                                        text-gray-500
                                    "
                                >

                                    {{ item.label }}

                                </div>

                                <div
                                    class="
                                        text-gray-700
                                    "
                                >

                                    {{ item.value }}

                                </div>

                            </div>

                        </template>

                    </div>

                </div>


                <!-- =================================================
                     RESTO DE SECCIONES
                     ================================================= -->

                <div
                    class="
                        grid
                        grid-cols-1
                        lg:grid-cols-2
                        gap-6
                    "
                >

                    <info-card
                        v-for="section in detailSections"
                        :key="section.title"
                        :title="section.title"
                        :items="section.items"
                    >
                    </info-card>

                </div>

            </section>


            <!-- =====================================================
                 SIN REGISTRO
                 ===================================================== -->

            <div
                v-else
                class="
                    py-12
                    text-center
                    text-gray-500
                "
            >

                No se encontró el registro solicitado.

            </div>

        </div>

    `

};

// // js/components/templates/detailPageTemplate.js

// const DetailPageTemplate = {

//     props: {

//         page: {
//             type: Object,
//             default: () => ({})
//         },

//         breadcrumbItems: {
//             type: Array,
//             default: () => []
//         },

//         record: {
//             type: Object,
//             default: null
//         },

//         detailConfig: {
//             type: Array,
//             default: () => []
//         }

//     },


//     computed: {

//         /*
//          * ============================================================
//          * CONFIGURACIÓN DEL DETALLE
//          *
//          * Solo toma la configuración correspondiente a la página
//          * actual y respeta el orden definido en la hoja.
//          * ============================================================
//          */

//         pageConfig() {

//             if (!this.detailConfig.length) {
//                 return [];
//             }

//             return this.detailConfig

//                 .filter(config =>
//                     String(config.page ?? '').trim() ===
//                     String(this.page.name ?? '').trim()
//                 )

//                 .sort((a, b) =>
//                     Number(a.order || 0) -
//                     Number(b.order || 0)
//                 );

//         },


//         /*
//          * ============================================================
//          * SECCIONES
//          *
//          * Agrupa los campos según "section".
//          * ============================================================
//          */

//         detailSections() {

//             if (
//                 !this.record ||
//                 !this.pageConfig.length
//             ) {
//                 return [];
//             }

//             const sections = [];
//             const sectionMap = {};

//             this.pageConfig.forEach(config => {

//                 const section =
//                     String(
//                         config.section ?? ''
//                     ).trim();

//                 const field =
//                     String(
//                         config.field ?? ''
//                     ).trim();

//                 if (
//                     !section ||
//                     !field
//                 ) {
//                     return;
//                 }

//                 const value =
//                     this.record[field];

//                 /*
//                  * No mostrar campos vacíos.
//                  */

//                 if (
//                     value === undefined ||
//                     value === null ||
//                     String(value).trim() === ''
//                 ) {
//                     return;
//                 }

//                 /*
//                  * Crear sección si todavía no existe.
//                  */

//                 if (!sectionMap[section]) {

//                     sectionMap[section] = {
//                         title: section,
//                         items: []
//                     };

//                     sections.push(
//                         sectionMap[section]
//                     );

//                 }

//                 /*
//                  * Agregar campo a la sección.
//                  */

//                 sectionMap[section].items.push({

//                     label:
//                         String(
//                             config.label ??
//                             field
//                         ).trim(),

//                     value,

//                     type:
//                         String(
//                             config.type ??
//                             'text'
//                         ).trim(),

//                     icon:
//                         String(
//                             config.icon ??
//                             ''
//                         ).trim(),

//                     target:
//                         String(
//                             config.target ??
//                             '_blank'
//                         ).trim()

//                 });

//             });

//             return sections;

//         }

//     },


//     template: `

//         <div class="p-4">

//             <!-- =====================================================
//                  BREADCRUMB
//                  ===================================================== -->

//             <breadcrumb
//                 :items="breadcrumbItems"
//             >
//             </breadcrumb>


//             <!-- =====================================================
//                  PAGE HEADER
//                  ===================================================== -->

//             <page-header
//                 :title="page.title"
//                 :subtitle="page.subtitle"
//                 :description="page.description"
//             >
//             </page-header>


//             <!-- =====================================================
//                  DETALLE
//                  ===================================================== -->

//             <section
//                 v-if="record"
//                 class="mt-8"
//             >

//                 <div
//                     class="
//                         grid
//                         grid-cols-1
//                         lg:grid-cols-2
//                         gap-6
//                     "
//                 >

//                     <info-card
//                         v-for="section in detailSections"
//                         :key="section.title"
//                         :title="section.title"
//                         :items="section.items"
//                     >
//                     </info-card>

//                 </div>

//             </section>


//             <!-- =====================================================
//                  SIN REGISTRO
//                  ===================================================== -->

//             <div
//                 v-else
//                 class="
//                     py-12
//                     text-center
//                     text-gray-500
//                 "
//             >

//                 No se encontró el registro solicitado.

//             </div>

//         </div>

//     `

// };