function getPageContent(rows) {

    // ===========================
    // AGRUPAR POR BLOCK
    // ===========================
    const blocks = groupBy(rows, row => row.block?.trim() || '');

    return Object.values(blocks)

        .map(buildBlock)

        .sort((a, b) => a.order - b.order);

}

// ========================================
// CONSTRUYE UN BLOQUE
// ========================================
function buildBlock(rows) {

    rows.sort((a, b) => Number(a.order) - Number(b.order));

    const first = rows[0];

    return {

        block: first.block?.trim(),

        type: first.type?.trim(),

        mode: first.mode?.trim(),

        order: Number(first.order || 0),

        data: buildData(rows)

    };

}

// ========================================
// CONSTRUYE DATA
// ========================================
function buildData(rows) {

    const first = rows[0];

    switch (first.mode?.trim()) {

        case 'collection':

            return buildCollection(rows);

        case 'html':

            return first.description || '';

        default:

            return rows;

    }

}

function buildCollection(rows) {
    const type = rows[0]?.type?.trim();

    const isListingBlock =
        type === 'listing-block-table' ||
        type === 'listing-block-card';
    
    const isTable = type === 'table';
    
    const hasGroups = rows.some(r => r.group?.trim());

    // listing-block siempre recibe filas planas
    if (isListingBlock) {
        return rows;
    }

    if (!hasGroups) {
        return isTable ? rows : rows.map(mapItem);
    }

    const groups = groupBy(rows, row => row.group?.trim());

    return Object.entries(groups).map(([title, items]) => ({
        title,
        items: isTable ? items : items.map(mapItem)
    }));
}


// ========================================
// ITEM
// ========================================
function mapItem(row) {

    return {

        text: row.text,

        description: row.description,

        icon: row.icon,

        imageName: row.image_name,

        imageId: row.image_id,

        image: buildImageUrl(row.image_id),

        url: row.url_destination,

        target: row.target,

        state: row.state,

        raw: row

    };

}

// ========================================
// GROUP BY
// ========================================
function groupBy(items, callback) {

    return items.reduce((acc, item) => {

        const key = callback(item);

        if (!acc[key]) {

            acc[key] = [];

        }

        acc[key].push(item);

        return acc;

    }, {});

}