async function getBreadcrumb(pageName) {
    const pages = await fetchSheet('pages');
    const map = {};
    pages.forEach(page => {
        map[page.name] = page;
    });

    const items = [];
    let current = map[pageName];

    while (current) {
        let url;
        // Si el template de esta página es 'content-page', usamos hash con content.html
        if (current.template === 'content-page') {
            url = `content.html#${current.name}`;
        } else {
            // Para otros templates (ej. 'home-portal'), mantenemos el comportamiento original
            url = current.name === 'index' ? '/intranet/' : `${current.name}.html`;
        }

        items.unshift({
            text: current.title,
            url
        });

        current = current.parent ? map[current.parent] : null;
    }

    return items;
}