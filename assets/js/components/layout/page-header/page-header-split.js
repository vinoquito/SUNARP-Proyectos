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
                    :class="imageLayout === 'half'
                        ? 'md:col-span-1'
                        : 'md:col-span-2'"
                >

                    <a href="https://www.gob.pe/sunarp" class="page-entity">
                        Superintendencia Nacional de los Registros Públicos
                    </a>

                    <h1 class="page-title">
                        {{ page.title }}
                    </h1>

                    <p v-if="page.description" class="page-description">
                        {{ page.description }}
                    </p>

                </div>

                <aside
                    v-if="$slots.aside || page.image"
                    class="md:col-span-1">

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