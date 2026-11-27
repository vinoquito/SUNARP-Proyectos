const PageHeaderGob = {

    props: {
        template: {
            type: String,
            required: true
        },

        page: {
            type: Object,
            default: () => ({})
        },

        imageLayout: {
            type: String,
            default: 'standard'
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
            :page="page"
            :image-layout="imageLayout">

            <template
                v-for="(_, slotName) in $slots"
                #[slotName]="slotProps">

                <slot
                    :name="slotName"
                    v-bind="slotProps || {}">
                </slot>

            </template>

        </component>
    `
};