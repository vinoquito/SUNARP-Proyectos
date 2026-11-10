const Loader = {
    template: `
    <div class="loader-content">
      <img :src="basePath + 'imagenes/ui/spinner.svg'" class="loader-spinner" />
      <p>Cargando información...</p>
      <img :src="basePath + 'imagenes/ui/sunarp-logo.svg'" />
    </div>
  `,
    computed: {
        basePath() {
            return window.getBasePath();
        }
    }
};