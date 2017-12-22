const AWS = require("aws-sdk")

AWS.config.update({ region: process.env.AWS_REGION })

const sqs = new AWS.SQS()
const lambda = new AWS.Lambda()

const fetchMessages = () => {
  return new Promise((resolve, reject) => {
    console.log("Fetching Messages")
    const params = {
      QueueUrl: process.env.TASK_QUEUE_URL,
      MaxNumberOfMessages: 10
    }
    sqs.receiveMessage(params, (error, data) => {
      if (error) {
        reject(error)
      } else {
        processMessages(data.Messages || []).then(resolve, reject)
      }
    })
  })
}

const invoke = message => {
  return new Promise((resolve, reject) => {
    const params = {
      FunctionName: process.env.FANOUT_LAMBDA_NAME,
      InvocationType: "Event",
      Payload: JSON.stringify(message)
    }
    lambda.invoke(params, (error, data) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

const processMessages = messages => {
  return new Promise((resolve, reject) => {
    let invocations = []
    messages.forEach(message => {
      invocations.push(invoke(message))
    })
    console.log(`Invoking ${invocations.length}`)
    Promise.all(invocations).then(() => {
      resolve(messages.length)
    }, reject)
  })
}

const perform = (context, callback) => {
  fetchMessages()
    .then(count => {
      if (count < 10 || context.getRemainingTimeInMillis() < 5000) {
        callback(null, "OK")
      } else {
        perform(context, callback)
      }
    })
    .catch(error => {
      callback(error, null)
    })
}

exports.handler = (event, context, callback) => {
  perform(context, callback)
}
