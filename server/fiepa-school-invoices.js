// Pure validation helpers for Fiepa Pay school invoices.
// Amounts are integer GHS minor units (pesewas), never floating point.
export function validateSchoolInvoice(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {error:'Invoice payload required'};
  const schoolId = typeof input.schoolId === 'string' ? input.schoolId.trim() : '';
  const invoiceReference = typeof input.invoiceReference === 'string' ? input.invoiceReference.trim() : '';
  const studentIdentifier = typeof input.studentIdentifier === 'string' ? input.studentIdentifier.trim() : '';
  const studentName = typeof input.studentName === 'string' ? input.studentName.trim() : '';
  const academicTerm = typeof input.academicTerm === 'string' ? input.academicTerm.trim() : '';
  if (!schoolId || schoolId.length > 128) return {error:'Valid school ID required'};
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,79}$/.test(invoiceReference)) return {error:'Invalid invoice reference'};
  if (!studentIdentifier || studentIdentifier.length > 100) return {error:'Valid student identifier required'};
  if (!studentName || studentName.length > 160) return {error:'Valid student name required'};
  if (academicTerm.length > 100) return {error:'Academic term too long'};
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return {error:'Amount must be a positive integer in pesewas'};
  if (input.currency !== 'GHS') return {error:'Only GHS invoices are supported'};
  let dueAt = null;
  if (input.dueAt != null && input.dueAt !== '') {
    if (typeof input.dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.dueAt) || !Number.isFinite(Date.parse(input.dueAt))) return {error:'Invalid due date'};
    dueAt = new Date(input.dueAt).toISOString();
  }
  return {value:{schoolId,invoiceReference,studentIdentifier,studentName,academicTerm:academicTerm||null,amountMinor:input.amountMinor,currency:'GHS',dueAt}};
}
