const parseTrustProxySetting = (setting) => {
  if (setting === undefined || setting === '') return undefined;
  if (setting === 'true') return true;
  if (setting === 'false') return false;
  if (/^\d+$/.test(setting)) return Number(setting);
  return setting;
};

module.exports = { parseTrustProxySetting };