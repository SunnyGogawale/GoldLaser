const crypto = require('crypto');

const getVersionKey = (namespace) => `cache:version:${namespace}`;

const getEntryKey = (namespace, version, keyParts) => {
  const hash = crypto.createHash('sha256').update(JSON.stringify(keyParts)).digest('hex');
  return `cache:${namespace}:v${version}:${hash}`;
};

module.exports = { getVersionKey, getEntryKey };