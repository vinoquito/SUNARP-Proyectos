const CardDefault = {

    props: {

        title: {
            type: String,
            default: ''
        },

        items: {
            type: Array,
            default: () => []
        },

        fields: {
            type: Array,
            default: () => []
        },

        link: {
            type: Object,
            default: null
        }

    },

    methods: {

        getValue(item, field) {

            if (typeof field.value === 'function') {
                return field.value(item);
            }

            if (field.key) {
                return field.key
                    .split('.')
                    .reduce((value, key) => value?.[key], item);
            }

            return '';
        }

    },

    template: `
<section class="max-w-7xl mx-auto px-16 py-8">

    <h2
        v-if="title"
        class="section-title"
    >
        {{ title }}
    </h2>

    <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

        <article
            v-for="(item, index) in items"
            :key="index"
            class="card-default"
        >

            <template
                v-for="(field, fieldIndex) in fields"
                :key="fieldIndex"
            >

                <!-- Título -->
                <h3
                    v-if="field.type === 'title'"
                    :class="field.class || 'card-default-title'"
                >
                    {{ getValue(item, field) }}
                </h3>

                <!-- Texto -->
                <p
                    v-else-if="
                        field.type === 'text' &&
                        getValue(item, field)
                    "
                    :class="field.class || ''"
                >

                    <span
                        v-if="field.icon"
                        class="material-symbols-outlined text-[18px]!"
                        :class="field.iconClass || ''"
                    >
                        {{ field.icon }}
                    </span>

                    <span v-if="field.label">
                        {{ field.label }}
                    </span>

                    {{ getValue(item, field) }}

                </p>

            </template>

            <!-- Enlace -->
            <a
                v-if="link && getValue(item, link)"
                :href="getValue(item, link)"
                :target="link.target || '_self'"
                :class="link.class || 'card-default-link flex items-center gap-1 underline font-medium mt-4'"
            >
                {{ link.label || 'Ver más' }}

                <svg
                    class="w-2 ml-1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 10.1 16.3"
                    aria-hidden="true"
                >
                    <path
                        fill="currentColor"
                        d="M0,14.4l6.2-6.2L0,1.9L2,0l8.1,8.1L2,16.3L0,14.4z"
                    />
                </svg>
            </a>

        </article>

    </div>

</section>
`
};

// const CardDefault = {
//     props: ['title','items'],
//     template: `
// <section class="max-w-7xl mx-auto px-16 py-8">

//     <h2 v-if="title" class="section-title">
//         {{ title }}
//     </h2>

//     <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
//         <article v-for="(item,index) in items" :key="index" class="card-default">

//             <!-- Nombre -->
//             <h3 class="card-default-title">
//                 {{ item.nombre }}
//             </h3>

//             <!-- Ubicación administrativa -->
//             <p class="card-default-location flex gap-1">
//                 <span class="material-symbols-outlined text-[18px]! text-gray-700">map</span>
//                 {{ item.departamento }} - {{ item.provincia }} - {{ item.distrito }}
//             </p>

//             <!-- Dirección con icono -->
//             <p class="card-default-address flex gap-1 mt-2">
//                 <span class="material-symbols-outlined text-[18px]!">location_on</span>
//                 {{ item.direccion }}
//             </p>

//             <!-- Referencia para la dirección, menor tamaño, mismo color de location -->
//             <p v-if="item.referencia" class="flex gap-1 text-gray-500 mt-2">
//                 <span class="material-symbols-outlined text-[18px]! text-gray-500">push_pin</span>
//                 Referencia: {{ item.referencia }}
//             </p>

//             <!-- Ver mapa con flecha como icono, sin subrayado en el icono -->
//             <a 
//             v-if="item.url"
//             :href="item.url"
//             :target="item.target"
//             class="card-default-link flex items-center gap-1 underline font-medium mt-4"
//             >
//             Ver mapa
//                 <svg class="w-2 ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.1 16.3" aria-hidden="true">
//                     <path fill="currentColor" d="M0,14.4l6.2-6.2L0,1.9L2,0l8.1,8.1L2,16.3L0,14.4z"/>
//                 </svg>
//             </a>

//         </article>
//     </div>
// </section>
// `
// };
