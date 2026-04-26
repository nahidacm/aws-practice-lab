import json
import os
from datetime import datetime, timezone, timedelta
import boto3
from boto3.dynamodb.conditions import Attr

table              = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
ARCHIVE_AFTER_DAYS = int(os.environ.get('ARCHIVE_AFTER_DAYS', '30'))

def handler(event, context):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=ARCHIVE_AFTER_DAYS)).isoformat()

    # Scan is acceptable: this runs once per day, not on user requests.
    # Attr('archived').not_exists() is required — DynamoDB evaluates a missing
    # attribute as NULL, and NULL <> True is FALSE, so ne(True) alone would skip
    # every note that was created before the archived field existed.
    result = table.scan(
        FilterExpression=Attr('createdAt').lt(cutoff) & (
            Attr('archived').not_exists() | Attr('archived').eq(False)
        )
    )

    items = result.get('Items', [])
    for item in items:
        table.update_item(
            Key={'userId': item['userId'], 'id': item['id']},
            UpdateExpression='SET archived = :a',
            ExpressionAttributeValues={':a': True},
        )

    summary = {'archived': len(items), 'cutoff': cutoff}
    print(json.dumps(summary))
    return summary
