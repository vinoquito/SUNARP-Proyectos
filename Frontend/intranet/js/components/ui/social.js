// js/components/social.js

const SocialLinks = {
    props: {
        items: {
            type: Array,
            default: () => []
        }
    },
    template: `
    <div class="flex items-center gap-1">
        <a
            v-for="(item, index) in items"
            :key="index"
            :href="item.url_destination"
            :target="item.target"
            :rel="item.target === '_blank' ? 'noopener noreferrer' : null"
            :title="item.text"
            class="inline-flex items-center justify-center px-2 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:text-blue-600 hover:bg-gray-100 hover:border-gray-400 transition-colors"
        >
            <svg
                class="w-6 h-6 stroke-current fill-none"
                style="stroke-width: 1.5;"
                aria-hidden="true"
            >
                <use :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon"></use>
            </svg>
        </a>
    </div>
    `
};