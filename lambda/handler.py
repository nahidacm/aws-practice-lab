import json
import os
import uuid
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

table  = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
sqs    = boto3.client('sqs')
s3     = boto3.client('s3')

BUCKET  = os.environ['ATTACHMENT_BUCKET']
HEADERS = {'Content-Type': 'application/json'}

def log(level, **kwargs):
    print(json.dumps({'level': level, **kwargs}))

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
        # Generate a short-lived presigned GET URL for any note that has an attachment.
        for item in items:
            if 'attachmentKey' in item:
                item['attachmentUrl'] = s3.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': BUCKET, 'Key': item['attachmentKey']},
                    ExpiresIn=3600,
                )
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
        sqs.send_message(
            QueueUrl=os.environ['QUEUE_URL'],
            MessageBody=json.dumps({'userId': uid, 'id': note['id'], 'text': text}),
        )
        log('INFO', action='note_created', noteId=note['id'])
        return respond(201, note)

    if route == 'POST /notes/{id}/upload-url':
        note_id      = (event.get('pathParameters') or {}).get('id', '')
        body         = json.loads(event.get('body') or '{}')
        filename     = (body.get('filename') or 'file').strip()
        content_type = body.get('contentType') or 'application/octet-stream'
        key          = f"{uid}/{note_id}/{filename}"

        # Presigned PUT URL — the browser uses this to upload directly to S3.
        # ContentType must match the header the browser sends on the PUT request.
        upload_url = s3.generate_presigned_url(
            'put_object',
            Params={'Bucket': BUCKET, 'Key': key, 'ContentType': content_type},
            ExpiresIn=300,
        )
        # Record the key now. If the upload is abandoned, an S3 lifecycle rule
        # handles orphaned objects (see README).
        table.update_item(
            Key={'userId': uid, 'id': note_id},
            UpdateExpression='SET attachmentKey = :k',
            ExpressionAttributeValues={':k': key},
        )
        log('INFO', action='upload_url_generated', noteId=note_id, filename=filename)
        return respond(200, {'uploadUrl': upload_url, 'key': key})

    if route == 'DELETE /notes/{id}':
        note_id = (event.get('pathParameters') or {}).get('id', '')
        # Best-effort S3 cleanup — don't let a storage error block note deletion.
        try:
            item = table.get_item(Key={'userId': uid, 'id': note_id}).get('Item', {})
            if item.get('attachmentKey'):
                s3.delete_object(Bucket=BUCKET, Key=item['attachmentKey'])
        except Exception as e:
            log('WARN', action='s3_cleanup_failed', noteId=note_id, error=str(e))
        table.delete_item(Key={'userId': uid, 'id': note_id})
        log('INFO', action='note_deleted', noteId=note_id)
        return respond(200, {'deleted': note_id})

    return respond(404, {'error': 'not found'})
