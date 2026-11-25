const ClearFiltersButton = {

    emits: ['clear'],

    template: `

        <button
            type="button"
            class="clear-filters-button"
            @click="$emit('clear')"
        >
            Limpiar filtros
        </button>

    `

};