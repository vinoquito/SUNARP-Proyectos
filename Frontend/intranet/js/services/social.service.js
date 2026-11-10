async function getSocialData() {
    const data = await fetchSheet('layout');

    return data.filter(
        row => row.section === 'nav' && row.type === 'social'
    ).sort((a, b) => (a.order || 0) - (b.order || 0));
}