const CardGridCompact = {
  props: {
    title: String,
    items: Array,
    showMore: { type: Boolean, default: false },
    moreUrl: { type: String, default: null }
  },

  methods: {
    getMoreUrl() {
      if (this.moreUrl) return this.moreUrl;
      const slug = this.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      return `content.html#${slug}`;
    }
  },

  template: `
    <div class="border border-gray-200 bg-white p-4 hover:shadow-md transition">
      <h2 class="text-gray-800 font-bold text-lg mb-4 flex items-center">
        <span v-if="items[0]?.groupIcon" 
              v-html="items[0].groupIcon"
              class="w-5 h-5 mr-2 text-gray-600 
                     [&>svg]:w-5 [&>svg]:h-5 
                     [&>svg]:stroke-current">
        </span>
        {{ title }}
      </h2>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <a 
          v-for="(item, i) in items"
          :key="i"
          :href="item.url"
          :target="item.target"
          :rel="item.target === '_blank' ? 'noopener noreferrer' : null"
          class="flex flex-col items-center text-center group"
        >
          <svg class="w-8 h-8 mb-2 stroke-current fill-none stroke-[1.5]
                      text-gray-500 group-hover:text-blue-600 transition-colors">
            <use :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon"></use>
          </svg>
          <span class="text-gray-600 text-sm group-hover:text-blue-600 group-hover:underline transition-colors">
            {{ item.text }}
          </span>
        </a>
      </div>

      <!-- Enlace "ver más..." debajo y a la derecha -->
      <div v-if="showMore" class="mt-3 text-right">
        <a :href="getMoreUrl()"
           class="inline-block text-sm font-medium text-gray-500 hover:text-blue-600 hover:underline transition-colors">
          ver más...
        </a>
      </div>
    </div>
  `
};