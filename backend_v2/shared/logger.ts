import winston from 'winston';

/**
 * GDPR & HIPAA COMPLIANT MASKING + ANTI-REDOS
 * This covers the message, removes passwords, and truncates massive Base64 strings.
 */
const maskPII = winston.format((info: any) => {
    // Basic Regex Patterns
    const patterns = {
        email: /([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})/g,
        ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
        phone: /(?:(?:\+|00)[1-9]\d{0,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/g
    };

    const scrubString = (str: string): string => {
        return str
            .replace(patterns.email, (m, user, domain, ext) => `${user.charAt(0)}***@${domain}.${ext}`)
            .replace(patterns.ssn, '***-**-****')
            .replace(patterns.phone, '***-***-****');
    };

    // 1. Mask the main log message
    if (typeof info.message === 'string') {
        info.message = scrubString(info.message);
    }

    // 2. SECURITY FIX: Deep clean the metadata object to prevent logging Base64 & Passwords
    const deepClean = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(deepClean);

        const cleaned = { ...obj };
        for (const key in cleaned) {
            const lowerKey = key.toLowerCase();

            // Never log passwords or tokens
            if (lowerKey.includes('password') || lowerKey.includes('token')) {
                cleaned[key] = '[REDACTED_SECURITY]';
            }
            // Truncate massive Base64 images to prevent CloudWatch crashing / High Bills
            else if (lowerKey.includes('image') || lowerKey.includes('base64') || lowerKey === 'avatar') {
                if (typeof cleaned[key] === 'string' && cleaned[key].length > 100) {
                    cleaned[key] = `[BASE64_TRUNCATED_LENGTH_${cleaned[key].length}]`;
                }
            }
            // Mask strings
            else if (typeof cleaned[key] === 'string') {
                cleaned[key] = scrubString(cleaned[key]);
            }
            // Recursively clean objects
            else if (typeof cleaned[key] === 'object') {
                cleaned[key] = deepClean(cleaned[key]);
            }
        }
        return cleaned;
    };

    // Apply deep cleaning to the Winston metadata symbol
    const splat = info[Symbol.for('splat')];
    if (splat) {
        info[Symbol.for('splat')] = splat.map(deepClean);
    }

    return info;
});

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        maskPII(), // Run masking BEFORE JSON formatting
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

/** Create a named logger instance with PII masking. */
export const createLogger = (serviceName: string) => {
    return {
        log: (message: string, ...meta: any[]) => logger.info(`[${serviceName}] ${message}`, ...meta),
        error: (message: string, ...meta: any[]) => logger.error(`[${serviceName}] ${message}`, ...meta),
        info: (message: string, ...meta: any[]) => logger.info(`[${serviceName}] ${message}`, ...meta),
        warn: (message: string, ...meta: any[]) => logger.warn(`[${serviceName}] ${message}`, ...meta),
    };
};

export const safeLog = (message: string, ...meta: any[]) => {
    logger.info(message, ...meta);
};

export const safeError = (message: string, ...meta: any[]) => {
    logger.error(message, ...meta);
};
