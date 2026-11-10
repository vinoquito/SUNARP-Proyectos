/**
 * Diagnóstico temporal de identidad de Google Workspace.
 */
function testCurrentUserEmail() {
  const activeEmail = Session.getActiveUser().getEmail();
  const effectiveEmail = Session.getEffectiveUser().getEmail();

  const result = {
    activeUserEmail: activeEmail || '(vacío)',
    effectiveUserEmail: effectiveEmail || '(vacío)',
    timestamp: new Date().toISOString()
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}