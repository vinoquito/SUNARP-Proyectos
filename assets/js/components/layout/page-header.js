const PageHeaderGob = {

    props: {

        template: {
            type: String,
            required: true
        },

        page: {
            type: Object,
            default: () => ({})
        }
    },

    methods: {

        getComponent() {

            return this.template;
        }
    },

    template: `
    
        <component
            :is="getComponent()"
            :page="page">
        </component>
    `
};