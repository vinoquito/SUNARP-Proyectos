const Breadcrumb = {
    props: ['items'],

    template: `
    <nav class="flex mb-4" aria-label="Breadcrumb">
      <ol class="inline-flex items-center space-x-1 md:space-x-2 rtl:space-x-reverse">

        <li
          v-for="(item, index) in items"
          :key="index"
          :class="index === 0 ? 'inline-flex items-center' : ''"
          :aria-current="index === items.length - 1 ? 'page' : null"
        >

          <!-- HOME -->
          <template v-if="index === 0">
            <a
              :href="item.url || '#'"
              class="inline-flex items-center text-sm font-medium text-gray-700 hover:text-blue-600 hover:underline"
            >
              <span v-if="item.icon" v-html="item.icon" class="w-4 h-4 me-1.5"></span>
              {{ item.text }}
            </a>
          </template>

          <!-- RESTO -->
          <template v-else>
            <div class="flex items-center space-x-1.5">

              <svg class="w-3.5 h-3.5 rtl:rotate-180 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24">
                <path stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="m9 5 7 7-7 7"/>
              </svg>

              <template v-if="index !== items.length - 1">
                <a
                  :href="item.url || '#'"
                  class="text-sm font-medium text-gray-700 hover:text-blue-600 hover:underline"
                >
                  {{ item.text }}
                </a>
              </template>

              <template v-else>
                <span class="text-sm font-medium text-gray-400">
                  {{ item.text }}
                </span>
              </template>

            </div>
          </template>

        </li>

      </ol>
    </nav>
    `
};