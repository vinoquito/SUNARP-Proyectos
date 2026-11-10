const ExportExcelButton = {
  props: {
    data: { type: Array, required: true },
    columns: { type: Array, required: true }, // [{key, label}]
    filename: { type: String, default: 'export' },
    label: { type: String, default: 'Excel' },
    icon: { type: String, default: 'file-excel' },
    variant: { type: String, default: 'secondary' }
  },
  methods: {
    handleExport() {
      const wsData = [
        this.columns.map(c => c.label),
        ...this.data.map(row => this.columns.map(c => row[c.key] ?? ''))
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Datos');
      XLSX.writeFile(wb, `${this.filename}.xlsx`);
    }
  },
  template: `<app-button :label="label" :icon="icon" :variant="variant" @click="handleExport" />`
};