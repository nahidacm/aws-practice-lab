import json
import os
from datetime import datetime, timezone
import boto3

table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])

def log(level, **kwargs):
    print(json.dumps({'level': level, **kwargs}))

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
    return summary

def handler(event, context):
    for record in event['Records']:
        body    = json.loads(record['body'])
        note_id = body.get('id', 'unknown')
        try:
            summary = process(body['userId'], note_id, body['text'])
            log('INFO', action='note_processed', noteId=note_id, summary=summary)
        except Exception as e:
            log('ERROR', action='processing_failed', noteId=note_id, error=str(e))
            raise  # let SQS retry → DLQ after maxReceiveCount
    # Returning normally deletes the batch from the queue.
