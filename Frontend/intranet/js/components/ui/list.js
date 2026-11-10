const DataList = {

    props: {

        items: {
            type: Array,
            default: () => []
        },

        type: {
            type: String,
            default: 'disc' // disc | decimal | none
        },

        nestedType: {
            type: String,
            default: 'decimal'
        }

    },

    methods: {

        getListTag(type) {

            return type === 'decimal'
                ? 'ol'
                : 'ul';

        },

        getListClass(type) {

            switch (type) {

                case 'decimal':
                    return 'list-decimal list-outside ps-5';

                case 'none':
                    return 'list-none p-0 m-0';

                default:
                    return 'list-disc list-outside ps-5';

            }

        }

    },

    template: `

    <component

        :is="getListTag(type)"

        class="space-y-2 text-gray-700"

        :class="getListClass(type)">

        <li

            v-for="(item, index) in items"

            :key="index"

            :class="type !== 'none'
                ? 'marker:text-gray-500'
                : ''">

            <component

                :is="item.url ? 'a' : 'div'"

                :href="item.url"

                :target="item.target || '_self'"

                class="flex items-start gap-2 group">

                <!-- ICON -->
                <svg
                    v-if="item.icon"
                    class="w-[18px] h-[18px] mt-0.5 shrink-0 text-gray-500 flex-none"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true">

                    <use
                        :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon">
                    </use>

                </svg>

                <!-- CONTENT -->
                <div class="flex-1">

                    <slot

                        name="item"

                        :item="item">

                        <div

                            class="text-base font-normal text-gray-700 leading-6"

                            :class="item.url
                                ? 'text-blue-600 hover:text-blue-800 underline'
                                : ''">

                            {{ item.text }}

                        </div>

                        <p

                            v-if="item.description"

                            class="mt-0.5 text-sm leading-5 text-gray-500">

                            {{ item.description }}

                        </p>

                    </slot>

                </div>

            </component>

            <!-- CHILDREN -->
            <data-list

                v-if="item.children?.length"

                class="mt-3"

                :items="item.children"

                :type="nestedType"

                :nested-type="nestedType">

            </data-list>

        </li>

    </component>

    `
};