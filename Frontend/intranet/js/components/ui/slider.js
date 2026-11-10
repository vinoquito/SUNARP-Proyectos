const Slider = {
    props: {
        items: {
            type: Array,
            default: () => []
        },
        height: {
            type: String,
            default: '256px'  // altura normal si no se especifica
        }
    },

    computed: {
        // Extrae las diapositivas reales, vengan como vengan
        slides() {
            if (!this.items || this.items.length === 0) return [];
            // Si el primer elemento tiene la propiedad 'items', significa que los datos vienen agrupados
            if (this.items[0].items) {
                // Concatena todos los items de todos los grupos (normalmente un solo grupo)
                return this.items.flatMap(group => group.items);
            }
            // Si no, ya es un array plano de slides
            return this.items;
        }
    },

    watch: {
        slides: {
            handler(newVal) {
                if (newVal.length > 0) {
                    this.$nextTick(() => {
                        if (window.initFlowbite) {
                            initFlowbite();
                        }
                    });
                }
            },
            immediate: true
        }
    },

    template: `
    <div class="relative w-full" :style="{ height: height }" data-carousel="slide">
        <div class="relative h-full overflow-hidden">
            <div v-for="(slide, index) in slides"
                 :key="index"
                 :class="[
                    index === 0 ? 'duration-1000 ease-in-out h-full' : 'hidden duration-1000 ease-in-out h-full'
                 ]"
                 data-carousel-item>
                <a v-if="slide.url_destination" :href="slide.url_destination">
                    <img :src="slide.image"
                         :alt="slide.image_name || slide.text || ''"
                         class="absolute block w-full h-full object-cover">
                </a>
                <img v-else
                     :src="slide.image"
                     :alt="slide.image_name || slide.text || ''"
                     class="absolute block w-full h-full object-cover">
            </div>
        </div>

        <!-- Indicadores -->
        <div class="absolute z-30 flex -translate-x-1/2 bottom-5 left-1/2 space-x-3 rtl:space-x-reverse">
            <button v-for="(slide, index) in slides"
                :key="'dot-' + index"
                type="button"
                class="w-3 h-3 rounded-full bg-white/50 hover:bg-white"
                :data-carousel-slide-to="index">
            </button>
        </div>

        <!-- Controles -->
        <button type="button"
            class="absolute top-0 start-0 z-30 flex items-center justify-center h-full px-4"
            data-carousel-prev>
            <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/30">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m15 19-7-7 7-7" />
                </svg>
            </span>
        </button>

        <button type="button"
            class="absolute top-0 end-0 z-30 flex items-center justify-center h-full px-4"
            data-carousel-next>
            <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/30">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7" />
                </svg>
            </span>
        </button>
    </div>
    `
};