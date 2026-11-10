const PAGE_NAME = 'index';

const CONFIG = {
    appId: 'intranet'
};

const app = createBaseApp({

    data() {

        return {

            loading: true,

            sliderItems: [],

            sections: [],

            sidebarPrimary: [],

            sidebarSecondary: [],

            brand: [],

            socialItems: []
        };
    },

    methods: {

        formatearImagen(id) {

            if (!id) return '';

            return `https://lh3.googleusercontent.com/d/${id.trim()}`;
        }
    },

    async mounted() {

        try {

            // =========================
            // FETCH PARALELO
            // =========================
            const [

                rows,
                sidebar,
                brand,
                socialItems

            ] = await Promise.all([

                fetchSheet(PAGE_NAME),

                getSidebarData(),

                getBrandData(),

                getSocialData(),
            ]);

            console.log('BRAND:', brand);
            // =========================
            // SIDEBAR
            // =========================
            this.sidebarPrimary =
                sidebar.primary;

            this.sidebarSecondary =
                sidebar.secondary;

            // =========================
            // BRAND
            // =========================
            this.brand = brand;

            // =========================
            // SOCIAL ITEMS
            // =========================
            this.socialItems = socialItems;

            // =========================
            // HERO SLIDER
            // =========================
            this.sliderItems = rows

                .filter(i =>

                    i.block?.trim() === 'hero'
                )

                .sort((a, b) =>

                    Number(a.order) -
                    Number(b.order)
                )

                .map(i => ({

                    image:
                        this.formatearImagen(
                            i.image_id
                        ),

                    url:
                        i.url_destination,

                    text:
                        i.text,

                    alt:
                        i.image_name || ''
                }));

            // =========================
            // MAIN FILTER
            // =========================
            const filtered = rows.filter(i =>

                i.section?.trim() === 'main' &&
                i.block?.trim() !== 'hero'
            );

            // =========================
            // NORMALIZAR
            // =========================
            const normalized = filtered.map(item => ({

                text:
                    item.text,

                description:
                    item.description,

                url:
                    item.url_destination,

                icon:
                    item.icon,

                target:
                    item.target?.trim() || '_self',

                order:
                    Number(item.order),

                group:
                    item.group?.trim(),

                block:
                    item.block?.trim(),

                type:
                    item.type?.trim()
            }));

            // =========================
            // AGRUPAR
            // =========================
            const grouped = groupBy(
                normalized,
                'group'
            );

            // =========================
            // SECTIONS
            // =========================
            this.sections = Object
                .entries(grouped)
                .map(([group, items]) => ({

                    title:
                        group,

                    block:
                        items[0]?.block || '',

                    type:
                        items[0]?.type || '',

                    items:
                        items.sort((a, b) =>

                            a.order -
                            b.order
                        )
                }));

            // =========================
            // FINAL
            // =========================
            await this.$nextTick();

            this.loading = false;

        } catch (e) {

            console.error(e);

            this.loading = false;
        }
    }

});

registerGlobalComponents(app);

app.component(
    'slider',
    Slider
);

app.component(
    'card-list',
    CardList
);

app.component(
    'card-vertical-desc',
    CardVerticalDesc
);

app.component(
    'card-vertical-simple',
    CardVerticalSimple
);

app.component(
    'card-grid',
    CardGrid
);

app.component(
    'card-grid-compact',
    CardGridCompact
);

app.mount('#app');