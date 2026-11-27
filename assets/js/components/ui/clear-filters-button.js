const ClearFiltersButton = {

    emits: ['clear'],

    template: `

        <button
            type="button"
            class="clear-filters-button"
            @click="$emit('clear')"
        >
            <span
                class="material-symbols-outlined"
                aria-hidden="true"
            >
                filter_alt_off
            </span>

            <span>
                Limpiar filtros
            </span>
        </button>

    `

};