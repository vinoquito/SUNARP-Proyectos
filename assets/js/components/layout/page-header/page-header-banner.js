const PageHeaderBanner = {

    props: {
        page: {
            type: Object,
            default: () => ({})
        }
    },

    template: `

    <div class="w-full" style="background-color: var(--gob-bg-page);">

        <section class="max-w-7xl mx-auto px-16 py-8 content-stack">

            <div class="grid gap-8 md:grid-cols-3">

                <div class="md:col-span-2 page-content">

                    <img
                        v-if="page.image"
                        :src="page.image"
                        :alt="page.alt || ''"
                        class="hero-image-gob page-header-banner-image">

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
                    v-if="$slots.aside"
                    class="md:col-span-1">

                    <slot name="aside"></slot>

                </aside>

            </div>

        </section>

    </div>

    `
};