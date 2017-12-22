/**
 * Build an API response
 *
 * @param {integer} status - The HTTP status code to use for the response
 * @param {Object} headers - Any custom HTTP headers to respond with
 * @param {Object} body - The response body. Will be JSON encoded
 *
 * @return The response object, ready to pass to Lambda's callback handler.
 */
const createResponse = (status, headers, body) => {
  return {
    statusCode: status,
    headers: headers,
    body: JSON.stringify(body)
  }
}

exports.createResponse = createResponse
