const ExportExcelButton = {

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
            default: 'Excel'
        },

        icon: {
            type: String,
            default: 'table_view'
        },

        variant: {
            type: String,
            default: 'secondary'
        }
    },

    methods: {

        handleExport() {

            if (!window.XLSX) {
                console.error('XLSX no está disponible.');
                return;
            }

            const wsData = [
                this.columns.map(column => column.label),

                ...this.data.map(row =>
                    this.columns.map(column =>
                        row[column.key] ?? ''
                    )
                )
            ];

            const worksheet =
                window.XLSX.utils.aoa_to_sheet(wsData);

            const workbook =
                window.XLSX.utils.book_new();

            window.XLSX.utils.book_append_sheet(
                workbook,
                worksheet,
                'Datos'
            );

            window.XLSX.writeFile(
                workbook,
                `${this.filename}.xlsx`
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