const PageHeaderDefault = {

    props: {

        page: {
            type: Object,
            default: () => ({})
        }
    },

    template: `

    <div class="w-full" style="background-color: var(--gob-bg-page);">

        <section class="max-w-7xl mx-auto px-16 py-8 content-stack flex flex-col">

            <!-- Imagen: arriba en escritorio, abajo en móvil -->
            <div
                v-if="page.image"
                class="order-2 md:order-1">

                <img
                    :src="page.image"
                    :alt="page.alt"
                    class="hero-image-gob">

            </div>

            <!-- Texto: abajo en escritorio, arriba en móvil -->
            <div class="order-1 md:order-2">

                <div class="grid gap-8 md:grid-cols-3">

                    <div class="md:col-span-2 page-content">

                        <a
                            href="https://www.gob.pe/sunarp"
                            class="page-entity">

                            Superintendencia Nacional de los Registros Públicos

                        </a>

                        <h1 class="page-title">

                            {{ page.title }}

                        </h1>

                        <p
                            v-if="page.description"
                            class="page-description">

                            {{ page.description }}

                        </p>

                    </div>

                    <div>

                        <!-- acciones futuras -->

                    </div>

                </div>

            </div>

        </section>

    </div>

    `
};