async function getFooterData(pageName) {

    const data =
        await fetchSheet('layout');

    const items = data

        .filter(i =>

            (
                String(i.page || '').trim() === 'global' ||
                String(i.page || '').trim() === pageName
            ) &&
            i.section === 'footer' &&
            i.state === 'Activo'
        )

        .sort((a, b) =>
            Number(a.order) - Number(b.order)
        )

        .map(i => ({

            ...i,

            image: buildAssetImageUrl(
                i.image_name
            )
        }));

    return {

        template:
            items[0]?.template ||
            'footer-default',

        items
    };
}



// async function getFooterData(pageName) {

//     const data =
//         await fetchSheet('layout');

//     const items = data

//         .filter(i =>

//             i.page === pageName &&
//             i.section === 'footer' &&
//             i.state === 'Activo'
//         )

//         .sort((a, b) =>
//             a.order - b.order
//         )

//         .map(i => ({

//             ...i,

//             image: buildAssetImageUrl(
//                 i.image_name
//             )
//         }));

//     return {

//         template:
//             items[0]?.template ||
//             'footer-default',

//         items
//     };
// }