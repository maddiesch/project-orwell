const AWS = require("aws-sdk")

AWS.config.update({ region: process.env.AWS_REGION })

const dynamodb = new AWS.DynamoDB()
const s3 = new AWS.S3()

const parseRecord = record => {
  return new Promise((resolve, reject) => {
    const { Sns } = record
    const { Subject, Message } = Sns
    if (Subject !== "CREATE_TRANSACTION") {
      reject(new Error(`Invalid subject ${Subject}`))
    } else {
      resolve(JSON.parse(Message))
    }
  })
}

const createTransactionParams = ({ id, ctx, idnt }) => {
  return new Promise((resolve, reject) => {
    const ttl = Math.floor(new Date() / 1000) + 172800
    const params = {
      Item: {
        TransactionId: {
          S: id
        },
        Identifier: {
          S: idnt
        },
        Context: {
          S: ctx
        },
        TTL: {
          N: `${ttl}`
        }
      },
      ReturnConsumedCapacity: "TOTAL",
      TableName: process.env.TRANSACTIONS_TABLE_NAME
    }
    resolve(params)
  })
}

const insertTransaction = params => {
  return new Promise((resolve, reject) => {
    dynamodb.putItem(params, (error, data) => {
      if (error) {
        reject(error)
      } else {
        console.log(data)
        resolve()
      }
    })
  })
}

const saveToS3 = ({ id, ctx, idnt, payload }) => {
  return new Promise((resolve, reject) => {
    var params = {
      Bucket: process.env.TRANSACTIONS_BUCKET_NAME,
      Key: `transaction-${id}.dat`,
      Body: payload
    }
    s3.putObject(params, (error, data) => {
      if (error) {
        reject(error)
      } else {
        resolve({
          id,
          ctx,
          idnt
        })
      }
    })
  })
}

const handleRecord = record => {
  return new Promise((resolve, reject) => {
    parseRecord(record)
      .then(saveToS3)
      .then(createTransactionParams)
      .then(insertTransaction)
      .then(resolve)
      .catch(reject)
  })
}

exports.handler = (event, context, callback) => {
  let handlers = []
  event.Records.forEach(record => {
    handlers.push(handleRecord(record))
  })
  Promise.all(handlers)
    .then(() => {
      callback(null, "OK")
    })
    .catch(error => {
      callback(error, null)
    })
}
