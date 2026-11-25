async function getPage(name) {

    const pages =
        await fetchSheet('pages');

    const page = pages.find(p =>
        p.name?.trim() === name
    );

    if (!page) return null;

    return {

        ...page,

        image:
            buildImageUrl(
                page.image_id
            ),

        alt:
            page.image_name
    };
}