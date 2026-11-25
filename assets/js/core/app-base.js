function createBaseApp(config = {}) {
  return Vue.createApp({
    data() {
      return {
        loading: true,
        basePath: getBasePath(),
        ...(config.data ? config.data() : {})
      };
    },
    methods: {
      ...(config.methods || {})
    },
    computed: {
      ...(config.computed || {})
    },
    mounted: config.mounted || null
  });
}