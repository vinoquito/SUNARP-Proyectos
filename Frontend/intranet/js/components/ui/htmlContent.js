const HtmlContent = {

    props: {

        content: {
            type: String,
            default: ''
        }
    },

    template: `

    <div
        class="prose max-w-none"
        v-html="content">
    </div>
    `
};