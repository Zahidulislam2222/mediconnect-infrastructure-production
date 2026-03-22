import { Request, Response, NextFunction } from 'express';
import { getRegionalClient } from '../../../shared/aws-config';
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { safeError } from '../../../shared/logger';

export const requireIdentityVerification = async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !user.id) return res.status(401).json({ error: "Unauthorized" });

    try {
        const db = getRegionalClient(user.region);
        
        if (user.isDoctor) {
            // Check Doctor Verification
            const result = await db.send(new GetCommand({
                TableName: process.env.TABLE_DOCTORS || 'mediconnect-doctors',
                Key: { doctorId: user.id },
                ProjectionExpression: "isIdentityVerified, verificationStatus"
            }));

            if (!result.Item || result.Item.isIdentityVerified !== true || result.Item.verificationStatus !== 'APPROVED') {
                return res.status(403).json({ error: "Compliance Block: You must verify your Medical Credentials before accessing the calendar." });
            }
        } else {
            // Check Patient Verification
            const result = await db.send(new GetCommand({
                TableName: process.env.TABLE_PATIENTS || 'mediconnect-patients',
                Key: { patientId: user.id },
                ProjectionExpression: "isIdentityVerified"
            }));

            if (!result.Item || result.Item.isIdentityVerified !== true) {
                return res.status(403).json({ error: "HIPAA Security Block: You must complete Photo ID Verification before booking appointments." });
            }
        }
        
        next();
    } catch (error) {
        safeError("Verification Middleware Error:", error);
        res.status(500).json({ error: "Security validation failed" });
    }
};