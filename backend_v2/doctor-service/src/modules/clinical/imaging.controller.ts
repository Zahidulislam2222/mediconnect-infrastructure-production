// doctor-service/src/modules/clinical/imaging.controller.ts
import { Request, Response } from 'express';
import FormData from 'form-data';
import { getRegionalClient } from '../../../../shared/aws-config';
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

// 1. UPLOAD SCAN
export const uploadDicom = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const file = (req as any).file; 
    
    if (!file) return res.status(400).json({ error: "No DICOM file provided" });

    const dicomServiceUrl = process.env.DICOM_SERVICE_URL || 'http://dicom-service:80/api/v1/upload';

    try {
        const formData = new FormData();
        formData.append('dicom', file.buffer, file.originalname);

        const response = await fetch(dicomServiceUrl, {
            method: 'POST',
            headers: {
                'x-user-id': user.sub,
                'x-user-region': user.region,
                'x-user-role': user.isDoctor ? 'doctor' : 'patient',
            },
            body: formData as any
        });

        if (!response.ok) throw new Error("DICOM Engine Error");
        const data = await response.json() as any;

        const db = getRegionalClient(user.region);
        await db.send(new PutCommand({
            TableName: process.env.TABLE_EHR || "mediconnect-health-records",
            Item: {
                patientId: user.sub,
                recordId: uuidv4(),
                type: 'IMAGING_STUDY',
                resource: data.fhirResource,
                createdAt: new Date().toISOString()
            }
        }));

        res.status(200).json({ message: "Scan processed successfully", resource: data.fhirResource });
    } catch (err: any) {
        res.status(500).json({ error: "Failed to process DICOM", details: err.message });
    }
};

// 2. VIEW SCANS
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