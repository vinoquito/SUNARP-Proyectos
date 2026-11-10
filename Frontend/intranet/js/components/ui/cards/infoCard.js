// js/components/ui/cards/InfoCard.js

const InfoCard = {

    props: {

        title: {
            type: String,
            default: ''
        },

        items: {
            type: Array,
            default: () => []
        }

    },


    methods: {

        getItemValue(item) {

            return item.value ?? '-';

        }

    },


    template: `

        <div
            class="
                bg-white
                shadow-sm
                border
                border-gray-200
            "
        >

            <div
                v-if="title"
                class="
                    px-6
                    py-4
                    border-b
                    border-gray-200
                "
            >

                <h2
                    class="
                        font-semibold
                        text-gray-900
                    "
                >

                    {{ title }}

                </h2>

            </div>


            <div class="p-6">

                <template
                    v-for="item in items"
                    :key="item.label"
                >

                    <div
                        v-if="
                            item.value !== null &&
                            item.value !== undefined &&
                            String(item.value).trim() !== ''
                        "
                        class="mb-3 last:mb-0"
                    >

                        <!-- =================================================
                             BADGE
                             ================================================= -->

                        <div
                            v-if="item.type === 'badge'"
                            class="
                                flex
                                items-center
                                gap-2
                                text-sm
                            "
                        >

                            <span
                                class="
                                    font-medium
                                    text-gray-500
                                "
                            >

                                {{ item.label }}:

                            </span>


                            <app-badge
                                :label="item.value"
                                :variant="
                                    item.variant || 'neutral'
                                "
                            >
                            </app-badge>

                        </div>


                        <!-- =================================================
                             ENLACE
                             ================================================= -->

                        <div
                            v-else-if="item.type === 'link'"
                            class="mt-2"
                        >

                            <a
                                :href="item.value"
                                :target="item.target || '_blank'"
                                class="
                                    inline-flex
                                    items-center
                                    gap-1
                                    text-blue-600
                                    hover:underline
                                "
                            >

                                <span>
                                    {{ item.label || 'Ver documento' }}
                                </span>


                                <svg
                                    class="
                                        w-5
                                        h-5
                                        stroke-current
                                        fill-none
                                    "
                                    style="stroke-width: 1.5;"
                                    aria-hidden="true"
                                >

                                    <use
                                        :href="
                                            '/intranet/imagenes/iconos/icons.svg#' +
                                            item.icon
                                        "
                                    ></use>

                                </svg>

                            </a>

                        </div>


                        <!-- =================================================
                             CAMPO NORMAL
                             ================================================= -->

                        <div
                            v-else
                            class="
                                text-sm
                                text-gray-700
                            "
                        >

                            <span
                                class="
                                    font-medium
                                    text-gray-500
                                "
                            >

                                {{ item.label }}:

                            </span>


                            <span class="ml-1">

                                {{ getItemValue(item) }}

                            </span>

                        </div>

                    </div>

                </template>

            </div>

        </div>

    `
};

// const InfoCard = {

//     props: {

//         title: {
//             type: String,
//             default: ''
//         },

//         items: {
//             type: Array,
//             default: () => []
//         }
//     },

//     methods: {

//         getItemValue(item) {

//             return item.value ?? '-';

//         }

//     },

//     template: `

//         <div
//             class="
//                 bg-white
//                 shadow-sm
//                 border
//                 border-gray-200
//             "
//         >

//             <div
//                 v-if="title"
//                 class="
//                     px-6
//                     py-4
//                     border-b
//                     border-gray-200
//                 "
//             >

//                 <h2
//                     class="
//                         font-semibold
//                         text-gray-900
//                     "
//                 >

//                     {{ title }}

//                 </h2>

//             </div>

//             <div class="p-6">

//                 <div
//                     v-for="item in items"
//                     :key="item.label"
//                     class="mb-3 last:mb-0"
//                 >

//                     <div
//                         v-if="item.type === 'link'"
//                         class="mt-2"
//                     >
//                         <a
//                             v-if="item.value"
//                             :href="item.value"
//                             :target="item.target || '_blank'"
//                             class="
//                                 inline-flex
//                                 items-center
//                                 gap-1
//                                 text-blue-600
//                                 hover:underline
//                             "
//                         >
//                             <span>
//                                 Ver documento
//                             </span>

//                             <svg
//                                 class="w-5 h-5 stroke-current fill-none"
//                                 style="stroke-width: 1.5;"
//                                 aria-hidden="true"
//                             >
//                                 <use
//                                     :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon"
//                                 ></use>
//                             </svg>
//                         </a>

//                         <span
//                             v-else
//                             class="text-gray-400"
//                         >
//                             -
//                         </span>
//                     </div>

//                     <div
//                         v-else
//                         class="text-sm text-gray-700"
//                     >

//                         <span class="font-medium text-gray-500">
//                             {{ item.label }}:
//                         </span>

//                         <span class="ml-1">
//                             {{ getItemValue(item) }}
//                         </span>

//                     </div>

//                 </div>

//             </div>

//         </div>

//     `
// };
