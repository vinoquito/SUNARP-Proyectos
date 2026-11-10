function parseCSV(text) {

    const rows = [];

    let row = [];

    let current = '';

    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {

        const char = text[i];

        const next = text[i + 1];

        // =========================
        // COMILLAS ESCAPADAS ("")
        // =========================
        if (
            char === '"' &&
            insideQuotes &&
            next === '"'
        ) {

            current += '"';

            i++;

            continue;
        }

        // =========================
        // ABRIR / CERRAR COMILLAS
        // =========================
        if (char === '"') {

            insideQuotes =
                !insideQuotes;

            continue;
        }

        // =========================
        // SEPARADOR DE COLUMNA
        // =========================
        if (
            char === ',' &&
            !insideQuotes
        ) {

            row.push(current);

            current = '';

            continue;
        }

        // =========================
        // FIN DE FILA
        // =========================
        if (
            (char === '\n' || char === '\r') &&
            !insideQuotes
        ) {

            if (
                char === '\r' &&
                next === '\n'
            ) {

                i++;
            }

            row.push(current);

            rows.push(row);

            row = [];

            current = '';

            continue;
        }

        current += char;
    }

    // =========================
    // ÚLTIMA CELDA
    // =========================
    row.push(current);

    rows.push(row);

    // =========================
    // LIMPIAR FILAS VACÍAS
    // =========================
    const cleanRows = rows.filter(row =>

        row.some(col =>
            String(col).trim()
        )
    );

    if (!cleanRows.length) {

        return [];
    }

    const headers =
        cleanRows[0].map(h =>
            String(h).trim()
        );

    return cleanRows

        .slice(1)

        .map(cols => {

            const obj = {};

            headers.forEach((header, i) => {

                obj[header] =
                    cols[i]?.trim() || '';
            });

            if (obj.order) {

                obj.order =
                    Number(obj.order) || 0;
            }

            return obj;
        });
}

window.getBasePath = function () {
    const path = location.pathname;
    const baseFolder = '/intranet/';

    if (path.startsWith(baseFolder)) {
        return baseFolder;
    }

    return '/';
};