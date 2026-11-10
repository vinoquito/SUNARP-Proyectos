async function getPage(name) {

    const pages = await fetchSheet('pages');

    return pages.find(p =>
        p.name?.trim() === name
    );
}