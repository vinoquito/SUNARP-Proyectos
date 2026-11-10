/**
 * Devuelve los estilos compartidos de SUNARP UI.
 * @return {string}
 */
function getStyles() {

  const icons = `
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=block">
  `;

  const sweetAlertStyles = `
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/sweetalert2@11.26.25/dist/sweetalert2.min.css">
  `;

  const styles = HtmlService
    .createHtmlOutputFromFile('UIStyles')
    .getContent();

  return [
    icons,
    sweetAlertStyles,
    styles
  ].join('\n');

}

/**
 * Inserta las vistas de la aplicación en la plantilla común.
 * @param {string} applicationViewsHtml
 * @return {string}
 */
function renderLayout(applicationViewsHtml) {
  const layout = HtmlService
    .createHtmlOutputFromFile('UILayout')
    .getContent();

  const marker = '__SUNARP_UI_APP_VIEWS__';

  if (!layout.includes(marker)) {
    throw new Error(
      'No se encontró el punto de inserción de las vistas en UILayout.html.'
    );
  }

  return layout.replace(
    marker,
    String(applicationViewsHtml || '')
  );
}

/**
 * Devuelve el JavaScript compartido de SUNARP UI.
 * @return {string}
 */
function getClientScripts() {

  const sweetAlertLibrary =
    '<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11.26.25/dist/sweetalert2.all.min.js"></script>';

  const chartLibrary =
    '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.6.1/dist/chart.umd.min.js"></script>';

  const chartScripts = HtmlService
    .createHtmlOutputFromFile('UIChartScripts')
    .getContent();

  const dataTableScripts = HtmlService
    .createHtmlOutputFromFile('UIDataTableScripts')
    .getContent();

  const sharedScripts = HtmlService
    .createHtmlOutputFromFile('UIScripts')
    .getContent();

  return [
    sweetAlertLibrary,
    chartLibrary,
    chartScripts,
    dataTableScripts,
    sharedScripts
  ].join('\n');

}