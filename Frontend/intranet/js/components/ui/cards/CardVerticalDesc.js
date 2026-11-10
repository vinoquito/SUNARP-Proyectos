const CardVerticalDesc = {
    props: ['title', 'items'],
    template: `
    <div class="h-full w-full flex flex-col bg-white">

      <div class="px-6 pt-4 pb-2">
        <h2 class="text-gray-800 font-bold text-xl">{{ title }}</h2>
        <hr class="border-t border-gray-200 mt-3 -mx-6">
      </div>

      <div class="flex-1 flex flex-col px-6 py-4">

        <template v-for="(item, i) in items">

          <div class="py-3">
            <a
              :href="item.url"
              :target="item.target"
              :rel="item.target === '_blank'
                  ? 'noopener noreferrer'
                  : null"
              class="flex items-center justify-between gap-4 group">

              <div class="flex-1">
                <h3 class="text-gray-800 font-semibold text-lg group-hover:text-blue-600 group-hover:underline transition-colors">
                  {{ item.text }}
                </h3>

                <p class="text-gray-500 text-sm mt-1">
                  {{ item.description }}
                </p>
              </div>

              <svg
                  class="w-12 h-12 shrink-0 stroke-current fill-none stroke-[1.5] text-gray-500 group-hover:text-blue-600 transition-colors">
                  <use :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon"></use>
              </svg>

            </a>
          </div>

          <hr
            v-if="i < items.length - 1"
            class="border-t border-gray-200 my-2">

        </template>

      </div>
    </div>
  `
};