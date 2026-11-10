const ExportPdfButton = {
  props: {
    data: { type: Array, required: true },
    columns: { type: Array, required: true },
    filename: { type: String, default: 'export' },
    label: { type: String, default: 'PDF' },
    icon: { type: String, default: 'file-pdf' },
    variant: { type: String, default: 'secondary' }
  },
  methods: {
    handleExport() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('landscape');
      doc.autoTable({
        head: [this.columns.map(c => c.label)],
        body: this.data.map(row => this.columns.map(c => row[c.key] ?? ''))
      });
      doc.save(`${this.filename}.pdf`);
    }
  },
  template: `<app-button :label="label" :icon="icon" :variant="variant" @click="handleExport" />`
};