// js/renderers/content-renderer.js

const COMPONENT_MAP = {
    accordion: 'accordion',
    table: 'data-table',

    'listing-block-table': 'listing-block',
    'listing-block-card': 'listing-block',

    list: 'data-list',
    'list-decimal': 'data-list',
    slider: 'app-slider',
    'card-grid': 'card-grid',
    'card-grid-compact': 'card-grid-compact',
    'card-vertical-desc': 'card-vertical-desc',
    'card-vertical-simple': 'card-vertical-simple',
    'info-card': 'info-card',
    'html-content': 'html-content'
};


// Tipos que reciben el array completo
const SINGLE_INSTANCE_TYPES = [
    'accordion',
    'table',
    'listing-block-table',
    'listing-block-card',
    'list',
    'list-decimal',
    'slider'
];


const ContentRenderer = {

    props: {

        blocks: {
            type: Array,
            default: () => []
        }

    },


    methods: {

        getComponent(type) {

            return COMPONENT_MAP[type] || 'html-content';

        },


        isGrouped(data) {

            return (
                Array.isArray(data) &&
                data.length > 0 &&
                data[0].title !== undefined
            );

        },


        shouldSplitIntoGroups(type) {

            return !SINGLE_INSTANCE_TYPES.includes(type);

        },

    },


    template: `

    <div class="space-y-12">

        <template
            v-for="block in blocks"
            :key="block.block"
        >


            <!-- =====================================================
                 COMPONENTES QUE RECIBEN EL ARRAY COMPLETO
                 ===================================================== -->

            <section
                v-if="!shouldSplitIntoGroups(block.type)"
            >

                <component
                    :is="getComponent(block.type)"
                    :items="block.data"
                    :type="block.type"
                />

            </section>


            <!-- =====================================================
                 COMPONENTES QUE PUEDEN DIVIDIRSE POR GRUPOS
                 ===================================================== -->

            <template v-else>


                <!-- SI ESTÁ AGRUPADO -->

                <template
                    v-if="isGrouped(block.data)"
                >

                    <component
                        v-for="(group, idx) in block.data"
                        :key="idx"
                        :is="getComponent(block.type)"
                        :title="group.title"
                        :items="group.items"
                    />

                </template>


                <!-- SI ES PLANO -->

                <section v-else>

                    <component
                        :is="getComponent(block.type)"
                        :items="block.data"
                    />

                </section>

            </template>

        </template>

    </div>

    `

};