// ===== Extra helpers for the manage-appointment workflow =====
function digitsOnly(v) { // keeps only 0-9, converting Urdu and Arabic numerals first
  return clean(v)
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '');
}
function tail10(v) { return digitsOnly(v).slice(-10); }
function descField(desc, key) { // reads "key: value" lines from an event description
  const m = clean(desc).match(new RegExp('^\\s*' + key + ':\\s*(.+)$', 'mi'));
  return m ? m[1].trim() : '';
}
function toKarachi(ms) { // UTC milliseconds -> { date: 'YYYY-MM-DD', mins: minutes since midnight }
  const k = new Date(ms + TZ_OFFSET_MIN * 60000);
  return {
    date: k.getUTCFullYear() + '-' + pad(k.getUTCMonth() + 1) + '-' + pad(k.getUTCDate()),
    mins: k.getUTCHours() * 60 + k.getUTCMinutes()
  };
}
