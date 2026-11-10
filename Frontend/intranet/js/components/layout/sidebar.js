const SideBarIntranet = {

    props: {

        primary: {
            type: Array,
            default: () => []
        },

        secondary: {
            type: Array,
            default: () => []
        }
    },

    template: `
        <aside id="top-bar-sidebar"
            class="fixed sm:static top-0 left-0 z-40 w-64 h-screen sm:h-auto bg-white border-r border-gray-200 transform -translate-x-full sm:translate-x-0 transition-transform">
            
            <div class="h-full px-3 py-4 overflow-y-auto bg-white border-r border-gray-200">

                <a href="https://flowbite.com/" class="flex items-center ps-2.5 mb-5 sm:hidden">
                    <img src="https://flowbite.com/docs/images/logo.svg" class="h-6 me-3">
                    <span class="self-center text-lg font-semibold whitespace-nowrap text-gray-700">
                        Sunarp
                    </span>
                </a>

                <!-- PRINCIPAL -->
                <ul class="space-y-2 font-medium">

                    <li v-for="item in primary" :key="item.text">

                        <a
                            :href="item.url_destination"
                            v-bind:target="item.target"
                            class="flex items-center px-2 py-1.5 text-gray-600 rounded-lg hover:bg-gray-100 hover:text-blue-600 hover:underline group">

                            <svg
                                class="w-5 h-5 stroke-current fill-none flex-shrink-0">
                                <use :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon"></use>
                            </svg>

                            <span class="ms-3">
                                {{ item.text }}
                            </span>

                        </a>

                    </li>

                </ul>

                <hr class="my-4 border-t border-gray-200">

                <!-- SECUNDARIO -->
                <ul class="space-y-2 text-sm text-gray-500">

                    <li v-for="item in secondary" :key="item.text">

                        <a
                            :href="item.url_destination"
                            v-bind:target="item.target"
                            class="block px-2 py-1.5 rounded-lg hover:bg-gray-100 hover:text-blue-600 hover:underline transition-colors">

                            {{ item.text }}

                        </a>

                    </li>

                </ul>

            </div>
        </aside>
    `
};