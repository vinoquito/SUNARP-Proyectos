const ContentParagraph = {

    props: {

        content: {
            type: String,
            default: ''
        }
    },

    template: `

    <div
        class="text-gray-700 leading-relaxed"
        v-html="content">
    </div>
    `
};