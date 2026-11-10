const DataTable = {
  props: {
    columns: { type: Array, default: () => [] },
    rows: { type: Array, default: () => [] },
    items: { type: Array, default: () => [] },
    actions: { type: Boolean, default: true },
    perPage: { type: Number, default: 10 },
    showSearch: { type: Boolean, default: true }   // ← nueva prop
  },
  data() {
    return {
      currentPage: 1,
      searchQuery: '',
      selectedGroup: ''
    };
  },
  computed: {
    rawData() {
      return this.items.length ? this.items : this.rows;
    },
    isGrouped() {
      return this.rawData.length && this.rawData[0]?.hasOwnProperty('title');
    },
    flatRows() {
      if (!this.isGrouped) return this.rawData;
      const groups = this.selectedGroup
        ? this.rawData.filter(g => g.title === this.selectedGroup)
        : this.rawData;
      return groups.flatMap(g => g.items.map(item => ({ ...item, _group: g.title })));
    },
    searchedRows() {
      const query = this.searchQuery.trim().toLowerCase();
      if (!query) return this.flatRows;
      return this.flatRows.filter(row =>
        this.columns.some(col => {
          const val = row[col.key];
          return val != null && String(val).toLowerCase().includes(query);
        })
      );
    },
    groupOptions() {
      if (!this.isGrouped) return [];
      return this.rawData.map(g => ({ value: g.title, label: g.title }));
    },
    totalRows() { return this.searchedRows.length; },
    totalPages() { return Math.ceil(this.totalRows / this.perPage); },
    paginatedRows() {
      const start = (this.currentPage - 1) * this.perPage;
      return this.searchedRows.slice(start, start + this.perPage);
    },
    startItem() {
      if (!this.totalRows) return 0;
      return (this.currentPage - 1) * this.perPage + 1;
    },
    endItem() {
      return Math.min(this.currentPage * this.perPage, this.totalRows);
    },
    // Paginación compacta
    visiblePages() {
      const total = this.totalPages;
      const current = this.currentPage;
      const delta = 2; // páginas alrededor del actual
      if (total <= 15) {
        return Array.from({ length: total }, (_, i) => i + 1);
      }
      let range = [1];
      if (current - delta > 2) range.push('...');
      for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
        range.push(i);
      }
      if (current + delta < total - 1) range.push('...');
      range.push(total);
      return range;
    }
  },
  watch: {
    searchQuery() { this.currentPage = 1; },
    selectedGroup() { this.currentPage = 1; },
    rows() { this.currentPage = 1; },
    items() { this.currentPage = 1; }
  },
  methods: {
    goToPage(page) {
      if (page < 1 || page > this.totalPages || page === '...') return;
      this.currentPage = page;
    }
  },
  template: `
    <div class="space-y-4">
      <div v-if="showSearch" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <app-select
          v-if="isGrouped"
          v-model="selectedGroup"
          placeholder="Todos los grupos"
          :options="groupOptions"
        />
        <div :class="isGrouped ? 'md:col-span-2' : 'md:col-span-3'">
          <app-input-search v-model="searchQuery" placeholder="Buscar..." />
        </div>
      </div>

      <div class="relative overflow-x-auto bg-white border border-gray-200 shadow-sm">
        <table class="w-full text-sm text-left text-gray-500">
          <thead class="text-sm text-gray-700 bg-gray-100 border-b border-gray-200">
            <tr>
              <th v-for="column in columns" :key="column.key" class="px-6 py-3 font-semibold whitespace-nowrap">
                {{ column.label }}
              </th>
              <th v-if="actions" class="px-6 py-3 text-center font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in paginatedRows" :key="index" class="bg-white border-b border-gray-200 hover:bg-gray-50 transition-colors">
              <td v-for="column in columns" :key="column.key" class="px-6 py-4">
                <slot :name="column.key" :row="row" :value="row[column.key]">
                  <span :class="column.bold ? 'font-medium text-gray-900' : ''">
                    {{ row[column.key] }}
                  </span>
                </slot>
              </td>
              <td v-if="actions" class="px-6 py-4">
                <slot name="actions" :row="row" :index="index">
                  <button class="text-blue-600 hover:underline">Acción</button>
                </slot>
              </td>
            </tr>
            <tr v-if="!searchedRows.length">
              <td :colspan="columns.length + (actions ? 1 : 0)" class="px-6 py-8 text-center text-gray-400">
                No hay datos disponibles
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Paginador compacto -->
        <div v-if="totalRows > perPage" class="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border-t border-gray-200 bg-white">
          <span class="text-sm text-gray-500">
            Mostrando del <span class="font-semibold text-gray-900">{{ startItem }}</span> al <span class="font-semibold text-gray-900">{{ endItem }}</span> de <span class="font-semibold text-gray-900">{{ totalRows }}</span>
          </span>

          <div class="flex items-center gap-1">
            <button
              @click="goToPage(currentPage - 1)"
              :disabled="currentPage === 1"
              class="px-3 h-9 border border-gray-300 rounded-l-lg bg-white hover:bg-gray-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>

            <template v-for="page in visiblePages" :key="page">
              <span v-if="page === '...'" class="px-2 text-gray-400 select-none">...</span>
              <button
                v-else
                @click="goToPage(page)"
                :class="[
                  'w-9 h-9 border text-sm',
                  currentPage === page
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-white hover:bg-gray-100 border-gray-300'
                ]"
              >
                {{ page }}
              </button>
            </template>

            <button
              @click="goToPage(currentPage + 1)"
              :disabled="currentPage === totalPages"
              class="px-3 h-9 border border-gray-300 rounded-r-lg bg-white hover:bg-gray-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  `
};

// const DataTable = {

//   props: {

//     columns: {
//       type: Array,
//       default: () => []
//     },

//     rows: {
//       type: Array,
//       default: () => []
//     },

//     actions: {
//       type: Boolean,
//       default: true
//     },

//     perPage: {
//       type: Number,
//       default: 5
//     }
//   },

//   data() {

//     return {

//       currentPage: 1
//     };
//   },

//   computed: {

//     totalRows() {

//       return this.rows.length;
//     },

//     totalPages() {

//       return Math.ceil(
//         this.totalRows / this.perPage
//       );
//     },

//     paginatedRows() {

//       const start =
//         (this.currentPage - 1) * this.perPage;

//       const end =
//         start + this.perPage;

//       return this.rows.slice(start, end);
//     },

//     startItem() {

//       if (!this.totalRows) return 0;

//       return (
//         (this.currentPage - 1) * this.perPage
//       ) + 1;
//     },

//     endItem() {

//       const end =
//         this.currentPage * this.perPage;

//       return Math.min(end, this.totalRows);
//     }
//   },

//   methods: {

//     goToPage(page) {

//       if (
//         page < 1 ||
//         page > this.totalPages
//       ) return;

//       this.currentPage = page;
//     }
//   },

//   template: `

//   <div class="relative overflow-x-auto bg-white border border-gray-200 rounded-lg shadow-sm">

//     <!-- TABLE -->
//     <table class="w-full text-sm text-left text-gray-500">

//       <!-- HEADER -->
//       <thead class="text-sm text-gray-700 bg-gray-100 border-b border-gray-200">

//         <tr>

//           <th
//             v-for="column in columns"
//             :key="column.key"
//             class="px-6 py-3 font-semibold whitespace-nowrap">

//             {{ column.label }}

//           </th>

//           <th
//             v-if="actions"
//             class="px-6 py-3 text-center font-semibold">

//             Acción

//           </th>

//         </tr>

//       </thead>

//       <!-- BODY -->
//       <tbody>

//         <tr
//           v-for="(row, index) in paginatedRows"
//           :key="index"
//           class="bg-white border-b border-gray-200 hover:bg-gray-50 transition-colors">

//           <td
//             v-for="column in columns"
//             :key="column.key"
//             class="px-6 py-4">

//             <slot
//               :name="column.key"
//               :row="row"
//               :value="row[column.key]">

//               <span
//                 :class="column.bold
//                   ? 'font-medium text-gray-900'
//                   : ''">

//                 {{ row[column.key] }}

//               </span>

//             </slot>

//           </td>

//           <!-- ACTIONS -->
//           <td
//             v-if="actions"
//             class="px-6 py-4">

//             <slot
//               name="actions"
//               :row="row"
//               :index="index">

//               <button class="text-blue-600 hover:underline">

//                 Acción

//               </button>

//             </slot>

//           </td>

//         </tr>

//         <!-- EMPTY -->
//         <tr v-if="!rows.length">

//           <td
//             :colspan="columns.length + 1"
//             class="px-6 py-8 text-center text-gray-400">

//             No hay datos disponibles

//           </td>

//         </tr>

//       </tbody>

//     </table>

//     <!-- FOOTER -->
//     <div
//       class="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border-t border-gray-200 bg-white">

//       <!-- TOTAL -->
//       <span class="text-sm text-gray-500">

//         Mostrando del

//         <span class="font-semibold text-gray-900">

//           {{ startItem }} al {{ endItem }}

//         </span>

//         de

//         <span class="font-semibold text-gray-900">

//           {{ totalRows }}

//         </span>

//       </span>

//       <!-- PAGINADOR -->
//       <div class="flex items-center gap-1">

//         <!-- PREV -->
//         <button
//           @click="goToPage(currentPage - 1)"
//           class="px-3 h-9 border border-gray-300 rounded-l-lg bg-white hover:bg-gray-100 text-sm">

//           Anterior

//         </button>

//         <!-- PAGES -->
//         <button
//           v-for="page in totalPages"
//           :key="page"
//           @click="goToPage(page)"
//           :class="[

//             'w-9 h-9 border text-sm',

//             currentPage === page

//               ? 'bg-blue-100 text-blue-700 border-blue-300'
//               : 'bg-white hover:bg-gray-100 border-gray-300'
//           ]">

//           {{ page }}

//         </button>

//         <!-- NEXT -->
//         <button
//           @click="goToPage(currentPage + 1)"
//           class="px-3 h-9 border border-gray-300 rounded-r-lg bg-white hover:bg-gray-100 text-sm">

//           Siguiente

//         </button>

//       </div>

//     </div>

//   </div>

//   `
// };