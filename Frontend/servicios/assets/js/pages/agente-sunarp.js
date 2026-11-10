const PAGE_NAME = 'agente-sunarp';

const CONFIG = {
    appId: 'agente-sunarp'
};

const app = createBaseApp({

    data() {

        return {

            loading: true,

            pageData: {},

            navbarData: {
                template: '',
                items: []
            },

            footerData: {
                template: '',
                items: []
            },

            locations: [],

            /*
            * Configuración de CardDefault
            */
            agentCardFields: [

                {
                    type: 'title',
                    key: 'nombre'
                },

                {
                    type: 'text',
                    value: item =>
                        `${item.departamento} - ${item.provincia} - ${item.distrito}`,
                    icon: 'map',
                    iconClass: 'text-gray-700',
                    class: 'card-default-location flex gap-1'
                },

                {
                    type: 'text',
                    key: 'direccion',
                    icon: 'location_on',
                    class: 'card-default-address flex gap-1 mt-2'
                },

                {
                    type: 'text',
                    value: item =>
                        item.referencia
                            ? `Referencia: ${item.referencia}`
                            : '',
                    icon: 'push_pin',
                    iconClass: 'text-gray-500',
                    class: 'flex gap-1 text-gray-500 mt-2'
                }

            ],

            agentCardLink: {

                key: 'url',
                label: 'Ver mapa',
                target: '_blank',
                class: 'card-default-link flex items-center gap-1 underline font-medium mt-4'

            }
        };
    },

    async mounted() {

        try {

            const [
                pageData,
                navbarData,
                footerData,
                rows
            ] = await Promise.all([
                getPage(PAGE_NAME),
                getNavbarData(PAGE_NAME),
                getFooterData(PAGE_NAME),
                fetchSheet(PAGE_NAME)
            ]);

            this.pageData = pageData;
            this.navbarData = navbarData;
            this.footerData = footerData;

            this.locations = rows
                .filter(i =>
                    i.block?.trim() === 'locations' &&
                    i.state?.trim().toLowerCase() === 'activo'
                )
                .map(i => ({
                    nombre: i.nombre,
                    direccion: i.direccion,
                    departamento: i.departamento,
                    provincia: i.provincia,
                    distrito: i.distrito,
                    referencia: i.referencia,
                    url: i.url_destination,
                    target: i.target,
                    template: i.template
                }));

            await this.$nextTick();

            this.loading = false;

        } catch (e) {

            console.error(e);

            this.loading = false;
        }
    }
});

registerGlobalComponents(app);

app.component('navbar-default', NavbarDefault);

app.component('page-header-split', PageHeaderSplit);

app.component('footer-default', FooterDefault);

/*
 * Listing
 */
app.component('listing-block', ListingBlock);

/*
 * Componentes utilizados internamente por ListingBlock
 */
app.component('search-input', SearchInput);

app.component('select-gob', SelectGob);

app.component('listing-summary', Summary);

app.component('pagination', Pagination);

app.component('pagination-default', PaginationDefault);

app.component('card', Card);

app.component('card-default', CardDefault);

app.component('clear-filters-button', ClearFiltersButton);

/*
 * Botones de exportación
 */
app.component('app-button', AppButton);

app.component('export-excel-button', ExportExcelButton);

app.component('export-pdf-button', ExportPdfButton);

app.mount('#app');