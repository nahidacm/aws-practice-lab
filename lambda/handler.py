import json
import os
import uuid
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
sqs   = boto3.client('sqs')

HEADERS = {'Content-Type': 'application/json'}

def respond(status, body):
    return {'statusCode': status, 'headers': HEADERS, 'body': json.dumps(body)}

def get_user_id(event):
    return event['requestContext']['authorizer']['jwt']['claims']['sub']

def handler(event, context):
    route = event.get('routeKey', '')
    uid   = get_user_id(event)

    if route == 'GET /notes':
        result = table.query(KeyConditionExpression=Key('userId').eq(uid))
        items  = sorted(result.get('Items', []), key=lambda n: n['createdAt'], reverse=True)
        return respond(200, items)

    if route == 'POST /notes':
        body = json.loads(event.get('body') or '{}')
        text = (body.get('text') or '').strip()
        if not text:
            return respond(400, {'error': 'text is required'})
        note = {
            'userId':          uid,
            'id':              str(uuid.uuid4()),
            'text':            text,
            'createdAt':       datetime.now(timezone.utc).isoformat(),
            'processedStatus': 'pending',
        }
        table.put_item(Item=note)
        # Enqueue for async processing — worker fills in summary, processedStatus, processedAt
        sqs.send_message(
            QueueUrl=os.environ['QUEUE_URL'],
            MessageBody=json.dumps({'userId': uid, 'id': note['id'], 'text': text}),
        )
        return respond(201, note)

    if route == 'DELETE /notes/{id}':
        note_id = (event.get('pathParameters') or {}).get('id', '')
        table.delete_item(Key={'userId': uid, 'id': note_id})
        return respond(200, {'deleted': note_id})

    return respond(404, {'error': 'not found'})
