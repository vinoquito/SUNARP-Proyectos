async function getBrandData() {
    const data = await fetchSheet('layout');

    return data.find(row =>
        row.section?.trim() === 'nav' &&
        row.type?.trim() === 'brand'
    ) || {};
}