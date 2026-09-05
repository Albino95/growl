/**
 * Worldwide shipping location helpers (country → state/province → city).
 *
 * Country + State load without pulling the full city dataset (which is huge and
 * blanks mobile). Cities load lazily on demand.
 */
import type { ICountry, IState, ICity } from 'country-state-city';

// CJS modules expose `{ default: { getAllCountries, ... } }` under Node/Metro.
// Normalize so both ESM interop and raw CJS work.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CountryMod = require('country-state-city/lib/cjs/country');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StateMod = require('country-state-city/lib/cjs/state');

const Country = (CountryMod.default || CountryMod) as {
  getAllCountries: () => ICountry[];
};
const State = (StateMod.default || StateMod) as {
  getStatesOfCountry: (countryCode?: string) => IState[];
};

export type GeoCountry = Pick<ICountry, 'isoCode' | 'name' | 'flag'>;
export type GeoState = Pick<IState, 'isoCode' | 'name' | 'countryCode'>;
export type GeoCity = Pick<ICity, 'name' | 'stateCode' | 'countryCode'>;

let cachedCountries: GeoCountry[] | null = null;
let cityModulePromise: Promise<{
  getCitiesOfState: (countryCode: string, stateCode: string) => ICity[];
  getCitiesOfCountry: (countryCode: string) => ICity[] | undefined;
}> | null = null;

async function loadCityModule() {
  if (!cityModulePromise) {
    cityModulePromise = import('country-state-city/lib/cjs/city').then((mod) => {
      const raw = (mod as { default?: unknown }).default || mod;
      return raw as {
        getCitiesOfState: (countryCode: string, stateCode: string) => ICity[];
        getCitiesOfCountry: (countryCode: string) => ICity[] | undefined;
      };
    });
  }
  return cityModulePromise;
}

export function getAllCountriesSorted(): GeoCountry[] {
  if (cachedCountries) return cachedCountries;
  try {
    cachedCountries = Country.getAllCountries()
      .map((c) => ({ isoCode: c.isoCode, name: c.name, flag: c.flag }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.warn('[geoLocations] failed to load countries', e);
    cachedCountries = [];
  }
  return cachedCountries;
}

export function getStatesForCountry(countryCode: string): GeoState[] {
  if (!countryCode) return [];
  try {
    return State.getStatesOfCountry(countryCode)
      .map((s) => ({ isoCode: s.isoCode, name: s.name, countryCode: s.countryCode }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.warn('[geoLocations] failed to load states', e);
    return [];
  }
}

export async function getCitiesForStateAsync(
  countryCode: string,
  stateCode: string
): Promise<GeoCity[]> {
  if (!countryCode || !stateCode) return [];
  try {
    const City = await loadCityModule();
    return City.getCitiesOfState(countryCode, stateCode)
      .map((c) => ({ name: c.name, stateCode: c.stateCode, countryCode: c.countryCode }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.warn('[geoLocations] failed to load cities for state', e);
    return [];
  }
}

export async function getCitiesForCountryAsync(countryCode: string): Promise<GeoCity[]> {
  if (!countryCode) return [];
  try {
    const City = await loadCityModule();
    const cities = City.getCitiesOfCountry(countryCode) || [];
    return cities
      .map((c) => ({ name: c.name, stateCode: c.stateCode, countryCode: c.countryCode }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    console.warn('[geoLocations] failed to load cities for country', e);
    return [];
  }
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
