const FooterIntranet = {

    data() {

        return {

            currentYear: new Date().getFullYear()
        };
    },

    template: `

        <footer class="mt-8 border-t border-gray-200 pt-6 text-center text-gray-500 text-sm">

            <p>

                Desarrollado por la Oficina de Comunicaciones e Imagen Institucional - OCOII

                <span class="mx-2">|</span>

                © {{ currentYear }} Sunarp

            </p>

        </footer>
    `
};