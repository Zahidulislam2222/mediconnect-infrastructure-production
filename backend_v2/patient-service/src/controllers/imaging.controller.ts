import { Request, Response } from 'express';
import FormData from 'form-data';
import fetch from 'node-fetch'; // Or native fetch in Node 20
import { getRegionalClient } from '../../../shared/aws-config';
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

// Multer should be attached in the router
export const uploadDicom = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const file = (req as any).file; // From multer
    
    if (!file) return res.status(400).json({ error: "No DICOM file provided" });

    const dicomServiceUrl = process.env.DICOM_SERVICE_URL || 'http://dicom-service:80/api/v1/upload';

    try {
        const formData = new FormData();
        formData.append('file', file.buffer, file.originalname);

        const response = await fetch(dicomServiceUrl, {
            method: 'POST',
            headers: {
                'x-user-id': user.sub,
                'x-user-region': user.region,
                'x-user-role': user.isDoctor ? 'doctor' : 'patient',
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) throw new Error("DICOM Engine Error");
        const data = await response.json();

        // Save FHIR resource into your EHR DynamoDB table
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