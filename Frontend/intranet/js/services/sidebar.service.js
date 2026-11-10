async function getSidebarData() {

    const data = await fetchSheet('layout');

    return {

        primary: data
            .filter(i =>
                i.section === 'sidebar' &&
                i.group === 'primary'
            )
            .sort((a, b) => a.order - b.order),

        secondary: data
            .filter(i =>
                i.section === 'sidebar' &&
                i.group === 'secondary'
            )
            .sort((a, b) => a.order - b.order)
    };
}