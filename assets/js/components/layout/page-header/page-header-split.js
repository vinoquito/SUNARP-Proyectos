var PageHeaderSplit = {

    props: {
        page: {
            type: Object,
            default: () => ({})
        },

        imageLayout: {
            type: String,
            default: 'standard'
        }
    },

    template: `

    <div class="w-full" style="background-color: var(--gob-bg-page);">

        <section class="max-w-7xl mx-auto px-16 py-8 content-stack">

            <div
                class="grid gap-8"
                :class="imageLayout === 'half'
                    ? 'md:grid-cols-2'
                    : 'md:grid-cols-3'"
            >

                <div
                    class="page-content"
                    :class="imageLayout === 'standard'
                        ? 'md:col-span-2'
                        : 'md:col-span-1'"
                >

                    <a href="https://www.gob.pe/sunarp" class="page-entity">
                        Superintendencia Nacional de los Registros Públicos
                    </a>

                    <span class="page-header-rule" aria-hidden="true"></span>

                    <h1 class="page-title page-header-title">
                        {{ page.title }}
                    </h1>

                    <p v-if="page.description" class="page-description page-header-description">
                        {{ page.description }}
                    </p>

                </div>

                <aside
                    v-if="$slots.aside || page.image"
                    :class="imageLayout === 'image-wide'
                        ? 'md:col-span-2'
                        : 'md:col-span-1'">

                    <slot name="aside">
                        <img
                            :src="page.image"
                            :alt="page.alt || ''"
                            class="hero-image-gob">
                    </slot>

                </aside>

            </div>

        </section>

    </div>

    `
};
