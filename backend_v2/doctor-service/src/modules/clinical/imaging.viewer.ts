import { Request, Response } from 'express';
import { getRegionalClient } from '../../../../shared/aws-config';
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const getPatientScans = async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const user = (req as any).user;
    
    const db = getRegionalClient(user.region);
    
    const cmd = new QueryCommand({
        TableName: "mediconnect-health-records",
        KeyConditionExpression: "patientId = :pid",
        FilterExpression: "#type = :type",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":pid": patientId, ":type": "IMAGING_STUDY" }
    });

    try {
        const result = await db.send(cmd);

        res.status(200).json(result.Items);
    } catch (err: any) {
        res.status(500).json({ error: "Failed to fetch scans" });
    }
};