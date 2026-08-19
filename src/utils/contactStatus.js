export function contactStatus({
  publicPhones,
  publicLandlines,
  contactButtonAvailable,
  requiresAuthentication,
}) {
  if (publicPhones?.length > 0) return "public-phone-found";
  if (publicLandlines?.length > 0) return "public-landline-found";
  if (contactButtonAvailable && requiresAuthentication === false)
    return "contact-button-available";
  if (contactButtonAvailable && requiresAuthentication === true)
    return "authentication-required";
  if (contactButtonAvailable) return "contact-button-available";
  return "no-contact-information";
}

export function contactEnrichmentStatus({
  hasPublicContact,
  contactButtonAvailable,
  requiresAuthentication,
  providerAvailable,
}) {
  if (hasPublicContact) return "public-only";
  if (contactButtonAvailable && requiresAuthentication)
    return "authentication-required";
  if (contactButtonAvailable && !requiresAuthentication) return "enrichable";
  if (providerAvailable) return "authorized-provider-available";
  return "not-enrichable";
}
