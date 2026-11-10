const AppInputSearch = {

    props: {

        modelValue: {
            type: String,
            default: ''
        },

        placeholder: {
            type: String,
            default: 'Buscar...'
        },

        buttonText: {
            type: String,
            default: ''
        }
    },

    emits: [

        'update:modelValue',
        'search'
    ],

    methods: {

        onInput(event) {

            this.$emit(
                'update:modelValue',
                event.target.value
            );
        },

        onSearch() {

            this.$emit('search');
        }
    },

    template: `

        <div class="relative">

            <div
                class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">

                <svg
                    class="w-6 h-6 text-gray-400"
                    fill="none"
                    stroke="currentColor">

                    <use href="/intranet/imagenes/iconos/icons.svg#magnifying-glass"></use>

                </svg>

            </div>

            <input

                type="search"

                :value="modelValue"

                @input="onInput"

                @keyup.enter="onSearch"

                :placeholder="placeholder"

                class="block w-full p-3 pl-10 pr-4 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500">

            <button

                v-if="buttonText"

                type="button"

                @click="onSearch"

                class="absolute right-1.5 bottom-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700">

                {{ buttonText }}

            </button>

        </div>

    `
};