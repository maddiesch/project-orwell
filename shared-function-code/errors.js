const responder = require("responder")

/**
 * Creates a new API Error object
 *
 * @param {integer} status - The HTTP Status code to repond with
 * @param {string} message - The error message
 * @param {Object} opts - Object to merge into the error
 */
const createAPIError = (status, message, opts) => {
  let error = new Error(message)
  error.type = "APIError"
  error.status = status
  return Object.assign(error, opts)
}

/**
 * Creates a new response object from an error
 *
 * @param {Error} error - The error object to convert into a response
 */
const createErrorResponse = error => {
  const status = error.status ? error.status : 500
  const headers = error.headers ? error.headers : {}
  const body = {
    error: createErrorObject(status, error)
  }
  return responder.createResponse(status, headers, body)
}

/**
 * @private
 *
 * Creates a error resource object
 */
const createErrorObject = (status, error) => {
  return {
    status: `${status}`,
    message: error.message,
    detail: error.detail,
    id: error.id,
    code: error.code,
    meta: error.meta
  }
}

exports.createAPIError = createAPIError
exports.createErrorResponse = createErrorResponse
