const Pagination = {

    emits: ['update:page'],

    props: {
        template: {
            type: String,
            default: 'pagination-default'
        },
        page: {
            type: Number,
            default: 1
        },
        totalPages: {
            type: Number,
            default: 1
        }
    },

    computed: {

        getTemplate() {

            return this.template;
        }
    },

    template: `
        <component
            :is="getTemplate"
            :page="page"
            :total-pages="totalPages"
            @update:page="$emit('update:page',$event)">
        </component>
    `
};