const PageHeader = {

    props: [
        'title',
        'subtitle',
        'description'
    ],

    template: `

        <div class="mb-6">

            <h1 class="text-3xl font-bold text-gray-800">

                {{ title }}

            </h1>

            <div
                class="
                    mt-1
                    h-1.5
                    w-10
                    bg-sunarp-green
                "
            ></div>

            <h2
                v-if="subtitle"
                class="text-xl tracking-wide text-gray-600">

                {{ subtitle }}

            </h2>

            <p
                v-if="description"
                class="mt-4 text-base text-gray-600">

                {{ description }}

            </p>

        </div>
    `
};

// const PageHeader = {

//     props: [
//         'title',
//         'subtitle',
//         'description'
//     ],

//     template: `

//         <div class="mb-6">

//             <h1 class="text-3xl font-bold text-gray-800">

//                 {{ title }}

//             </h1>

//             <h2
//                 v-if="subtitle"
//                 class="text-xl tracking-wide text-gray-600">

//                 {{ subtitle }}

//             </h2>

//             <p
//                 v-if="description"
//                 class="mt-4 text-base text-gray-600">

//                 {{ description }}

//             </p>

//         </div>
//     `
// };