const FooterGob = {

    props: {

        template: {
            type: String,
            default: 'footer-default'
        },

        items: {
            type: Array,
            default() {
                return [];
            }
        }
    },

    computed: {

        structure() {

            return this.items.reduce(

                (acc, item) => {

                    const group =
                        item.group || 'default';

                    const subgroup =
                        item.subgroup || 'default';

                    acc[group] ??= {};
                    acc[group][subgroup] ??= [];

                    acc[group][subgroup].push(item);

                    return acc;

                },

                {}
            );
        }
    },

    methods: {

        getComponent() {

            switch (this.template) {

                case 'footer-default':
                    return 'footer-default';

                default:
                    return 'footer-default';
            }
        }
    },

    template: `

        <component
            :is="getComponent()"
            :structure="structure">
        </component>

    `
};