import { Request, Response, NextFunction } from 'express';
import { getRegionalClient } from '../../../shared/aws-config';
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const requireDoctorVerification = async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !user.sub) return res.status(401).json({ error: "Unauthorized" });

    try {
        const db = getRegionalClient(user.region);
        const result = await db.send(new GetCommand({
            TableName: process.env.DYNAMO_TABLE || 'mediconnect-doctors',
            Key: { doctorId: user.sub },
            ProjectionExpression: "isIdentityVerified, verificationStatus"
        }));

        if (!result.Item) {
            return res.status(403).json({ error: "Security Alert: Account not found." });
        }
        
        // 🟢 COMPLIANCE BLOCK: Check both Identity AND Medical Diploma Status
        const status = result.Item.verificationStatus;
        if (result.Item.isIdentityVerified !== true || status === 'UNVERIFIED' || status === 'REJECTED_AUTO') {
            return res.status(403).json({ 
                error: "Compliance Block: You must verify your Photo ID and Medical Credentials before practicing." 
            });
        }
        
        next();
    } catch (error) {
        console.error("Verification Middleware Error:", error);
        res.status(500).json({ error: "Security validation failed" });
    }
};