const logger = require('../utils/logger');

const handleCastError = (err) => ({
  statusCode: 400,
  message: `Invalid ${err.path}: ${err.value}`,
});

const handleDuplicateKey = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return {
    statusCode: 409,
    message: `${field} already exists. Please use a different value.`,
  };
};

const handleValidationError = (err) => ({
  statusCode: 400,
  message: 'Validation failed',
  errors: Object.values(err.errors).map((e) => ({
    field: e.path,
    message: e.message,
  })),
});

const handleJWTError = () => ({
  statusCode: 401,
  message: 'Invalid token. Please log in again.',
});

const handleJWTExpired = () => ({
  statusCode: 401,
  message: 'Token expired. Please log in again.',
});

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    errors: err.errors || undefined,
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      errors: err.errors || undefined,
    });
  } else {
    logger.error('UNEXPECTED ERROR:', err);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong. Please try again later.',
    });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    logger.error(err);
    return sendErrorDev(err, res);
  }

  let error = { ...err, message: err.message };

  if (err.name === 'CastError') Object.assign(error, handleCastError(err));
  if (err.code === 11000) Object.assign(error, handleDuplicateKey(err));
  if (err.name === 'ValidationError') Object.assign(error, handleValidationError(err));
  if (err.name === 'JsonWebTokenError') Object.assign(error, handleJWTError());
  if (err.name === 'TokenExpiredError') Object.assign(error, handleJWTExpired());

  error.isOperational = error.isOperational ?? false;
  sendErrorProd(error, res);
};
