function groupBy(items, key) {

    return items.reduce((acc, item) => {

        const value = item[key];

        if (!acc[value]) {
            acc[value] = [];
        }

        acc[value].push(item);

        return acc;

    }, {});
}