const ExportPdfButton = {

    props: {
        data: { type: Array, required: true },
        columns: { type: Array, required: true },
        filename: { type: String, default: 'export' },
        label: { type: String, default: 'PDF' },
        icon: { type: String, default: 'picture_as_pdf' },
        variant: { type: String, default: 'secondary' },

        /*
         * Configuración opcional de agrupación.
         * Si no se proporciona, el componente conserva
         * la exportación tabular convencional.
         */
        grouping: {
            type: Object,
            default: null
        },

        /*
         * Logo institucional opcional. Cada página que use
         * este componente puede proporcionar su propio logo.
         */
        logo: {
            type: String,
            default: ''
        }
    },

    methods: {

        getCellValue(row, column) {
            const value = typeof column.value === 'function'
                ? column.value(row)
                : row[column.key];

            return value === undefined || value === null
                ? ''
                : String(value);
        },

        loadImageData(url) {
            return new Promise(resolve => {
                if (!url) {
                    resolve(null);
                    return;
                }

                const image = new Image();
                image.crossOrigin = 'anonymous';

                image.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = image.naturalWidth;
                        canvas.height = image.naturalHeight;

                        const context = canvas.getContext('2d');
                        context.drawImage(image, 0, 0);

                        resolve({
                            data: canvas.toDataURL('image/png'),
                            width: image.naturalWidth,
                            height: image.naturalHeight
                        });
                    } catch (error) {
                        console.warn('No se pudo preparar el logo del PDF:', error);
                        resolve(null);
                    }
                };

                image.onerror = () => resolve(null);
                image.src = url;
            });
        },

        drawPageHeader(doc, section, logoData, pageWidth, margin) {
            const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
            const logoWidth = logoData ? 25 : 0;
            const logoHeight = logoData
                ? Math.min(14, logoWidth * logoData.height / logoData.width)
                : 0;

            if (logoData) {
                doc.addImage(
                    logoData.data,
                    'PNG',
                    margin.left,
                    9,
                    logoWidth,
                    logoHeight
                );
            }

            const textX = margin.left + (logoData ? 31 : 0);
            const textWidth = pageWidth - margin.right - textX;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(35, 35, 35);
            doc.text('SUPERINTENDENCIA NACIONAL DE LOS REGISTROS PÚBLICOS', textX, 13);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(70, 70, 70);

            const titleLines = doc.splitTextToSize(
                section.title || 'Directorio telefónico',
                textWidth
            );

            doc.text(titleLines, textX, 19);

            const subtitleY = 19 + (titleLines.length * 4);
            if (section.subtitle) {
                doc.setFontSize(8);
                doc.text(
                    doc.splitTextToSize(section.subtitle, textWidth),
                    textX,
                    subtitleY
                );
            }

            doc.setDrawColor(190, 190, 190);
            doc.setLineWidth(0.3);
            doc.line(margin.left, 29, pageWidth - margin.right, 29);

            return Math.max(34, subtitleY + 5);
        },

        handleExport() {
            if (!window.jspdf) {
                console.error('jsPDF no está disponible.');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            if (typeof doc.autoTable !== 'function') {
                console.error('jsPDF AutoTable no está disponible.');
                return;
            }

            const margin = { top: 35, right: 12, bottom: 14, left: 12 };
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const logoUrl = this.logo
                ? new URL(this.logo, document.baseURI).href
                : '';

            this.loadImageData(logoUrl).then(logoData => {
                if (
                    this.grouping &&
                    typeof this.grouping.getSections === 'function'
                ) {
                    this.exportGroupedPdf(
                        doc,
                        logoData,
                        pageWidth,
                        pageHeight,
                        margin
                    );
                    return;
                }

                this.exportTablePdf(doc, logoData, pageWidth, margin);
            });
        },

        exportTablePdf(doc, logoData, pageWidth, margin) {
            const section = {
                title: 'Exportación de datos',
                subtitle: ''
            };

            const headerY = this.drawPageHeader(
                doc,
                section,
                logoData,
                pageWidth,
                margin
            );

            doc.autoTable({
                startY: headerY,
                margin,
                head: [this.columns.map(column => column.label)],
                body: this.data.map(row =>
                    this.columns.map(column => this.getCellValue(row, column))
                ),
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    cellPadding: 2.2,
                    overflow: 'linebreak',
                    valign: 'middle'
                },
                headStyles: {
                    fillColor: [235, 236, 238],
                    textColor: [35, 35, 35],
                    fontStyle: 'bold',
                    lineColor: [205, 205, 205],
                    lineWidth: 0.2
                },
                alternateRowStyles: {
                    fillColor: [250, 250, 250]
                },
                columnStyles: this.getColumnStyles(),
                didDrawPage: () => {
                    const page = doc.internal.getCurrentPageInfo().pageNumber;
                    if (page > 1) {
                        this.drawPageHeader(
                            doc,
                            section,
                            logoData,
                            pageWidth,
                            margin
                        );
                    }
                }
            });

            doc.save(`${this.filename}.pdf`);
        },

        getColumnStyles() {
            const styles = {};

            this.columns.forEach((column, index) => {
                if (column.width) {
                    styles[index] = { cellWidth: column.width };
                }

                if (column.align) {
                    styles[index] = {
                        ...(styles[index] || {}),
                        halign: column.align
                    };
                }
            });

            return styles;
        },

        exportGroupedPdf(doc, logoData, pageWidth, pageHeight, margin) {
            const sections = this.grouping.getSections(this.data) || [];
            let currentSection = null;
            let lastHeaderPage = 0;
            let y = margin.top;

            const drawHeaderIfNeeded = () => {
                const page = doc.internal.getCurrentPageInfo().pageNumber;
                if (page !== lastHeaderPage) {
                    y = this.drawPageHeader(
                        doc,
                        currentSection,
                        logoData,
                        pageWidth,
                        margin
                    );
                    lastHeaderPage = page;
                }
            };

            const addPage = () => {
                doc.addPage();
                lastHeaderPage = 0;
                drawHeaderIfNeeded();
            };

            const ensureSpace = (height = 12) => {
                if (y + height > pageHeight - margin.bottom) {
                    addPage();
                }
            };

            const drawNode = (node, level = 0) => {
                if (!node) return;

                const styles = this.grouping.levelStyles || [];
                const style = styles[Math.min(level, styles.length - 1)] || {};
                const indent = Math.min(level * 4, 24);
                const headingHeight = Math.max(7, (style.fontSize || 10) * 0.62 + 3);

                ensureSpace(headingHeight + 3);

                doc.setFillColor(242, 243, 244);
                doc.rect(
                    margin.left + indent,
                    y - 4.2,
                    pageWidth - margin.left - margin.right - indent,
                    headingHeight,
                    'F'
                );

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(style.fontSize || 10);
                const color = style.color || [35, 35, 35];
                doc.setTextColor(color[0], color[1], color[2]);
                doc.text(
                    String(node.title || ''),
                    margin.left + indent + 2,
                    y
                );

                y += headingHeight + 1;

                (node.blocks || []).forEach(block => {
                    if (block.subtitle) {
                        ensureSpace(8);
                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(8);
                        doc.setTextColor(75, 75, 75);
                        doc.text(block.subtitle, margin.left + indent + 2, y);
                        y += 4;
                    }

                    const rows = Array.isArray(block.rows) ? block.rows : [];
                    if (!rows.length) return;

                    doc.autoTable({
                        startY: y,
                        margin: {
                            top: margin.top,
                            right: margin.right,
                            bottom: margin.bottom,
                            left: margin.left + indent
                        },
                        head: [this.columns.map(column => column.label)],
                        body: rows.map(row =>
                            this.columns.map(column => this.getCellValue(row, column))
                        ),
                        styles: {
                            font: 'helvetica',
                            fontSize: 8,
                            cellPadding: 2,
                            overflow: 'linebreak',
                            valign: 'middle'
                        },
                        headStyles: {
                            fillColor: [235, 236, 238],
                            textColor: [35, 35, 35],
                            fontStyle: 'bold',
                            lineColor: [205, 205, 205],
                            lineWidth: 0.2
                        },
                        alternateRowStyles: {
                            fillColor: [250, 250, 250]
                        },
                        columnStyles: this.getColumnStyles(),
                        didDrawPage: () => drawHeaderIfNeeded()
                    });

                    y = doc.lastAutoTable.finalY + 4;
                });

                (node.children || []).forEach(child => {
                    drawNode(child, level + 1);
                });
            };

            sections.forEach((section, index) => {
                currentSection = section;

                if (index > 0 && section.newPage !== false) {
                    addPage();
                } else {
                    lastHeaderPage = 0;
                    drawHeaderIfNeeded();
                }

                (section.groups || []).forEach(group => {
                    drawNode(group, 0);
                });

                if (
                    !(section.groups || []).length &&
                    section.emptyMessage
                ) {
                    ensureSpace(10);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9);
                    doc.text(section.emptyMessage, margin.left, y);
                    y += 8;
                }
            });

            doc.save(`${this.filename}.pdf`);
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