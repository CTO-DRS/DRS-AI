function errorHandler(err, req, res, next) {
  const status = Number(err.statusCode) || 500;
  res.status(status).json({ status: 'error', message: status === 500 ? 'Internal server error' : err.message });
}
module.exports = { errorHandler };
