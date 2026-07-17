/**
 * Wraps async route handlers to automatically pass errors to next().
 */
export const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Standard success response helper.
 */
export const sendSuccess = (res, data, statusCode = 200, message = "Success") =>
  res.status(statusCode).json({ success: true, message, data });

/**
 * Standard error creator.
 */
export const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};
