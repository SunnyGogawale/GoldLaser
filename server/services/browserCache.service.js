const disableBrowserCaching = (res) => {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Cookie');
  res.vary('Authorization');
};

module.exports = { disableBrowserCaching };