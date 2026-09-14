import { CorsOptions } from 'cors';
import { getApiBrowserSettings } from './settings';

/** CORS is a browser policy; protected routes must still authenticate every request. */
export function getApiBrowserPolicy() {
    const settings = getApiBrowserSettings();
    const cors: CorsOptions = {
        origin: (origin, callback) => {
            if (origin === undefined || settings.origins.includes(origin)) return callback(null, true);
            return callback(Object.assign(new Error('Origin not allowed'), { status: 403 }));
        },
        credentials: settings.credentials,
        methods: settings.methods,
        allowedHeaders: settings.headers,
    };
    return {
        cors,
        helmet: {
            hsts: { maxAge: settings.hstsMaxAge, includeSubDomains: true, preload: true },
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    connectSrc: ["'self'", ...settings.connectOrigins],
                    scriptSrc: ["'self'", ...settings.scriptOrigins],
                    imgSrc: ["'self'", 'data:', ...settings.imageOrigins],
                },
            },
        },
    };
}
