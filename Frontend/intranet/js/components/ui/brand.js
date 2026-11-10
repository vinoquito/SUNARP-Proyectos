const Brand = {
    props: {
        brand: {
            type: Object,
            default: () => ({})
        }
    },

    template: `
        <a
            :href="brand.url_destination || '/intranet/'"
            :target="brand.target || '_self'"
            :rel="brand.target === '_blank' ? 'noopener noreferrer' : null"
            class="flex flex-col ms-2 md:me-24"
        >
            <span class="text-xl font-semibold whitespace-nowrap text-sunarp-gray">
                {{ brand.text }}
            </span>

            <span
                v-if="brand.description"
                class="mt-0.5 text-base whitespace-nowrap text-sunarp-green"
            >
                {{ brand.description }}
            </span>
        </a>
    `
};