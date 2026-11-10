const AppBadge = {

    props: {

        label: {
            type: String,
            default: ''
        },

        variant: {
            type: String,
            default: 'neutral'
        }
    },

computed: {

    badgeClass() {

        const variants = {

            brand:
                'bg-blue-100 text-blue-800 ring-blue-600/20',

            neutral:
                'bg-slate-100 text-slate-700 ring-slate-500/20',

            gray:
                'bg-gray-100 text-gray-700 ring-gray-500/20',

            success:
                'bg-green-100 text-green-800 ring-green-600/20',

            danger:
                'bg-red-100 text-red-800 ring-red-600/20',

            warning:
                'bg-yellow-100 text-yellow-800 ring-yellow-600/20'
        };

        return variants[this.variant] ||
               variants.neutral;
    }
},

    template: `

        <span
            :class="badgeClass"
            class="inline-flex items-center px-2 py-1 ring-1 ring-inset text-sm font-medium rounded">

            {{ label }}

        </span>

    `
};