import json
import os
import uuid
from datetime import datetime, timezone
import boto3

table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])

HEADERS = {'Content-Type': 'application/json'}

def respond(status, body):
    return {'statusCode': status, 'headers': HEADERS, 'body': json.dumps(body)}

def handler(event, context):
    route = event.get('routeKey', '')

    if route == 'GET /notes':
        items = table.scan().get('Items', [])
        items.sort(key=lambda n: n['createdAt'], reverse=True)
        return respond(200, items)

    if route == 'POST /notes':
        body = json.loads(event.get('body') or '{}')
        text = (body.get('text') or '').strip()
        if not text:
            return respond(400, {'error': 'text is required'})
        note = {
            'id':        str(uuid.uuid4()),
            'text':      text,
            'createdAt': datetime.now(timezone.utc).isoformat(),
        }
        table.put_item(Item=note)
        return respond(201, note)

    if route == 'DELETE /notes/{id}':
        note_id = (event.get('pathParameters') or {}).get('id', '')
        table.delete_item(Key={'id': note_id})
        return respond(200, {'deleted': note_id})

    return respond(404, {'error': 'not found'})
