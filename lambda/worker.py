import json
import os
from datetime import datetime, timezone
import boto3

table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])

def process(user_id, note_id, text):
    words   = text.split()
    summary = f"{len(words)} word{'s' if len(words) != 1 else ''}"
    table.update_item(
        Key={'userId': user_id, 'id': note_id},
        UpdateExpression='SET summary = :s, processedStatus = :ps, processedAt = :pa',
        ExpressionAttributeValues={
            ':s':  summary,
            ':ps': 'done',
            ':pa': datetime.now(timezone.utc).isoformat(),
        },
    )

def handler(event, context):
    for record in event['Records']:
        body = json.loads(record['body'])
        process(body['userId'], body['id'], body['text'])
    # Returning normally deletes the batch from the queue.
    # Raising an exception causes SQS to retry, eventually sending to the DLQ.
