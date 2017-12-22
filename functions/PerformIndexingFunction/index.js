const AWS = require("aws-sdk")

AWS.config.update({ region: process.env.AWS_REGION })

const sqs = new AWS.SQS()
const rekognition = new AWS.Rekognition()
const dynamodb = new AWS.DynamoDB()
const s3 = new AWS.S3()

/******************************************************************************/
/******************************************************************************/

// Metadata saving
const insertMetadata = data => {
  return new Promise((resolve, reject) => {
    const params = {
      Item: {
        Identifier: {
          S: `${data.context}-${data.identifier}`
        },
        CreatedAt: {
          N: `${Math.floor(new Date() / 1000)}`
        }
      },
      ConditionExpression: "attribute_not_exists(CreatedAt)",
      ReturnValues: "NONE",
      TableName: process.env.METADATA_TABLE_NAME
    }
    dynamodb.putItem(params, (error, response) => {
      if (error && error.code !== "ConditionalCheckFailedException") {
        reject(error)
      } else {
        resolve(data)
      }
    })
  })
}

const updateMetadata = data => {
  return new Promise((resolve, reject) => {
    const entries = data.records.map(record => record.Face.FaceId)
    const params = {
      Key: {
        Identifier: {
          S: `${data.context}-${data.identifier}`
        }
      },
      UpdateExpression:
        "ADD Faces :entries SET UpdatedAt = :time, Context = :ctx, InternalIdentifier = :iid",
      ExpressionAttributeValues: {
        ":entries": {
          SS: entries
        },
        ":time": {
          N: `${Math.floor(new Date() / 1000)}`
        },
        ":ctx": {
          S: data.context
        },
        ":iid": {
          S: data.identifier
        }
      },
      ReturnValues: "NONE",
      ReturnConsumedCapacity: "TOTAL",
      TableName: process.env.METADATA_TABLE_NAME
    }
    dynamodb.updateItem(params, (error, response) => {
      if (error) {
        reject(error)
      } else {
        resolve(data)
      }
    })
  })
}

/******************************************************************************/
/******************************************************************************/
const parseMessage = ({ Body, MessageId }) => {
  return new Promise((resolve, reject) => {
    const { identifier, imageKey, context } = JSON.parse(Body)

    if (!identifier) {
      reject(new Error(`Missing identifier for message ${MessageId}`))
    } else if (!imageKey) {
      reject(new Error(`Missing imageKey for message ${MessageId}`))
    } else if (!context) {
      reject(new Error(`Missing personId for message ${MessageId}`))
    } else {
      const collectionId = process.env.COLLECTION_TEMPLATE.replace(
        "{{id}}",
        `${context}`
      )
      resolve({ collectionId, imageKey, context, identifier })
    }
  })
}

const createCollection = data => {
  return new Promise((resolve, reject) => {
    const params = { CollectionId: data.collectionId }
    rekognition.createCollection(params, (error, response) => {
      if (error && error.code !== "ResourceAlreadyExistsException") {
        reject(error)
      } else {
        resolve(data)
      }
    })
  })
}

const performRekognizeIndexing = data => {
  return new Promise((resolve, reject) => {
    const params = {
      CollectionId: data.collectionId,
      DetectionAttributes: [],
      ExternalImageId: `${data.context}-${data.identifier}`,
      Image: {
        S3Object: {
          Bucket: process.env.BUCKET_NAME,
          Name: data.imageKey
        }
      }
    }
    rekognition.indexFaces(params, (error, response) => {
      if (error) {
        reject(error)
      } else {
        data.records = response.FaceRecords
        resolve(data)
      }
    })
  })
}

const saveMetadata = data => {
  return insertMetadata(data).then(updateMetadata)
}

const deleteFromS3 = data => {
  return new Promise((resolve, reject) => {
    const { imageKey } = data
    s3.deleteObject(
      {
        Bucket: process.env.BUCKET_NAME,
        Key: imageKey
      },
      (error, response) => {
        console.error(error)
        resolve(data)
      }
    )
  })
}

const perform = event => {
  return new Promise((resolve, reject) => {
    parseMessage(event)
      .then(createCollection)
      .then(performRekognizeIndexing)
      .then(saveMetadata)
      .then(deleteFromS3)
      .then(() => {
        resolve(event)
      })
      .catch(reject)
  })
}

const deleteMessage = event => {
  return new Promise((resolve, reject) => {
    const params = {
      ReceiptHandle: event.ReceiptHandle,
      QueueUrl: process.env.TASK_QUEUE_URL
    }
    sqs.deleteMessage(params, (error, response) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

exports.handler = (event, context, callback) => {
  perform(event)
    .then(deleteMessage)
    .then(() => {
      callback(null, "OK")
    })
    .catch(error => {
      console.error(error)
      callback(error, null)
    })
}
