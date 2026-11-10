const FilterService = {
    apply(items, filters = {}, page = 1, perPage = 9) {
        // Filtrado
        const itemsFiltrados = items.filter(item => {
            for (const key in filters) {
                const value = filters[key];
                if (!value) {
                    continue;
                }

                if (key === 'busqueda') {

                    const text = [

                        item.nombre,
                        item.direccion,
                        item.departamento,
                        item.provincia,
                        item.distrito

                    ]
                        .join(' ')
                        .toLowerCase();

                    if (
                        !text.includes(
                            value.toLowerCase()
                        )
                    ) {
                        return false;
                    }

                    continue;
                }

                if (
                    item[key] !== undefined &&
                    item[key] !== value
                ) {
                    return false;
                }
            }
            return true;
        });

        // Paginación
        const totalPaginas = Math.ceil(itemsFiltrados.length / perPage);
        const inicio = (page - 1) * perPage;
        const itemsPaginados = itemsFiltrados.slice(inicio, inicio + perPage);

        return {
            itemsFiltrados,
            totalPaginas,
            itemsPaginados
        };
    }
};