const Card = {

    props: {

        title: String,

        items: {
            type: Array,
            default: () => []
        }
    },

    computed: {

        template() {

            return this.items?.[0]?.template ||
                'card-default';
        }
    },

    template: `
        <component
            :is="template"
            :title="title"
            :items="items">
        </component>
    `
};