/**
 * Worldwide shipping location helpers (country → state/province → city).
 * Data from country-state-city.
 */
import { Country, State, City, type ICountry, type IState, type ICity } from 'country-state-city';

export type GeoCountry = Pick<ICountry, 'isoCode' | 'name' | 'flag'>;
export type GeoState = Pick<IState, 'isoCode' | 'name' | 'countryCode'>;
export type GeoCity = Pick<ICity, 'name' | 'stateCode' | 'countryCode'>;

let cachedCountries: GeoCountry[] | null = null;

export function getAllCountriesSorted(): GeoCountry[] {
  if (cachedCountries) return cachedCountries;
  cachedCountries = Country.getAllCountries()
    .map((c) => ({ isoCode: c.isoCode, name: c.name, flag: c.flag }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedCountries;
}

export function getStatesForCountry(countryCode: string): GeoState[] {
  if (!countryCode) return [];
  return State.getStatesOfCountry(countryCode)
    .map((s) => ({ isoCode: s.isoCode, name: s.name, countryCode: s.countryCode }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCitiesForState(countryCode: string, stateCode: string): GeoCity[] {
  if (!countryCode || !stateCode) return [];
  return City.getCitiesOfState(countryCode, stateCode)
    .map((c) => ({ name: c.name, stateCode: c.stateCode, countryCode: c.countryCode }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCitiesForCountry(countryCode: string): GeoCity[] {
  if (!countryCode) return [];
  const cities = City.getCitiesOfCountry(countryCode) || [];
  return cities
    .map((c) => ({ name: c.name, stateCode: c.stateCode, countryCode: c.countryCode }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findCountryByName(name: string): GeoCountry | undefined {
  if (!name.trim()) return undefined;
  const lower = name.trim().toLowerCase();
  return getAllCountriesSorted().find((c) => c.name.toLowerCase() === lower);
}

/** Label for subdivision field by country (e.g. State vs Province). */
export function subdivisionLabel(countryCode: string): string {
  switch (countryCode) {
    case 'US':
      return 'State';
    case 'CA':
      return 'Province / Territory';
    case 'AU':
      return 'State / Territory';
    case 'GB':
      return 'County / Region';
    case 'DE':
    case 'AT':
    case 'CH':
      return 'State / Canton';
    case 'IN':
      return 'State / Union Territory';
    case 'MX':
    case 'BR':
    case 'AR':
      return 'State / Province';
    case 'LU':
    case 'FR':
    case 'BE':
    case 'NL':
    case 'IT':
    case 'ES':
      return 'Region / Province';
    default:
      return 'State / Province / Region';
  }
}

export function postalLabel(countryCode: string): string {
  switch (countryCode) {
    case 'US':
      return 'ZIP Code';
    case 'GB':
      return 'Postcode';
    case 'CA':
      return 'Postal Code';
    default:
      return 'ZIP / Postal Code';
  }
}
