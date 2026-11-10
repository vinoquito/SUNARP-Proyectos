const ContentPageTemplate = {

    props: {

        page: {
            type: Object,
            required: true
        },

        blocks: {
            type: Array,
            default: () => []
        },

        breadcrumbItems: {
            type: Array,
            default: () => []
        }

    },

    template: `

    <div class="p-4">

        <!-- BREADCRUMB -->
        <breadcrumb
            :items="breadcrumbItems">
        </breadcrumb>

        <!-- HEADER -->
        <page-header
            :title="page.title"
            :subtitle="page.subtitle"
            :description="page.description">
        </page-header>

        <!-- CONTENT -->
        <section class="mt-16">

            <content-renderer
                :blocks="blocks">
            </content-renderer>

        </section>

        <!-- FOOTER -->
        <footer-intranet></footer-intranet>

    </div>

    `

};