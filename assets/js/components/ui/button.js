const AppButton = {

    props: {

        layout: {
            type: String,
            default: 'horizontal'
        },

        label: {
            type: String,
            default: ''
        },

        textSize: {
            type: String,
            default: 'sm'
        },

        /*
         * Nombre del icono de Material Symbols
         *
         * Ejemplo:
         * search
         * picture_as_pdf
         * table_view
         * download
         * location_on
         */
        icon: {
            type: String,
            default: ''
        },

        iconOnly: {
            type: Boolean,
            default: false
        },

        variant: {
            type: String,
            default: 'primary'
        },

        size: {
            type: String,
            default: 'md'
        },

        type: {
            type: String,
            default: 'button'
        },

        disabled: {
            type: Boolean,
            default: false
        },

        tooltip: {
            type: String,
            default: ''
        },

        tooltipStyle: {
            type: String,
            default: 'dark'
        }
    },

    /*
     * Permite que componentes como
     * ExportExcelButton y ExportPdfButton
     * reciban el click.
     */
    emits: ['click'],

    computed: {

        variantClass() {

            const variants = {

                primary:
                    'text-white bg-blue-600 border border-transparent hover:bg-blue-700 focus:ring-4 focus:ring-blue-300',

                secondary:
                    'text-gray-700 bg-gray-200 border border-transparent hover:bg-gray-300 focus:ring-4 focus:ring-gray-300',

                tertiary:
                    'text-gray-700 bg-gray-100 border border-gray-200 hover:bg-gray-200 focus:ring-4 focus:ring-gray-200',

                success:
                    'text-white bg-green-600 border border-transparent hover:bg-green-700 focus:ring-4 focus:ring-green-300',

                danger:
                    'text-white bg-red-600 border border-transparent hover:bg-red-700 focus:ring-4 focus:ring-red-300',

                warning:
                    'text-white bg-amber-500 border border-transparent hover:bg-amber-600 focus:ring-4 focus:ring-amber-300',

                dark:
                    'text-white bg-gray-800 border border-transparent hover:bg-black focus:ring-4 focus:ring-gray-300',

                ghost:
                    'text-gray-700 bg-transparent border border-transparent hover:bg-gray-100 focus:ring-4 focus:ring-gray-200'
            };

            return variants[this.variant] || variants.primary;
        },

        sizeClass() {

            const sizes = {

                xs:
                    this.iconOnly
                        ? 'w-8 h-8'
                        : 'px-2 py-1 text-xs',

                sm:
                    this.iconOnly
                        ? 'w-9 h-9'
                        : 'px-3 py-2 text-sm',

                md:
                    this.iconOnly
                        ? 'w-10 h-10'
                        : 'px-4 py-2 text-sm',

                lg:
                    this.iconOnly
                        ? 'w-12 h-12'
                        : 'px-5 py-3 text-base'
            };

            return sizes[this.size] || sizes.md;
        },

        iconClass() {

            if (this.layout === 'vertical') {
                return 'text-[20px]!';
            }

            const sizes = {

                xs: 'text-[16px]!',
                sm: 'text-[18px]!',
                md: 'text-[20px]!',
                lg: 'text-[24px]!'
            };

            return sizes[this.size] || sizes.md;
        },

        layoutClass() {

            return this.layout === 'vertical'
                ? 'flex-col gap-1'
                : 'flex-row gap-2';
        },

        textClass() {

            const sizes = {

                xs: 'text-xs',
                sm: 'text-sm',
                md: 'text-base',
                lg: 'text-lg'
            };

            return sizes[this.textSize] || sizes.sm;
        },

        tooltipClass() {

            const styles = {

                dark:
                    'text-white bg-gray-900',

                light:
                    'text-gray-900 bg-white border border-gray-200'
            };

            return styles[this.tooltipStyle] || styles.dark;
        }
    },

    data() {

        return {
            showTooltip: false
        };
    },

    methods: {

        /*
         * El botón maneja su propio click
         * y lo emite al componente padre.
         */
        handleClick(event) {

            if (this.disabled) {
                return;
            }

            this.$emit('click', event);
        }
    },

    template: `

        <div
            class="app-button-wrapper"
            @mouseenter="showTooltip = true"
            @mouseleave="showTooltip = false"
        >

            <button
                :type="type"
                :disabled="disabled"
                @click="handleClick"

                :class="[

                    'app-button',

                    'app-button-' + variant,

                    'app-button-' + size,

                    {
                        'app-button-icon-only': iconOnly,
                        'app-button-vertical': layout === 'vertical'
                    }

                ]"
            >

                <span
                    v-if="icon"
                    class="material-symbols-outlined"
                >
                    {{ icon }}
                </span>

                <span
                    v-if="!iconOnly && label"
                >
                    {{ label }}
                </span>

            </button>

            <div
                v-if="tooltip"
                v-show="showTooltip"
                :class="[
                    'absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap rounded-md px-3 py-2 text-xs shadow-lg z-50',
                    tooltipStyle === 'light'
                        ? 'text-gray-900 bg-white border border-gray-200'
                        : 'text-white bg-gray-900'
                ]"
            >
                {{ tooltip }}
            </div>

        </div>
    `
};