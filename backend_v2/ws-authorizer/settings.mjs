export function socketAuthorizerSettings(environment = process.env) {
  const region = environment.AWS_REGION?.trim();
  const us = environment.PRIVACY_US_REGION?.trim();
  const eu = environment.PRIVACY_EU_REGION?.trim();
  const table = environment.TABLE_CHAT_CONNECTIONS?.trim();
  if (!region || !us || !eu || !table || us === eu || ![us, eu].includes(region)) throw new Error('WS_AUTH_CONFIGURATION_REQUIRED');
  return { region, jurisdiction: region === eu ? 'EU' : 'US', table };
}
