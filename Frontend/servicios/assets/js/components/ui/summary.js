const Summary = {

    props: {

        page: {
            type: Number,
            default: 1
        },

        totalPages: {
            type: Number,
            default: 1
        },

        visible: {
            type: Number,
            default: 0
        },

        total: {
            type: Number,
            default: 0
        },

        label: {
            type: String,
            default: 'registros'
        },

        perPage: {
            type: Number,
            default: 12
        }

    },


    emits: ['update:per-page'],


    methods: {

        onPerPageChange(event) {

            this.$emit(
                'update:per-page',
                Number(event.target.value)
            );

        }

    },


    template: `

        <div class="listing-summary-wrapper">

            <!-- CANTIDAD DE REGISTROS -->

            <div class="listing-summary-page-size">

                <label for="listing-page-size">
                    Mostrar
                </label>

                <select
                    id="listing-page-size"
                    :value="perPage"
                    @change="onPerPageChange"
                    aria-label="Registros por página"
                >

                    <option :value="12">12</option>
                    <option :value="24">24</option>
                    <option :value="48">48</option>

                </select>

            </div>


            <!-- RESUMEN -->

            <div class="listing-summary">

                Página <strong>{{ page }}</strong> de
                <strong>{{ totalPages }}</strong> |

                Mostrando <strong>{{ visible }}</strong> de
                <strong>{{ total }}</strong> {{ label }}

            </div>

        </div>

    `

};

// const Summary = {
//     props: {
//         page: Number,
//         totalPages: Number,
//         visible: Number,
//         total: Number,
//         label: { type: String, default: 'registros' }
//     },
//     template: `
//     <div class="listing-summary">
//         Página <strong>{{ page }}</strong> de <strong>{{ totalPages }}</strong> |
//         Mostrando <strong>{{ visible }}</strong> de <strong>{{ total }}</strong> {{ label }}
//     </div>
//     `
// };