const exportPdfLogoCache = new Map();
const exportPdfLogoRequests = new Map();

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
            default: 'PDF'
        },

        icon: {
            type: String,
            default: 'picture_as_pdf'
        },

        variant: {
            type: String,
            default: 'secondary'
        },

        orientation: {
            type: String,
            default: 'landscape'
        },

        reportTitle: {
            type: String,
            default: ''
        },

        reportSubtitle: {
            type: String,
            default: ''
        },

        logo: {
            type: String,
            default: ''
        },

        loading: {
            type: Boolean,
            default: false
        }

    },

    emits: ['export-start', 'export-end'],

    data() {

        return {
            isExporting: false
        };

    },

    methods: {

        resolveSections() {

            if (this.sections.length) {
                return this.sections;
            }

            return [{
                title: 'Datos',
                data: this.data,
                columns: this.columns,
                pdfColumns: this.columns,
                groupByLocationAndOrg: false
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

            return Array.isArray(value)
                ? value.join(' / ')
                : String(value);

        },

        getOrganizationLevels(row) {

            const levelKeys = Object.keys(row || {})
                .filter(key =>
                    /^estructura_nivel_\d+$/i.test(key)
                )
                .sort((a, b) =>
                    Number(a.match(/\d+$/)[0]) -
                    Number(b.match(/\d+$/)[0])
                );

            const levels = levelKeys
                .map(key => row[key])
                .filter(value =>
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ''
                )
                .map(value => String(value).trim());

            if (levels.length) {
                return levels;
            }

            return String(row?.organo || '')
                .split(/\s*\/\s*/)
                .map(value => value.trim())
                .filter(Boolean);

        },

        groupRowsByLocalAndOrg(rows) {

            const localGroups = new Map();

            // Map conserva el orden de primera aparición de cada local.
            // Los registros dentro de cada grupo también conservan su orden CSV.
            rows.forEach(row => {

                const sede = String(row.sede || '').trim();
                const local = String(row.local || '').trim();
                const localId = String(row.local_id || '').trim();

                const localKey = [
                    sede,
                    localId || local || '__sin_local__'
                ].join('\u001f');

                if (!localGroups.has(localKey)) {

                    localGroups.set(localKey, {
                        sede,
                        local: local || 'Local no especificado',
                        organizations: new Map()
                    });

                }

                const localGroup = localGroups.get(localKey);
                const organizationLevels = this.getOrganizationLevels(row);
                const reference = String(row.referencia || '').trim();

                const organizationBaseTitle = organizationLevels.length
                    ? organizationLevels.join(' / ')
                    : 'Órgano / Unidad no especificado';

                const organizationKey = [
                    ...organizationLevels,
                    reference
                ].join(String.fromCharCode(31)) || '__sin_organo__';

                if (!localGroup.organizations.has(organizationKey)) {

                    localGroup.organizations.set(organizationKey, {
                        title: reference
                            ? `${organizationBaseTitle} — ${reference}`
                            : organizationBaseTitle,
                        rows: []
                    });

                }

                localGroup.organizations
                    .get(organizationKey)
                    .rows
                    .push(row);

            });

            return Array.from(localGroups.values()).map(localGroup => ({
                ...localGroup,
                organizations: Array.from(localGroup.organizations.values())
            }));

        },

        async loadLogoData() {

            if (!this.logo) {
                return null;
            }

            const logoUrl = String(this.logo).trim();

            if (exportPdfLogoCache.has(logoUrl)) {
                return exportPdfLogoCache.get(logoUrl);
            }

            if (exportPdfLogoRequests.has(logoUrl)) {
                return exportPdfLogoRequests.get(logoUrl);
            }

            const logoRequest = (async () => {

                const response = await fetch(logoUrl);

                if (!response.ok) {
                    throw new Error(`No se pudo cargar el logo: ${response.status}`);
                }

                const blob = await response.blob();

                return await new Promise((resolve, reject) => {

                    const reader = new FileReader();

                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);

                    reader.readAsDataURL(blob);

                });

            })();

            exportPdfLogoRequests.set(logoUrl, logoRequest);

            try {

                const logoData = await logoRequest;

                exportPdfLogoCache.set(logoUrl, logoData);

                return logoData;

            } catch (error) {

                console.warn(
                    'No se pudo incorporar el logo al PDF. Se continuará sin él.',
                    error
                );

                return null;

            } finally {

                exportPdfLogoRequests.delete(logoUrl);

            }

        },

        getReportHeaderLayout(doc) {

            const pageWidth = doc.internal.pageSize.getWidth();

            const subtitleY = 19;
            let subtitleLines = [];

            if (this.reportSubtitle) {

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);

                subtitleLines = doc.splitTextToSize(
                    String(this.reportSubtitle).toUpperCase(),
                    pageWidth - 65
                ).slice(0, 2);

            }

            /*
             * La fecha se coloca inmediatamente después del subtítulo.
             * Su posición se calcula según una o dos líneas para evitar
             * dejar un espacio fijo excesivo cuando el subtítulo es corto.
             */

            const generatedY = subtitleLines.length
                ? subtitleY + (subtitleLines.length * 5) + 2
                : 26;

            const separatorY = generatedY + 4;

            return {
                subtitleLines,
                subtitleY,
                generatedY,
                separatorY,
                contentStartY: separatorY + 8
            };

        },

        drawReportHeaderFooter(doc, logoData) {

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const totalPages = doc.getNumberOfPages();
            const headerLayout = this.getReportHeaderLayout(doc);

            const generatedDate = new Date().toLocaleDateString(
                'es-PE',
                {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'America/Lima'
                }
            );

            for (let page = 1; page <= totalPages; page++) {

                doc.setPage(page);

                if (logoData) {

                    try {

                        const imageProperties = doc.getImageProperties(logoData);
                        const maxWidth = 31;
                        const maxHeight = 17;
                        const scale = Math.min(
                            maxWidth / imageProperties.width,
                            maxHeight / imageProperties.height
                        );

                        doc.addImage(
                            logoData,
                            'PNG',
                            14,
                            6,
                            imageProperties.width * scale,
                            imageProperties.height * scale
                        );

                    } catch (error) {

                        console.warn(
                            'No se pudo dibujar el logo en el PDF.',
                            error
                        );

                    }

                }

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.setTextColor(48, 60, 55);

                doc.text(
                    this.reportTitle || 'REPORTE DE DATOS',
                    51,
                    12,
                    {
                        maxWidth: pageWidth - 65
                    }
                );

                if (headerLayout.subtitleLines.length) {

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.setTextColor(48, 60, 55);

                    doc.text(
                        headerLayout.subtitleLines,
                        51,
                        headerLayout.subtitleY
                    );

                }

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(100, 100, 100);

                doc.text(
                    `Generado: ${generatedDate}`,
                    51,
                    headerLayout.generatedY
                );

                doc.setDrawColor(160, 160, 160);
                doc.setLineWidth(0.25);
                doc.line(14, headerLayout.separatorY, pageWidth - 14, headerLayout.separatorY);

                doc.setDrawColor(190, 190, 190);
                doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(100, 100, 100);

                doc.text(
                    'SUNARP · Directorio telefónico institucional',
                    14,
                    pageHeight - 7
                );

                doc.text(
                    `Página ${page} de ${totalPages}`,
                    pageWidth - 14,
                    pageHeight - 7,
                    {
                        align: 'right'
                    }
                );

            }

        },

        addWrappedHeading(doc, text, x, y, maxWidth, fontSize, color) {

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(fontSize);
            doc.setTextColor(...color);

            const lines = doc.splitTextToSize(
                String(text || ''),
                maxWidth
            );

            doc.text(lines, x, y);

            return lines.length * (fontSize * 0.42) + 2;

        },

        async handleExport() {

            if (this.isExporting || this.loading) {
                return;
            }

            this.isExporting = true;
            this.$emit('export-start');

            try {

                await this.$nextTick();

                await new Promise(resolve =>
                    requestAnimationFrame(resolve)
                );

                if (!window.jspdf) {

                console.error('jsPDF no está disponible.');
                return;

            }

            const { jsPDF } = window.jspdf;

            const doc = new jsPDF({
                orientation: this.orientation,
                unit: 'mm',
                format: 'a4'
            });

            if (typeof doc.autoTable !== 'function') {

                console.error(
                    'jsPDF AutoTable no está disponible.'
                );

                return;

            }

            const sections = this.resolveSections();

            const requiresStructuredReport = Boolean(
                this.reportTitle ||
                this.reportSubtitle ||
                this.logo ||
                sections.length > 1 ||
                sections.some(section => section.groupByLocationAndOrg)
            );

            // Conserva la exportación simple de los listados genéricos.
            if (!requiresStructuredReport) {

                const section = sections[0] || {};
                const rows = Array.isArray(section.data)
                    ? section.data
                    : [];
                const columns = Array.isArray(section.columns)
                    ? section.columns
                    : [];

                doc.autoTable({

                    head: [
                        columns.map(column =>
                            column.label || column.key || ''
                        )
                    ],

                    body: rows.map((row, rowIndex) =>
                        columns.map(column =>
                            this.getExportValue(row, column, rowIndex)
                        )
                    )

                });

                doc.save(`${this.filename}.pdf`);

                return;

            }

                const logoData = await this.loadLogoData();

                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const leftMargin = 14;
                const rightMargin = 14;
                const bottomLimit = pageHeight - 19;
                const contentWidth = pageWidth - leftMargin - rightMargin;

                const headerLayout = this.getReportHeaderLayout(doc);
                let cursorY = headerLayout.contentStartY;

                const startNewPage = () => {

                    doc.addPage();
                    cursorY = headerLayout.contentStartY;

                };

                sections.forEach((section, sectionIndex) => {

                    const rows = Array.isArray(section.data)
                        ? section.data
                        : [];

                    const columns = Array.isArray(section.pdfColumns)
                        && section.pdfColumns.length
                            ? section.pdfColumns
                            : section.columns || [];

                    if (sectionIndex > 0) {
                        cursorY += 4;
                    }

                    if (cursorY + 13 > bottomLimit) {
                        startNewPage();
                    }

                    const sectionHeadingText =
                        `${sectionIndex + 1}. ${section.title || 'Sección'}`;

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(14);

                    const sectionHeadingLines = doc.splitTextToSize(
                        sectionHeadingText,
                        contentWidth
                    );

                    const sectionHeadingLineHeight = 14 * 0.42;

                    if (
                        cursorY +
                        (sectionHeadingLines.length * sectionHeadingLineHeight) +
                        8 >
                        bottomLimit
                    ) {
                        startNewPage();
                    }

                    const sectionHeadingY = cursorY;

                    this.addWrappedHeading(
                        doc,
                        sectionHeadingText,
                        leftMargin,
                        sectionHeadingY,
                        contentWidth,
                        14,
                        [48, 60, 55]
                    );

                    // La línea queda cerca de la última línea del título.
                    const sectionLineY =
                        sectionHeadingY +
                        ((sectionHeadingLines.length - 1) * sectionHeadingLineHeight) +
                        6;

                    doc.setDrawColor(142, 195, 33);
                    doc.setLineWidth(0.7);
                    doc.line(
                        leftMargin,
                        sectionLineY,
                        pageWidth - rightMargin,
                        sectionLineY
                    );

                    // Espacio visual entre la línea verde y el contenido de la sección.
                    cursorY = sectionLineY + 8;

                    if (!rows.length) {

                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(9);
                        doc.setTextColor(100, 100, 100);
                        doc.text(
                            'No hay registros que coincidan con los filtros seleccionados.',
                            leftMargin,
                            cursorY + 3
                        );

                        cursorY += 11;
                        return;

                    }

                    if (!columns.length) {

                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(9);
                        doc.text(
                            'La sección no tiene columnas de exportación configuradas.',
                            leftMargin,
                            cursorY + 3
                        );

                        cursorY += 11;
                        return;

                    }

                    const groupedByLocation = Boolean(
                        section.groupByLocationAndOrg
                    );

                    const localGroups = groupedByLocation
                        ? this.groupRowsByLocalAndOrg(rows)
                        : [{
                            sede: '',
                            local: '',
                            organizations: [{
                                title: '',
                                rows
                            }]
                        }];

                    localGroups.forEach(localGroup => {

                        const localTitle = [
                            localGroup.sede,
                            localGroup.local
                        ]
                            .filter(Boolean)
                            .join(' · ') || 'Local no especificado';

                        if (groupedByLocation) {

                            const localLines = doc.splitTextToSize(
                                localTitle,
                                contentWidth
                            );

                            const localHeadingHeight =
                                localLines.length * 5 + 3;

                            if (cursorY + localHeadingHeight + 13 > bottomLimit) {
                                startNewPage();
                            }

                            cursorY += this.addWrappedHeading(
                                doc,
                                localTitle,
                                leftMargin,
                                cursorY,
                                contentWidth,
                                11,
                                [50, 60, 55]
                            );

                            cursorY += 2;

                        }

                        localGroup.organizations.forEach(organization => {

                            if (groupedByLocation) {

                                const organizationLines = doc.splitTextToSize(
                                    organization.title,
                                    contentWidth
                                );

                                const organizationHeadingHeight =
                                    organizationLines.length * 4.3 + 3;

                                if (
                                    cursorY +
                                    organizationHeadingHeight +
                                    17 >
                                    bottomLimit
                                ) {

                                    startNewPage();

                                    cursorY += this.addWrappedHeading(
                                        doc,
                                        localTitle,
                                        leftMargin,
                                        cursorY,
                                        contentWidth,
                                        10,
                                        [70, 80, 75]
                                    );

                                }

                                const organizationRenderedHeight =
                                    this.addWrappedHeading(
                                        doc,
                                        organization.title,
                                        leftMargin,
                                        cursorY,
                                        contentWidth,
                                        9.5,
                                        [75, 75, 75]
                                    );

                                // Mantiene el título prácticamente unido a la tabla siguiente.
                                cursorY += Math.max(
                                    0,
                                    organizationRenderedHeight - 4.5
                                );

                            }

                            const body = organization.rows.map((row, rowIndex) =>
                                columns.map(column =>
                                    this.getExportValue(row, column, rowIndex)
                                )
                            );

                            const columnStyles = {};

                            columns.forEach((column, columnIndex) => {

                                const width = Number(column.width);

                                if (Number.isFinite(width) && width > 0) {

                                    columnStyles[columnIndex] = {
                                        cellWidth: width
                                    };

                                }

                            });

                            doc.autoTable({

                                startY: cursorY + 0.5,

                                margin: {
                                    top: 42,
                                    bottom: 18,
                                    left: leftMargin,
                                    right: rightMargin
                                },

                                tableWidth: 'wrap',

                                head: [
                                    columns.map(column =>
                                        column.label || column.key || ''
                                    )
                                ],

                                body,

                                theme: 'grid',

                                styles: {
                                    font: 'helvetica',
                                    fontSize: 8,
                                    cellPadding: 2.2,
                                    overflow: 'linebreak',
                                    valign: 'top',
                                    textColor: [40, 40, 40],
                                    lineColor: [215, 220, 217],
                                    lineWidth: 0.15
                                },

                                headStyles: {
                                    fillColor: [50, 60, 55],
                                    textColor: [255, 255, 255],
                                    fontStyle: 'bold',
                                    fontSize: 8
                                },

                                alternateRowStyles: {
                                    fillColor: [245, 247, 246]
                                },

                                columnStyles,

                                showHead: 'everyPage',
                                rowPageBreak: 'avoid',

                                willDrawPage: data => {

                                    // Si una tabla continúa en otra página,
                                    // se repite el contexto físico y orgánico.
                                    if (
                                        groupedByLocation &&
                                        data.pageNumber > 1
                                    ) {

                                        doc.setFont('helvetica', 'bold');
                                        doc.setFontSize(7.5);
                                        doc.setTextColor(75, 75, 75);

                                        doc.text(
                                            localTitle,
                                            leftMargin,
                                            34,
                                            {
                                                maxWidth: contentWidth
                                            }
                                        );

                                        doc.setFont('helvetica', 'bold');
                                        doc.setFontSize(9.5);

                                        doc.text(
                                            organization.title,
                                            leftMargin,
                                            40,
                                            {
                                                maxWidth: contentWidth
                                            }
                                        );

                                    }

                                }

                            });

                            cursorY =
                                doc.lastAutoTable.finalY + 9;

                        });

                    });

                });

                this.drawReportHeaderFooter(doc, logoData);

                doc.save(
                    `${this.filename}.pdf`
                );

            } catch (error) {

                console.error(
                    'No se pudo generar el archivo PDF:',
                    error
                );

            } finally {

                this.isExporting = false;
                this.$emit('export-end');

            }

        }

    },

    template: `
        <app-button
            :label="(isExporting || loading) ? 'Generando PDF...' : label"
            :icon="(isExporting || loading) ? 'progress_activity' : icon"
            :variant="variant"
            :disabled="isExporting || loading"
            :loading="isExporting || loading"
            @click="handleExport"
        />
    `

};
