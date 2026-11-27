const PageHeaderFeature = {

    props: {
        page: {
            type: Object,
            default: () => ({})
        }
    },

    template: `

    <div class="page-header-feature">

        <section class="page-header-feature-container">

            <div class="page-header-feature-content">

                <a
                    href="https://www.gob.pe/sunarp"
                    class="page-entity page-header-feature-entity">
                    Superintendencia Nacional de los Registros Públicos
                </a>

                <span
                    class="page-header-feature-rule"
                    aria-hidden="true">
                </span>

                <h1 class="page-title page-header-feature-title">
                    {{ page.title }}
                </h1>

                <p
                    v-if="page.description"
                    class="page-description page-header-feature-description">
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
                class="page-header-feature-media">

                <slot name="aside">
                    <img
                        :src="page.image"
                        :alt="page.alt || ''"
                        class="page-header-feature-image">
                </slot>

            </div>

        </section>

    </div>

    `
};
