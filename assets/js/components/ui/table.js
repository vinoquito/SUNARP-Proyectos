
const DataTable = {

    props: {

        title: {
            type: String,
            default: ''
        },

        titleIcon: {
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

        template() {

            return this.items?.[0]?.template ||
                'table-default';
        }
    },

    template: `
        <component
            :is="template"
            :title="title"
            :title-icon="titleIcon"
            :items="items"
            :columns="columns"
            :empty-text="emptyText">
        </component>
    `
};
