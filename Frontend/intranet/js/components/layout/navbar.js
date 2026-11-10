const NavBarIntranet = {
    props: {
        brand: {
            type: Object,
            default: () => ({})
        },
        socialItems: {
            type: Array,
            default: () => []
        }
    },
    template: `
        <nav class="col-span-2 row-start-1 bg-white border-b border-gray-200 flex items-center px-4">
            <div class="w-full px-3 py-3 lg:px-5 lg:pl-3">
                <div class="flex items-center justify-between w-full">

                    <div class="flex items-center justify-start rtl:justify-end">

                        <button data-drawer-target="top-bar-sidebar"
                            data-drawer-toggle="top-bar-sidebar"
                            aria-controls="top-bar-sidebar"
                            type="button"
                            class="sm:hidden text-gray-500 bg-transparent border border-transparent hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 font-medium rounded-lg text-sm p-2 focus:outline-none">
                            <span class="sr-only">Abrir sidebar</span>
                            <svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
                                fill="none" viewBox="0 0 24 24">
                                <path stroke="currentColor" stroke-linecap="round" stroke-width="2"
                                    d="M5 7h14M5 12h14M5 17h10" />
                            </svg>
                        </button>

                        <brand :brand="brand"></brand>

                    </div>

                    <div class="flex-1 flex justify-center">
                        <div class="flex gap-2">
                            <social-links :items="socialItems"></social-links>
                        </div>
                    </div>

                    <div class="flex items-center">
                        <div class="flex items-center ms-3">
                            <img
                                src="/intranet/imagenes/ui/sunarp-logo.svg"
                                alt="SUNARP"
                                class="h-12 w-auto object-contain"
                            />
                        </div>
                    </div>

                </div>
            </div>
        </nav>
    `
};