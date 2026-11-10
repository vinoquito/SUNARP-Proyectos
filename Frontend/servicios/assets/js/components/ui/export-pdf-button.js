const ExportPdfButton = {

    props: {
        data: {
            type: Array,
            required: true
        },

        columns: {
            type: Array,
            required: true
        },

        filename: {
            type: String,
            default: 'export'
        },

        label: {
            type: String,
            default: 'PDF'
        },

        icon: {
            type: String,
            default: 'picture_as_pdf'
        },

        variant: {
            type: String,
            default: 'secondary'
        }
    },

    methods: {

        handleExport() {

            if (!window.jspdf) {
                console.error('jsPDF no está disponible.');
                return;
            }

            const { jsPDF } = window.jspdf;

            const doc = new jsPDF('landscape');

            if (typeof doc.autoTable !== 'function') {
                console.error(
                    'jsPDF AutoTable no está disponible.'
                );
                return;
            }

            doc.autoTable({

                head: [
                    this.columns.map(
                        column => column.label
                    )
                ],

                body: this.data.map(row =>
                    this.columns.map(
                        column =>
                            row[column.key] ?? ''
                    )
                )
            });

            doc.save(
                `${this.filename}.pdf`
            );
        }
    },

    template: `
        <app-button
            :label="label"
            :icon="icon"
            :variant="variant"
            @click="handleExport"
        />
    `
};