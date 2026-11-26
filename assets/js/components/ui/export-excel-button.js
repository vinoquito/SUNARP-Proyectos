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

        sections: {
            type: Array,
            default: () => []
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

        resolveSections() {

            if (this.sections.length) {
                return this.sections;
            }

            return [{
                title: 'Datos',
                sheetName: 'Datos',
                data: this.data,
                columns: this.columns
            }];

        },

        getExportValue(row, column, index) {

            let value;

            if (typeof column.value === 'function') {

                value = column.value(row, index);

            } else if (typeof column.parts === 'function') {

                const parts = column.parts(row, index) || {};

                value = [
                    parts.primary,
                    ...(Array.isArray(parts.secondary)
                        ? parts.secondary
                        : [])
                ]
                    .filter(part =>
                        part !== undefined &&
                        part !== null &&
                        String(part).trim() !== ''
                    )
                    .join(' / ');

            } else {

                value = row?.[column.key];

            }

            if (value === undefined || value === null) {
                return '';
            }

            if (Array.isArray(value)) {
                return value.join(' / ');
            }

            // Los números telefónicos y anexos deben conservarse como texto.
            return String(value);

        },

        getWorksheetName(name, usedNames, index) {

            const baseName = String(name || `Datos ${index + 1}`)
                .replace(/[\\/*?:\[\]]/g, ' ')
                .trim()
                .slice(0, 31) || `Datos ${index + 1}`;

            let candidate = baseName;
            let suffix = 2;

            while (usedNames.has(candidate.toLowerCase())) {

                const ending = ` ${suffix++}`;

                candidate =
                    baseName.slice(0, 31 - ending.length) + ending;

            }

            usedNames.add(candidate.toLowerCase());

            return candidate;

        },

        getColumnWidth(rows, column, columnIndex) {

            const label = String(column.label || column.key || '');
            let maxLength = label.length;

            rows.forEach((row, index) => {

                const value = this.getExportValue(row, column, index);
                const lines = String(value).split(/\r?\n/);

                lines.forEach(line => {
                    maxLength = Math.max(maxLength, line.length);
                });

            });

            return Math.max(12, Math.min(44, maxLength + 2));

        },

        async handleExport() {

            const ExcelJS = window.ExcelJS;

            if (!ExcelJS || typeof ExcelJS.Workbook !== 'function') {

                console.error(
                    'ExcelJS no está disponible. Verifica la carga de la biblioteca.'
                );

                return;

            }

            try {

                const workbook = new ExcelJS.Workbook();

                workbook.creator = 'SUNARP';
                workbook.lastModifiedBy = 'SUNARP';
                workbook.created = new Date();
                workbook.modified = new Date();
                workbook.title = 'Directorio Telefónico Institucional';
                workbook.subject = 'Directorio de personal, teléfonos directos y anexos';

                const usedSheetNames = new Set();
                const sections = this.resolveSections();

                sections.forEach((section, sectionIndex) => {

                    const rows = Array.isArray(section.data)
                        ? section.data
                        : [];

                    const columns = Array.isArray(section.columns)
                        ? section.columns
                        : [];

                    if (!columns.length) {
                        return;
                    }

                    const sheetName = this.getWorksheetName(
                        section.sheetName || section.title,
                        usedSheetNames,
                        sectionIndex
                    );

                    const worksheet = workbook.addWorksheet(sheetName, {
                        views: [{
                            state: 'frozen',
                            ySplit: 1
                        }]
                    });

                    const headerRow = worksheet.addRow(
                        columns.map(column =>
                            column.label || column.key || ''
                        )
                    );

                    headerRow.height = 24;

                    headerRow.eachCell(cell => {

                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: {
                                argb: 'FF000000'
                            }
                        };

                        cell.font = {
                            name: 'Arial',
                            size: 10,
                            bold: true,
                            color: {
                                argb: 'FFFFFFFF'
                            }
                        };

                        cell.alignment = {
                            vertical: 'middle',
                            horizontal: 'left',
                            wrapText: true
                        };

                    });

                    rows.forEach((row, rowIndex) => {

                        const values = columns.map(column =>
                            this.getExportValue(row, column, rowIndex)
                        );

                        const addedRow = worksheet.addRow(values);

                        addedRow.alignment = {
                            vertical: 'top',
                            wrapText: true
                        };

                        addedRow.font = {
                            name: 'Arial',
                            size: 10,
                            color: {
                                argb: 'FF202020'
                            }
                        };

                    });

                    columns.forEach((column, columnIndex) => {

                        worksheet.getColumn(columnIndex + 1).width =
                            this.getColumnWidth(rows, column, columnIndex);

                    });

                    worksheet.autoFilter = {
                        from: {
                            row: 1,
                            column: 1
                        },
                        to: {
                            row: Math.max(1, rows.length + 1),
                            column: columns.length
                        }
                    };

                });

                if (!workbook.worksheets.length) {

                    console.error(
                        'No hay columnas configuradas para generar el Excel.'
                    );

                    return;

                }

                const buffer = await workbook.xlsx.writeBuffer();

                const blob = new Blob(
                    [buffer],
                    {
                        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    }
                );

                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');

                link.href = url;
                link.download = `${this.filename}.xlsx`;

                document.body.appendChild(link);
                link.click();
                link.remove();

                window.setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                }, 1000);

            } catch (error) {

                console.error(
                    'No se pudo generar el archivo Excel:',
                    error
                );

            }

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
