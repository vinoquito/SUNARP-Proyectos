const PaginationDefault = {

    props: ['page', 'totalPages'],

    computed: {
        pages() {
            const range = 2;
            const total = this.totalPages;
            const current = this.page;
            const pages = [];
            let start = Math.max(1, current - range);
            let end = Math.min(total, current + range);

            if (start > 1) { pages.push(1); if (start > 2) pages.push('...'); }
            for (let i = start; i <= end; i++) pages.push(i);
            if (end < total) { if (end < total - 1) pages.push('...'); pages.push(total); }
            return pages;
        }
    },

    methods: {
        go(page) {
            if (page < 1 || page > this.totalPages) return;
            this.$emit('update:page', page);
        }
    },

    template: `
        <nav class="pagination-gob">
            <button :disabled="page===1" @click="go(page-1)">Anterior</button>
            <template v-for="(p,i) in pages" :key="i">
                <button v-if="p !== '...'" @click="go(p)" :class="{active: p===page}">{{ p }}</button>
                <span v-else>...</span>
            </template>
            <button :disabled="page===totalPages" @click="go(page+1)">Siguiente</button>
        </nav>
    `
};