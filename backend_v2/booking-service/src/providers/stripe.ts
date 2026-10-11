import Stripe from 'stripe';
import { getStripeSettings } from '../../../shared/settings';

/** All billing consumers share one explicitly configured SDK transport and API version. */
export function createStripeClient(key: string): Stripe {
    const config = getStripeSettings();
    return new Stripe(key, {
        apiVersion: config.apiVersion as Stripe.LatestApiVersion,
        host: config.host,
        timeout: config.timeoutMs,
        maxNetworkRetries: config.maxNetworkRetries,
    });
}
