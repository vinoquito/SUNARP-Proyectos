const PageHeaderFeature = {

    props: {
        page: {
            type: Object,
            default: () => ({})
        }
    },

    template: `

    <div class="w-full" style="background-color: var(--gob-bg-page);">

        <section class="max-w-7xl mx-auto px-16 py-8 content-stack">

            <div class="grid gap-8 md:grid-cols-5">

                <div class="md:col-span-2 page-content">

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

                    <div
                        v-if="$slots.action || (page.action_label && page.action_url)"
                        class="page-header-feature-action">

                        <slot name="action">
                            <a
                                :href="page.action_url"
                                class="page-header-feature-button">
                                {{ page.action_label }}
                            </a>
                        </slot>

                    </div>

                </div>

                <div
                    v-if="$slots.aside || page.image"
                    class="md:col-span-3 page-header-feature-media">

                    <slot name="aside">
                        <img
                            :src="page.image"
                            :alt="page.alt || ''"
                            class="page-header-feature-image">
                    </slot>

                </div>

            </div>

        </section>

    </div>

    `
};
