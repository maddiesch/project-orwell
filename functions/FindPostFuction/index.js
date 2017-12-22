const AWS = require("aws-sdk")
const UUID = require("uuid/v4")
const Responder = require("responder")
const Errors = require("errors")

AWS.config.update({ region: process.env.AWS_REGION })

/**
 * The image formats supported
 */
const SUPPORTED_TYPES = ["base64-jpeg"]

/**
 * Shared Rekognition client
 */
const rekognition = new AWS.Rekognition()

/**
 * Shared DynamoDB client
 */
const dynamodb = new AWS.DynamoDB()

/**
 * A global variable to store state. Gets reset using a finally call
 */
let globalState = {}

/******************************************************************************/
/*                             Helper Methods                                 */
/******************************************************************************/
const getBinaryBlob = blob => {
  return new Buffer(blob, "base64")
}

/******************************************************************************/
/*                           Function Methods                                 */
/******************************************************************************/
const parseBody = ({ body }) => {
  return new Promise(resolve => {
    const { image, context } = body
    if (!context) {
      throw Errors.createAPIError(400, "Payload missing attribute `context`", {
        detail: "Must specify a context for searching within"
      })
    }
    if (!image) {
      throw Errors.createAPIError(400, "Payload missing attribute `image`")
    }
    const { type, data } = image
    if (!type) {
      throw Errors.createAPIError(400, "Payload missing attribute `image.type`")
    }
    if (SUPPORTED_TYPES.indexOf(type) < 0) {
      throw Errors.createAPIError(400, "Unsupported image type")
    }
    if (!data) {
      throw Errors.createAPIError(400, "Payload missing attribute `image.data`")
    }
    const collectionId = process.env.COLLECTION_TEMPLATE.replace(
      "{{id}}",
      `${context}`
    )
    // Save the raw image used later when invoking the transaction creation function
    globalState.rawImage = data
    resolve({
      data,
      collectionId,
      context
    })
  })
}

const rekognize = ({ collectionId, data, context }) => {
  return new Promise((resolve, reject) => {
    const params = {
      CollectionId: collectionId,
      FaceMatchThreshold: 90,
      MaxFaces: 5,
      Image: {
        Bytes: getBinaryBlob(data)
      }
    }
    rekognition.searchFacesByImage(params, (error, matches) => {
      if (error) {
        const apiError = Errors.createAPIError(
          502,
          "Rekognition failed to search",
          {
            detail:
              "Rekognition failed to search the face index using the image provided",
            code: "AWS_REKOGNITION_SEARCH",
            meta: {
              underlying: error.message
            }
          }
        )
        reject(apiError)
      } else {
        resolve({
          matches: matches.FaceMatches,
          collectionId,
          data,
          context
        })
      }
    })
  })
}

const findMatches = payload => {
  return new Promise((resolve, reject) => {
    const { matches } = payload
    const tableName = `${process.env.METADATA_TABLE_NAME}`
    const identifiers = matches
      .map(({ Face }) => Face.ExternalImageId)
      .filter((item, index, array) => {
        return array.indexOf(item) === index
      })
    let items = {}
    items[tableName] = {
      Keys: identifiers.map(id => {
        return {
          Identifier: {
            S: id
          }
        }
      })
    }

    const params = {
      RequestItems: items
    }

    dynamodb.batchGetItem(params, (error, response) => {
      if (error) {
        const apiError = Errors.createAPIError(
          502,
          "DynamoDB failed to find metadata",
          {
            detail:
              "Facial matching was successfull, but it failed to query match metadata",
            code: "AWS_DYNAMO_METADATA",
            meta: {
              underlying: error.message
            }
          }
        )
        reject(apiError)
      } else {
        payload.metadata = response.Responses[tableName]
        resolve(payload)
      }
    })
  })
}

const buildResults = payload => {
  return new Promise((resolve, reject) => {
    let collection = []
    let best = null

    payload.metadata.forEach(metadata => {
      payload.matches
        .filter(match => {
          return metadata.Faces.SS.indexOf(match.Face.FaceId) >= 0
        })
        .forEach(match => {
          const params = {
            identifier: metadata.InternalIdentifier.S,
            similarity: match.Similarity,
            confidence: match.Face.Confidence,
            updated_at: new Date(parseInt(metadata.UpdatedAt.N) * 1000),
            created_at: new Date(parseInt(metadata.CreatedAt.N) * 1000),
            faces_count: metadata.Faces.SS.length,
            context: metadata.Context.S
          }
          if (best === null || best.similarity < params.similarity) {
            best = params
          }
          collection.push(params)
        })
    })
    resolve({
      best,
      matches: collection
    })
  })
}

const createTransaction = results => {
  return new Promise((resolve, reject) => {
    const lambda = new AWS.Lambda()

    const { best } = results
    const { rawImage } = globalState
    let final = results

    if (best && rawImage) {
      const transactionID = UUID()
      const params = {
        TopicArn: process.env.TRANSACTION_TOPIC_ARN,
        Subject: "CREATE_TRANSACTION",
        Message: JSON.stringify({
          id: transactionID,
          ctx: best.context,
          idnt: best.identifier,
          payload: rawImage
        })
      }
      const sns = new AWS.SNS()
      sns.publish(params, (error, data) => {
        if (error) {
          console.error(error)
        } else {
          console.log(`Published transaction ${transactionID}`)
        }
      })
      final.transactionID = transactionID
    }
    resolve(final)
  })
}

const begin = event => {
  return new Promise(resolve => {
    globalState = {}
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
    .then(rekognize)
    .then(findMatches)
    .then(buildResults)
    .then(createTransaction)
    .then(results => {
      const response = Responder.createResponse(200, {}, results)
      callback(null, response)
    })
    .catch(error => {
      console.error(error)
      const response = Errors.createErrorResponse(error)
      callback(null, response)
    })
}
