const CardList = {
  props: [
    'variant',
    'title',
    'items',
    'layout',
    'columns',
    'showMore',
    'moreUrl'
  ],

  template: `
    <component
      :is="getComponent()"
      :title="title"
      :items="items"
      :layout="layout"
      :columns="columns"
      :show-more="showMore"
      :more-url="moreUrl"
    />
  `,

  methods: {
    getComponent() {

      const v = this.variant || 'vertical-desc';

      switch (v) {

        case 'vertical-simple':
          return 'card-vertical-simple';

        case 'vertical-desc':
          return 'card-vertical-desc';

        case 'grid':
          return 'card-grid';

        case 'grid-compact':
          return 'card-grid-compact';

        case 'info':
          return 'info-card';

        default:
          return 'card-vertical-desc';
      }
    }
  }
};

// const CardList = {
//   props: ['variant', 'title', 'items', 'layout', 'columns', 'showMore', 'moreUrl'],
//   template: `
//     <component
//       :is="getComponent()"
//       :title="title"
//       :items="items"
//       :layout="layout"
//       :columns="columns"
//       :show-more="showMore"
//       :more-url="moreUrl"
//     />
//   `,

//   methods: {
//     getComponent() {
//       const v = this.variant || 'vertical-desc'; // 🔥 fallback

//       switch (v) {
//         case 'vertical-simple': return 'card-vertical-simple';
//         case 'vertical-desc': return 'card-vertical-desc';
//         case 'grid': return 'card-grid';
//         case 'grid-compact': return 'card-grid-compact';
//         default: return 'card-vertical-desc';
//       }
//     }
//   }
// };