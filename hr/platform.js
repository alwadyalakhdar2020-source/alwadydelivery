/* ===== Al-Wady platform — HR integration (loaded after core.js) ===== */
// Reference numbers come from an atomic server counter (no two requests can get the same number).
nextRef = async function (prefix) {
  const { data, error } = await window.__sb.rpc('hr_next_ref', { p_prefix: prefix });
  if (error) throw new Error('تعذر توليد الرقم المرجعي حاليًا، أعد المحاولة');
  return data;
};
