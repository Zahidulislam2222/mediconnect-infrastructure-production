import { Request, Response, NextFunction } from 'express';
import { getRegionalClient } from '../../../shared/aws-config';
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const requireIdentityVerification = async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !user.id) return res.status(401).json({ error: "Unauthorized" });

    try {
        const db = getRegionalClient(user.region);
        const result = await db.send(new GetCommand({
            TableName: process.env.DYNAMO_TABLE || 'mediconnect-patients',
            Key: { patientId: user.id },
            ProjectionExpression: "isIdentityVerified"
        }));

        // 🟢 HIPAA BLOCK: If they do not exist or are not verified, kick them out.
        if (!result.Item || result.Item.isIdentityVerified !== true) {
            return res.status(403).json({ 
                error: "HIPAA Security Block: You must complete Photo ID Verification to access medical features." 
            });
        }
        
        next();
    } catch (error) {
        console.error("Verification Middleware Error:", error);
        res.status(500).json({ error: "Security validation failed" });
    }
};