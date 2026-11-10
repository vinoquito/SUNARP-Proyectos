const CardVerticalSimple = {
  props: ['title', 'items'],

  template: `
    <div class="border border-gray-200 shadow-lg bg-white flex flex-col">

      <div class="px-6 pt-4 pb-2">
        <h2 class="text-gray-800 font-bold text-xl">{{ title }}</h2>
        <hr class="border-t border-gray-200 mt-2 -mx-6">
      </div>

      <div class="px-6 py-4 space-y-4">

        <template v-for="(item, i) in items" :key="i">

          <a
            :href="item.url"
            :target="item.target"
            :rel="item.target === '_blank'
                ? 'noopener noreferrer'
                : null"
            class="flex items-center justify-between group">
              
            <span class="text-gray-700 font-medium group-hover:text-blue-600 group-hover:underline transition-colors">
              {{ item.text }}
            </span>

            <svg
                class="w-10 h-10
                      stroke-current
                      fill-none
                      stroke-[1.5]
                      text-gray-500 group-hover:text-blue-600
                      transition-colors">
                <use :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon"></use>
            </svg>

          </a>

          <hr 
            v-if="i < items.length - 1"
            class="border-t border-gray-200"
          >

        </template>

      </div>

    </div>
  `
};