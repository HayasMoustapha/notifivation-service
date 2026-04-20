function normalizePhoneNumber(rawPhone) {
  const trimmed = rawPhone == null ? '' : String(rawPhone).trim();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(compact)) {
    return trimmed;
  }

  const digitsOnly = compact.replace(/^\+/, '');

  if (digitsOnly.length === 9 && digitsOnly.startsWith('6')) {
    return `+237${digitsOnly}`;
  }

  if (digitsOnly.startsWith('237') && digitsOnly.length === 12) {
    return `+${digitsOnly}`;
  }

  return compact.startsWith('+') ? compact : compact;
}

module.exports = {
  normalizePhoneNumber,
};
