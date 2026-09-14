import { randomBytes, createHash } from 'crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { Request, Response } from 'express';
import { getRegionalClient } from './aws-config';
import { TABLE_NAMES, getSocketTicketSettings } from './settings';
import { resolveAuthRegion } from './region-context';

export async function issueSocketTicket(req: Request, res: Response) {
  const user = (req as any).user;
  if (!user?.id) return res.status(401).json({ error: 'Authentication required' });
  try {
    const region = resolveAuthRegion(user.region);
    const settings = getSocketTicketSettings();
    // 256 bits of entropy; only the SHA-256 lookup key is persisted.
    const ticket = randomBytes(32).toString('base64url');
    const key = `ticket#${createHash('sha256').update(ticket).digest('hex')}`;
    const expiresAt = Math.floor(Date.now() / 1000) + settings.lifetimeSeconds;
    await getRegionalClient(region).send(new PutCommand({ TableName: TABLE_NAMES.chatConnections,
      Item: { connectionId: key, subjectId: user.id, role: user.isDoctor ? 'doctor' : 'patient', jurisdiction: region, expiresAt, ticketExpiresAt: expiresAt, kind: 'CONNECTION_TICKET' },
      ConditionExpression: 'attribute_not_exists(connectionId)',
    }));
    return res.set('Cache-Control', 'no-store').json({ ticket, region, expiresAt });
  } catch {
    return res.status(503).json({ error: 'Connection authorization is temporarily unavailable' });
  }
}
