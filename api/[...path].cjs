const { app, connectToDatabase } = require('../server/index')

module.exports = async (req, res) => {
  await connectToDatabase()
  return app(req, res)
}
