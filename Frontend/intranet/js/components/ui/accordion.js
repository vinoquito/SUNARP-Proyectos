// js/components/ui/accordion.js

const Accordion = {
    props: {
        items: {
            type: Array,
            default: () => []
        },
        alwaysOpen: {
            type: Boolean,
            default: true
        },
        // Componente que se usará para renderizar los items de cada grupo
        itemComponent: {
            type: String,
            default: 'data-list'
        },
        // Props adicionales para el componente interno
        itemComponentProps: {
            type: Object,
            default: () => ({ type: 'none' })
        }
    },
    data() {
        return { activeIndex: 0 };
    },
    computed: {
        accordionId() {
            return `accordion-${this._.uid}`;
        }
    },
    methods: {
        toggle(index) {
            this.activeIndex = this.activeIndex === index ? -1 : index;
        }
    },
    template: `
    <div :id="accordionId"
         class="border border-gray-200 overflow-hidden shadow-sm">
        <template v-for="(item, index) in items" :key="index">
            <h2 :id="\`\${accordionId}-heading-\${index}\`">
                <button type="button" @click="toggle(index)"
                    :class="[
                        'flex items-center justify-between w-full p-5 text-left text-lg font-medium border-b border-gray-200 gap-4 transition-colors duration-200',
                        activeIndex === index
                            ? 'bg-gray-50 text-gray-900'
                            : 'bg-white text-gray-700 hover:bg-blue-50/60 hover:text-blue-500'
                    ]"
                    :aria-expanded="activeIndex === index"
                    :aria-controls="\`\${accordionId}-body-\${index}\`">
                    <div class="flex items-center gap-3">
                        <svg v-if="item.icon"
                             class="w-5 h-5 text-gray-500 flex-shrink-0">
                            <use :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon"></use>
                        </svg>
                        <span>{{ item.title }}</span>
                    </div>
                    <svg data-accordion-icon
                         class="w-5 h-5 shrink-0 rotate-180"
                         xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
                              stroke-width="2" d="m5 15 7-7 7 7" />
                    </svg>
                </button>
            </h2>
            <div v-show="activeIndex === index"
                 :id="\`\${accordionId}-body-\${index}\`"
                 :aria-labelledby="\`\${accordionId}-heading-\${index}\`">
                <div class="p-5 bg-white border-b border-gray-200">
                    <!-- Aquí renderiza el componente interno dinámico -->
                    <component :is="itemComponent"
                               :items="item.items"
                               v-bind="itemComponentProps">
                    </component>
                </div>
            </div>
        </template>
    </div>
    `
};