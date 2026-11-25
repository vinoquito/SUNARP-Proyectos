const FooterDefault = {

    props: {

        structure: {
            type: Object,
            required: true
        }
    },

    template: `

    <footer
        class="footer-gob 
               text-white"
               >

        <div
            class="max-w-7xl
                   mx-auto
                   px-16
                   py-10"
                   >

            <div
                class="flex
                       flex-col 
                       md:flex-row
                       justify-between
                       gap-8">

                <div>

                    <div
                        v-for="(item,index)
                            in structure.left?.contact || []"
                        :key="index"
                        class="flex gap-3 mb-3">

                        <span
                            v-if="item.icon"
                            class="material-symbols-outlined">

                            {{ item.icon }}

                        </span>

                        <span>

                            {{ item.text }}

                        </span>

                    </div>

                </div>

                <div>

                    <img
                        v-if="structure.right?.brand?.[0]?.image"
                        :src="structure.right.brand[0].image"
                        :alt="structure.right.brand[0].image_name || ''"
                        class="h-32 brightness-0 invert">

                </div>

            </div>

        </div>

    </footer>

    `
};