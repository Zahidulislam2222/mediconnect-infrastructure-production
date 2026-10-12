// Google metadata protocol and JavaScript timer invariants, not deployment defaults.
export const federationProtocol = Object.freeze({
  metadataHost: 'metadata.google.internal',
  metadataHeader: 'Metadata-Flavor',
  metadataFlavor: 'Google',
  maximumTimerMs: 2 ** 31 - 1,
  tokenPattern: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![\s\S])/,
});
