const Loader = {
    template: `
    <div class="loader-content">
      <img :src="basePath + 'assets/imagenes/ui/spinner.svg'" class="loader-spinner" />
      <p>Cargando información...</p>
      <img :src="basePath + 'assets/imagenes/ui/logo-sunarp.svg'" />
    </div>
  `,
    computed: {
        basePath() {
            return window.getBasePath();
        }
    }
};