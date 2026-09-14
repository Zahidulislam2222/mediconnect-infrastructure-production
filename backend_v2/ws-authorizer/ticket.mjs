import { createHash } from 'node:crypto';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

export async function consumeConnectionTicket(ticket, client, config, now = Date.now()) {
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new Error('INVALID_CONNECTION_TICKET');
  const key = `ticket#${createHash('sha256').update(ticket).digest('hex')}`;
  const result = await client.send(new DeleteCommand({ TableName: config.table, Key: { connectionId: key },
    ConditionExpression: '#kind = :kind AND expiresAt > :now AND jurisdiction = :region',
    ExpressionAttributeNames: { '#kind': 'kind' },
    ExpressionAttributeValues: { ':kind': 'CONNECTION_TICKET', ':now': Math.floor(now / 1000), ':region': config.jurisdiction },
    ReturnValues: 'ALL_OLD',
  }));
  if (!result.Attributes?.subjectId || !['patient', 'doctor'].includes(result.Attributes.role)) throw new Error('INVALID_CONNECTION_TICKET_RECORD');
  return { sub: result.Attributes.subjectId, role: result.Attributes.role, region: config.region };
}
