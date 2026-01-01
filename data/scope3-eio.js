// Scope 3 screening factors (spend-based EIO). These are high-level,
// national-average factors intended for indicative estimates only.
// Replace with vetted EEIO dataset values before production use.

export const SCOPE3_DISCLOSURE =
  'Scope 3 emissions shown here are screening-level estimates calculated using spend-based environmentally extended input-output (EIO) models. Results are indicative only and subject to high uncertainty.';

const CATEGORY_DEFINITIONS = [
  { id: 'purchased_goods', label: 'Purchased Goods & Services (General)' },
  { id: 'professional_services', label: 'Professional Services' },
  { id: 'software_cloud', label: 'Software & Cloud Services' },
  { id: 'marketing_advertising', label: 'Marketing & Advertising Services' },
  { id: 'logistics_shipping', label: 'Logistics & Shipping (Upstream, spend-based)' }
];

const buildCategories = (overrides) =>
  CATEGORY_DEFINITIONS.map((base) => ({ ...base, ...overrides[base.id] }));

export const SCOPE3_FACTOR_SETS = {
  US: {
    model: 'USEEIO v2.0',
    geo: 'US national average',
    year: 2018,
    currency: 'USD',
    source: 'USEEIO v2.0 (placeholder values; replace with vetted dataset)',
    categories: buildCategories({
      purchased_goods: {
        eio_sector: 'USEEIO: Other miscellaneous manufacturing (composite)',
        factor: 0.00045
      },
      professional_services: {
        eio_sector: 'USEEIO: Professional, scientific, and technical services',
        factor: 0.00012
      },
      software_cloud: {
        eio_sector: 'USEEIO: Data processing, hosting, and related services',
        factor: 0.00008
      },
      marketing_advertising: {
        eio_sector: 'USEEIO: Advertising and related services',
        factor: 0.00020
      },
      logistics_shipping: {
        eio_sector: 'USEEIO: Freight transportation and logistics services',
        factor: 0.00035
      }
    })
  },
  UK: {
    model: 'UK ONS EEIO',
    geo: 'UK national average',
    year: 2019,
    currency: 'GBP',
    source: 'UK ONS EEIO (placeholder values; replace with vetted dataset)',
    categories: buildCategories({
      purchased_goods: {
        eio_sector: 'UK EEIO: Manufacturing (composite)',
        factor: 0.00042
      },
      professional_services: {
        eio_sector: 'UK EEIO: Professional services',
        factor: 0.00011
      },
      software_cloud: {
        eio_sector: 'UK EEIO: Information services',
        factor: 0.00007
      },
      marketing_advertising: {
        eio_sector: 'UK EEIO: Advertising services',
        factor: 0.00018
      },
      logistics_shipping: {
        eio_sector: 'UK EEIO: Freight and logistics services',
        factor: 0.00030
      }
    })
  },
  CA: {
    model: 'EXIOBASE 3',
    geo: 'Canada national average',
    year: 2019,
    currency: 'CAD',
    source: 'EXIOBASE 3 (placeholder values; replace with vetted dataset)',
    categories: buildCategories({
      purchased_goods: {
        eio_sector: 'EXIOBASE: Manufacturing (composite)',
        factor: 0.00040
      },
      professional_services: {
        eio_sector: 'EXIOBASE: Professional services',
        factor: 0.00010
      },
      software_cloud: {
        eio_sector: 'EXIOBASE: ICT services',
        factor: 0.00007
      },
      marketing_advertising: {
        eio_sector: 'EXIOBASE: Advertising services',
        factor: 0.00016
      },
      logistics_shipping: {
        eio_sector: 'EXIOBASE: Freight transport services',
        factor: 0.00028
      }
    })
  },
  AU: {
    model: 'EXIOBASE 3',
    geo: 'Australia national average',
    year: 2019,
    currency: 'AUD',
    source: 'EXIOBASE 3 (placeholder values; replace with vetted dataset)',
    categories: buildCategories({
      purchased_goods: {
        eio_sector: 'EXIOBASE: Manufacturing (composite)',
        factor: 0.00043
      },
      professional_services: {
        eio_sector: 'EXIOBASE: Professional services',
        factor: 0.00011
      },
      software_cloud: {
        eio_sector: 'EXIOBASE: ICT services',
        factor: 0.00008
      },
      marketing_advertising: {
        eio_sector: 'EXIOBASE: Advertising services',
        factor: 0.00017
      },
      logistics_shipping: {
        eio_sector: 'EXIOBASE: Freight transport services',
        factor: 0.00032
      }
    })
  },
  NZ: {
    model: 'EXIOBASE 3',
    geo: 'New Zealand national average',
    year: 2019,
    currency: 'NZD',
    source: 'EXIOBASE 3 (placeholder values; replace with vetted dataset)',
    categories: buildCategories({
      purchased_goods: {
        eio_sector: 'EXIOBASE: Manufacturing (composite)',
        factor: 0.00041
      },
      professional_services: {
        eio_sector: 'EXIOBASE: Professional services',
        factor: 0.00010
      },
      software_cloud: {
        eio_sector: 'EXIOBASE: ICT services',
        factor: 0.00007
      },
      marketing_advertising: {
        eio_sector: 'EXIOBASE: Advertising services',
        factor: 0.00016
      },
      logistics_shipping: {
        eio_sector: 'EXIOBASE: Freight transport services',
        factor: 0.00029
      }
    })
  },
  SG: {
    model: 'EXIOBASE 3',
    geo: 'Singapore national average',
    year: 2019,
    currency: 'SGD',
    source: 'EXIOBASE 3 (placeholder values; replace with vetted dataset)',
    categories: buildCategories({
      purchased_goods: {
        eio_sector: 'EXIOBASE: Manufacturing (composite)',
        factor: 0.00039
      },
      professional_services: {
        eio_sector: 'EXIOBASE: Professional services',
        factor: 0.00009
      },
      software_cloud: {
        eio_sector: 'EXIOBASE: ICT services',
        factor: 0.00006
      },
      marketing_advertising: {
        eio_sector: 'EXIOBASE: Advertising services',
        factor: 0.00015
      },
      logistics_shipping: {
        eio_sector: 'EXIOBASE: Freight transport services',
        factor: 0.00027
      }
    })
  }
};

export const SCOPE3_CATEGORY_LIST = CATEGORY_DEFINITIONS;
