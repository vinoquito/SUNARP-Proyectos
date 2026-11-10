const CardGrid = {

  props: {

    title: String,

    items: Array,

    layout: {
      type: String,
      default: 'vertical'
    },

    columns: {
      type: Number,
      default: 5
    }

  },

  computed: {

    gridClass() {

      const cols = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
        5: 'grid-cols-5'
      };

      return cols[this.columns] || 'grid-cols-5';
    },

    cardClass() {

      return this.layout === 'horizontal'
        ? 'flex flex-row items-center gap-4 text-left'
        : 'flex flex-col items-center text-center';
    },

    iconClass() {

      return this.layout === 'horizontal'
        ? 'w-14 h-14 shrink-0 stroke-current fill-none stroke-[1.5]'
        : 'w-14 h-14 mb-2 stroke-current fill-none stroke-[1.5]';

    }

  },

  template: `
    <div class="border border-gray-200 bg-white shadow-sm p-6">

      <h2 class="text-gray-800 font-bold text-xl mb-6">
        {{ title }}
      </h2>

      <div
        :class="[
          'grid gap-4',
          'grid-cols-1 sm:grid-cols-2',
          'md:' + gridClass
        ]">

        <a
          v-for="(item, i) in items"
          :key="i"
          :href="item.url"
          :target="item.target"
          :rel="item.target === '_blank'
            ? 'noopener noreferrer'
            : null"
          :class="[
            'group',
            'border border-gray-200 bg-gray-50 p-4 hover:shadow-md transition',
            cardClass
          ]">

          <svg
            :class="[
              iconClass,
              'text-gray-600 group-hover:text-blue-600 transition-colors'
            ]">

            <use
              :href="'/intranet/imagenes/iconos/icons.svg#' + item.icon">
            </use>

          </svg>

          <div
            :class="layout === 'horizontal'
              ? 'flex flex-col'
              : ''">

            <span
              class="
                text-gray-700
                font-medium
                group-hover:text-blue-600
                group-hover:underline
                transition-colors
              ">
              {{ item.text }}
            </span>

            <p
              v-if="layout === 'horizontal' && item.description"
              class="text-sm text-gray-500 mt-1">

              {{ item.description }}

            </p>

          </div>

        </a>

      </div>

    </div>
  `
};