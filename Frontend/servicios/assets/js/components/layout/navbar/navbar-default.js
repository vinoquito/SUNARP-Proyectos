const NavbarDefault = {

    props: {

        structure: {
            type: Object,
            required: true
        },

        titleClass: {
            type: String,
            default: ''
        },

        separatorClass: {
            type: String,
            default: ''
        }
    },

template: `

<nav
    class="fixed top-0 left-0 w-full z-50 bg-white border-b border-gob py-4">

    <div
        class="max-w-7xl
               mx-auto
               px-16
               h-16
               flex
               items-center">

        <div
            class="flex items-center gap-3">

            <img
                v-if="structure.left?.brand?.[0]?.image"
                :src="structure.left.brand[0].image"
                :alt="structure.left.brand[0].image_name || ''"
                class="h-10">

            <div
                v-if="structure.left?.brand?.[1]"
                :class="separatorClass">
            </div>

            <span
                v-if="structure.left?.brand?.[1]"
                :class="titleClass">

                {{ structure.left.brand[1].text }}

            </span>

        </div>

    </div>

</nav>

`
};