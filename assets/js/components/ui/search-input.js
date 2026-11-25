const SearchInput = {
    props: {
        modelValue: { type: String, default: '' },
        label: { type: String, default: 'Filtrar por palabra clave' },
        placeholder: { type: String, default: 'Buscar' }
    },
    emits: ['update:modelValue'],
    template: `
        <label class="filter-group">
            <span class="filter-label">{{ label }}</span>

            <div class="search-input">
                <input
                    class="gob-input"
                    :value="modelValue"
                    :placeholder="placeholder"
                    @input="$emit('update:modelValue', $event.target.value)" />

                <span class="material-symbols-outlined">
                    search
                </span>
            </div>
        </label>
    `
};