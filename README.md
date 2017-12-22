## Project Orwell

Facial Recognition Pipeline

## Getting Started

[![Launch stack in us-east-1](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/new?stackName=project-orwell-pipeline&templateURL=https://s3.amazonaws.com/project-orwell/cloud-formation/stack-1.0.0-beta3.yml)

### Endpoints

### `POST /v1/indexing`

Index faces in a file.

_Indexing could take several minutes._

**Body**

```json
{
  "context": "default",
  "identifier": "<user identifier>",
  "image_key": "image-key.jpeg"
}
```

### `POST /v1/find`

Find a face

**Body**

```json
{
  "image": {
    "data": "< base64 encoded jpeg data >",
    "type": "base64-jpeg"
  },
  "context": "default"
}
```

**Response**

```json
{
  "best": {
    "identifier": "<id>",
    "similarity": 99.48797607421875,
    "confidence": 100,
    "updated_at": "2017-12-22T02:10:34.000Z",
    "created_at": "2017-12-22T00:43:58.000Z",
    "faces_count": 2,
    "context": "<context>"
  },
  "matches": [
    {
      "identifier": "<id>",
      "similarity": 99.48797607421875,
      "confidence": 100,
      "updated_at": "2017-12-22T02:10:34.000Z",
      "created_at": "2017-12-22T00:43:58.000Z",
      "faces_count": 2,
      "context": "<context>"
    },
    {
      "identifier": "<id>",
      "similarity": 95.61024475097656,
      "confidence": 99.98919677734375,
      "updated_at": "2017-12-22T02:10:34.000Z",
      "created_at": "2017-12-22T00:43:58.000Z",
      "faces_count": 2,
      "context": "<context>"
    }
  ],
  "transactionID": "0ad78376-c3ed-49d2-b3c2-00968bc6b170"
}
```
