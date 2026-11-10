const AppSelect = {

    props: {

        modelValue: {

            type: [String, Number],

            default: ''
        },

        label: {

            type: String,

            default: ''
        },

        placeholder: {

            type: String,

            default: 'Seleccione una opción'
        },

        options: {

            type: Array,

            default: () => []
        }
    },

    emits: [

        'update:modelValue'
    ],

    methods: {

        onChange(event) {

            this.$emit(
                'update:modelValue',
                event.target.value
            );
        }
    },

    template: `

        <div>

            <label

                v-if="label"

                class="block mb-2 text-sm font-medium text-gray-700">

                {{ label }}

            </label>

            <select

                :value="modelValue"

                @change="onChange"

                class="block w-full px-3 py-3 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500">

                <option value="">

                    {{ placeholder }}

                </option>

                <option

                    v-for="option in options"

                    :key="option.value"

                    :value="option.value">

                    {{ option.label }}

                </option>

            </select>

        </div>

    `
};