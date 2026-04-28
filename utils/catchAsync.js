/**
 * Wraps async route handlers to automatically catch errors
 * and forward them to the global error handler via next()
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = catchAsync;
