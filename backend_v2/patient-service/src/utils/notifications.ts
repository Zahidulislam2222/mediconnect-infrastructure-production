import admin from 'firebase-admin';
import { safeError } from '../../../shared/logger';

// Initialize with a Service Account (Architecture 2: Store this in SSM later!)
if (!admin.apps.length) {
    admin.initializeApp({

        credential: admin.credential.applicationDefault() 
    });
}

export const sendPushNotification = async (token: string, title: string, body: string) => {
    if (!token) return;
    try {
        await admin.messaging().send({
            token,
            notification: { title, body },
            android: { priority: 'high' }
        });
    } catch (error) {
        safeError("Push Error:", error);
    }
};