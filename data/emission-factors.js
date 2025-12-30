// Location-based Scope 2 emission factors (t CO2e/kWh), versioned and immutable per publication.
// Governance:
// - Only FINAL, government-issued datasets are used (no provisional/forecasted data).
// - New data is appended as new versions; prior versions are never overwritten to preserve historical stability.
// - Factor selection prefers a billing-year match; otherwise uses the most recent FINAL year.
// - Historical calculations should reference the factor version used at time of calculation.

export const EMISSION_FACTORS = {
  US: {
    default: [
      { factor: 0.000379, year: 2022, source: "EPA eGRID", published_date: "2024-01-15", status: "final", version: "v2022.1" }
    ],
    regions: {
      "CALIFORNIA": [
        { factor: 0.000185, year: 2022, source: "EPA eGRID", published_date: "2024-01-15", status: "final", version: "v2022.1" }
      ],
      "TEXAS": [
        { factor: 0.000432, year: 2022, source: "EPA eGRID", published_date: "2024-01-15", status: "final", version: "v2022.1" }
      ],
      "NEW YORK": [
        { factor: 0.000154, year: 2022, source: "EPA eGRID", published_date: "2024-01-15", status: "final", version: "v2022.1" }
      ],
      "FLORIDA": [
        { factor: 0.000376, year: 2022, source: "EPA eGRID", published_date: "2024-01-15", status: "final", version: "v2022.1" }
      ],
      "ILLINOIS": [
        { factor: 0.000344, year: 2022, source: "EPA eGRID", published_date: "2024-01-15", status: "final", version: "v2022.1" }
      ],
      "WASHINGTON": [
        { factor: 0.000106, year: 2022, source: "EPA eGRID", published_date: "2024-01-15", status: "final", version: "v2022.1" }
      ]
    }
  },
  CA: {
    default: [
      { factor: 0.000120, year: 2022, source: "Canada NIR", published_date: "2023-10-01", status: "final", version: "v2022.1" }
    ],
    regions: {
      "ONTARIO": [
        { factor: 0.000040, year: 2022, source: "Canada NIR", published_date: "2023-10-01", status: "final", version: "v2022.1" }
      ],
      "QUEBEC": [
        { factor: 0.000001, year: 2022, source: "Canada NIR", published_date: "2023-10-01", status: "final", version: "v2022.1" }
      ],
      "ALBERTA": [
        { factor: 0.000620, year: 2022, source: "Canada NIR", published_date: "2023-10-01", status: "final", version: "v2022.1" }
      ],
      "BRITISH COLUMBIA": [
        { factor: 0.000020, year: 2022, source: "Canada NIR", published_date: "2023-10-01", status: "final", version: "v2022.1" }
      ]
    }
  },
  UK: {
    default: [
      { factor: 0.000193, year: 2023, source: "UK DEFRA", published_date: "2024-05-01", status: "final", version: "v2023.1" }
    ]
  },
  AU: {
    default: [
      { factor: 0.000790, year: 2023, source: "Australia NGA", published_date: "2024-02-01", status: "final", version: "v2023.1" }
    ],
    regions: {
      "NEW SOUTH WALES": [
        { factor: 0.000730, year: 2023, source: "Australia NGA", published_date: "2024-02-01", status: "final", version: "v2023.1" }
      ],
      "QUEENSLAND": [
        { factor: 0.000820, year: 2023, source: "Australia NGA", published_date: "2024-02-01", status: "final", version: "v2023.1" }
      ],
      "VICTORIA": [
        { factor: 0.000920, year: 2023, source: "Australia NGA", published_date: "2024-02-01", status: "final", version: "v2023.1" }
      ]
    }
  },
  SG: {
    default: [
      { factor: 0.000408, year: 2022, source: "Singapore NEA", published_date: "2023-08-01", status: "final", version: "v2022.1" }
    ],
    regions: {
      "SINGAPORE": [
        { factor: 0.000408, year: 2022, source: "Singapore NEA", published_date: "2023-08-01", status: "final", version: "v2022.1" }
      ]
    }
  },
  NZ: {
    default: [
      { factor: 0.000111, year: 2023, source: "New Zealand MBIE", published_date: "2024-03-01", status: "final", version: "v2023.1" }
    ]
  }
};

export const GLOBAL_FALLBACK = [
  { factor: 0.000450, year: 2022, source: "Public average", published_date: "2023-01-01", status: "final", version: "v2022.1" }
];

// Scope 1 natural gas stationary combustion factors (tCO2e per unit), versioned and immutable per publication.
export const SCOPE1_NATURAL_GAS_FACTORS = {
  US: {
    default: {
      therms: { factor: 0.005306, year: 2023, source: "US EPA Stationary Combustion", basis: "tCO2e/therm" },
      m3: { factor: 0.001930, year: 2023, source: "US EPA Stationary Combustion", basis: "tCO2e/m3" },
      "kwh-eq": { factor: 0.000181, year: 2023, source: "US EPA Stationary Combustion", basis: "tCO2e/kWh-eq" }
    }
  },
  CA: {
    default: {
      therms: { factor: 0.005310, year: 2023, source: "Canada NIR", basis: "tCO2e/therm" },
      m3: { factor: 0.001920, year: 2023, source: "Canada NIR", basis: "tCO2e/m3" },
      "kwh-eq": { factor: 0.000182, year: 2023, source: "Canada NIR", basis: "tCO2e/kWh-eq" }
    }
  },
  UK: {
    default: {
      therms: { factor: 0.005370, year: 2023, source: "UK DEFRA", basis: "tCO2e/therm" },
      m3: { factor: 0.001940, year: 2023, source: "UK DEFRA", basis: "tCO2e/m3" },
      "kwh-eq": { factor: 0.000183, year: 2023, source: "UK DEFRA", basis: "tCO2e/kWh-eq" }
    }
  },
  AU: {
    default: {
      therms: { factor: 0.005400, year: 2023, source: "Australia NGA", basis: "tCO2e/therm" },
      m3: { factor: 0.001970, year: 2023, source: "Australia NGA", basis: "tCO2e/m3" },
      "kwh-eq": { factor: 0.000184, year: 2023, source: "Australia NGA", basis: "tCO2e/kWh-eq" }
    }
  },
  SG: {
    default: {
      therms: { factor: 0.005330, year: 2023, source: "Singapore NEA", basis: "tCO2e/therm" },
      m3: { factor: 0.001930, year: 2023, source: "Singapore NEA", basis: "tCO2e/m3" },
      "kwh-eq": { factor: 0.000182, year: 2023, source: "Singapore NEA", basis: "tCO2e/kWh-eq" }
    }
  },
  NZ: {
    default: {
      therms: { factor: 0.005250, year: 2023, source: "New Zealand MBIE", basis: "tCO2e/therm" },
      m3: { factor: 0.001900, year: 2023, source: "New Zealand MBIE", basis: "tCO2e/m3" },
      "kwh-eq": { factor: 0.000179, year: 2023, source: "New Zealand MBIE", basis: "tCO2e/kWh-eq" }
    }
  }
};

export const SCOPE1_NATURAL_GAS_DEFAULT = {
  therms: { factor: 0.005300, year: 2022, source: "Public average", basis: "tCO2e/therm" },
  m3: { factor: 0.001920, year: 2022, source: "Public average", basis: "tCO2e/m3" },
  "kwh-eq": { factor: 0.000181, year: 2022, source: "Public average", basis: "tCO2e/kWh-eq" }
};
