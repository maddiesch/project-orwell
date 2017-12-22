const AWS = require("aws-sdk")
const Responder = require("responder")
const Errors = require("errors")

AWS.config.update({ region: process.env.AWS_REGION })

var sqs = new AWS.SQS()

/******************************************************************************/
/*                           Function Methods                                 */
/******************************************************************************/
const sendMessage = message => {
  return new Promise((resolve, reject) => {
    sqs.sendMessage(message, (error, data) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

const buildMessage = payload => {
  return new Promise((resolve, reject) => {
    const message = {
      QueueUrl: process.env.TASK_QUEUE_URL,
      MessageBody: JSON.stringify(payload)
    }
    resolve(message)
  })
}

const parseBody = ({ body }) => {
  return new Promise(resolve => {
    const { image_key, identifier, context } = body
    if (!image_key) {
      throw Errors.createAPIError(400, "Missing `image_key`")
    }
    if (!identifier) {
      throw Errors.createAPIError(400, "Missing `identifier`")
    }
    if (!context) {
      throw Errors.createAPIError(400, "Missing `context`")
    }
    resolve({
      identifier,
      context,
      imageKey: image_key
    })
  })
}

const begin = event => {
  return new Promise(resolve => {
    const { body } = event
    resolve({
      body: JSON.parse(body),
      event: event
    })
  })
}

exports.handler = (event, context, callback) => {
  begin(event)
    .then(parseBody)
    .then(buildMessage)
    .then(sendMessage)
    .then(() => {
      callback(null, { statusCode: 204, headers: {}, body: null })
    })
    .catch(error => {
      console.error(error)
      const response = Errors.createErrorResponse(error)
      callback(null, response)
    })
}
