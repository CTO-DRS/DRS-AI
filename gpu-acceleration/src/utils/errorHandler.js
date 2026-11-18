class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({ status: err.status, message: err.message, code: err.code, stack: err.stack });
  } else {
    if (err.isOperational) res.status(err.statusCode).json({ status: err.status, message: err.message, code: err.code });
    else res.status(500).json({ status: 'error', message: 'Something went wrong' });
  }
};
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { AppError, errorHandler, asyncHandler };
