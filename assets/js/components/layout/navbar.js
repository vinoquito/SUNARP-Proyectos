const NavbarGob = {

    props: {

        template: {
            type: String,
            default: 'nav-default'
        },

        items: {
            type: Array,
            default() {
                return [];
            }
        },

        titleClass: {
            type: String,
            default: ''
        },

        separatorClass: {
            type: String,
            default: ''
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

                case 'nav-default':
                    return 'navbar-default';

                default:
                    return 'navbar-default';
            }
        }
    },

    template: `

        <component
            :is="getComponent()"
            :structure="structure"
            :title-class="titleClass"
            :separator-class="separatorClass">
        </component>

    `
};