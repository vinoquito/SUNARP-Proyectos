const SelectGob = {
    props: {
        modelValue: { default: '' },
        label: { type: String, default: '' },
        placeholder: { type: String, default: 'Seleccione' },
        options: { type: Array, default: () => [] }
    },

    emits: ['update:modelValue'],

    template: `
        <label class="filter-group">
            <span class="filter-label">{{ label }}</span>

            <select
                ref="select"
                class="gob-select">

                <option value="">
                    {{ placeholder }}
                </option>

                <option
                    v-for="(option, index) in options"
                    :key="index"
                    :value="option.value ?? option">

                    {{ option.label ?? option }}
                </option>

            </select>
        </label>
    `,

    mounted() {
        this.initSelect2();
    },

    methods: {
        initSelect2() {

            const $select = $(this.$refs.select);

            $select.select2({
                width: '100%',
                placeholder: this.placeholder,
                minimumResultsForSearch: 0,
                allowClear: false,

                // IMPORTANTE:
                // pone gob-select al elemento visible
                selectionCssClass: 'gob-select'
            });

            $select
                .val(this.modelValue)
                .trigger('change.select2');

            $select.on('change.selectGob', () => {
                this.$emit(
                    'update:modelValue',
                    $select.val()
                );
            });
        },

        destroySelect2() {

            const $select = $(this.$refs.select);

            $select.off('.selectGob');

            if ($select.hasClass('select2-hidden-accessible')) {
                $select.select2('destroy');
            }
        }
    },

    watch: {

        modelValue(value) {

            const $select = $(this.$refs.select);

            if (String($select.val() ?? '') !== String(value ?? '')) {

                $select
                    .val(value)
                    .trigger('change.select2');
            }
        },

        options: {

            deep: true,

            handler() {

                this.$nextTick(() => {

                    const value = this.modelValue;

                    this.destroySelect2();

                    this.initSelect2();

                    $(this.$refs.select)
                        .val(value)
                        .trigger('change.select2');

                });
            }
        }
    },

    beforeUnmount() {
        this.destroySelect2();
    }
};


// const SelectGob = {
//     props: {
//         modelValue: { default: '' },
//         label: { type: String, default: '' },
//         placeholder: { type: String, default: 'Seleccione' },
//         options: { type: Array, default: () => [] }
//     },
//     emits: ['update:modelValue'],
//     template: `
//         <label class="filter-group">
//             <span class="filter-label">{{ label }}</span>

//             <select
//                 class="gob-select"
//                 :value="modelValue"
//                 @change="$emit('update:modelValue', $event.target.value)">

//                 <option value="">
//                     {{ placeholder }}
//                 </option>

//                 <option
//                     v-for="(option,index) in options"
//                     :key="index"
//                     :value="option.value ?? option">

//                     {{ option.label ?? option }}

//                 </option>

//             </select>
//         </label>
//     `
// };