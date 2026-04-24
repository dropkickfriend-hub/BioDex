// Maps ISO-2 country codes to the environmental-protection authority whose
// listing governs endangered species for that jurisdiction. Used to label
// protected-species panels with the correct source of truth.

export interface Jurisdiction {
  authority: string; // short display name, e.g. "EPBC Act 1999"
  fullName: string;
  link?: string;
}

const JURISDICTIONS: { [cc: string]: Jurisdiction } = {
  AU: {
    authority: 'EPBC Act 1999',
    fullName: 'Environment Protection and Biodiversity Conservation Act (AU)',
    link: 'https://www.environment.gov.au/cgi-bin/sprat/public/publicthreatenedlist.pl',
  },
  US: {
    authority: 'Endangered Species Act',
    fullName: 'US Fish & Wildlife Service ESA Listed Species',
    link: 'https://www.fws.gov/program/endangered-species',
  },
  CA: {
    authority: 'SARA',
    fullName: 'Species at Risk Act (Canada)',
    link: 'https://species-registry.canada.ca/',
  },
  GB: {
    authority: 'WCA 1981',
    fullName: 'Wildlife and Countryside Act (UK)',
    link: 'https://jncc.gov.uk/our-work/uk-bap/',
  },
  NZ: {
    authority: 'Wildlife Act 1953',
    fullName: 'NZ Department of Conservation Threat Classification',
    link: 'https://www.doc.govt.nz/nature/conservation-status/',
  },
  IE: {
    authority: 'Wildlife Acts',
    fullName: 'National Parks & Wildlife Service (Ireland)',
  },
  ZA: {
    authority: 'NEM:BA',
    fullName: 'National Environmental Management: Biodiversity Act (ZA)',
  },
  IN: {
    authority: 'Wildlife Protection Act 1972',
    fullName: 'Wildlife (Protection) Act (India)',
  },
  DE: {
    authority: 'BNatSchG',
    fullName: 'Federal Nature Conservation Act (Germany)',
  },
  FR: {
    authority: 'Code de l’environnement',
    fullName: 'French Environmental Code / UICN France',
  },
  JP: {
    authority: 'Species Conservation Act',
    fullName: 'Act on Conservation of Endangered Species of Wild Fauna and Flora (Japan)',
  },
  BR: {
    authority: 'ICMBio Red List',
    fullName: 'Brazilian National List of Endangered Species',
  },
};

export function getJurisdiction(countryCode?: string): Jurisdiction {
  if (!countryCode) return fallback();
  return JURISDICTIONS[countryCode.toUpperCase()] || fallback();
}

function fallback(): Jurisdiction {
  return {
    authority: 'IUCN Red List',
    fullName: 'International Union for Conservation of Nature (global fallback)',
    link: 'https://www.iucnredlist.org/',
  };
}
