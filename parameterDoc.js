"use strict";

var vejnavneDoc = {
  parameters: [
    {
      name: 'q',
      doc: 'Søgetekst. Der søges i vejnavnet. Alle ord i søgeteksten skal matche vejnavnet. ' +
        'Wildcard * er tilladt i slutningen af hvert ord. ' +
        'Der skelnes ikke mellem store og små bogstaver.',
      examples: ['tværvej']
    },
    {
      name: 'navn',
      doc: "Vejnavn. Der skelnes mellem store og små bokstaver.",
      examples: ['Margrethepladsen', 'Viborgvej']
    },
    {
      name: 'kommunekode',
      doc: 'Kommunekode. 4 cifre. Eksempel: 0101 for Københavns kommune.',
      examples: ['0101']
    },
    {
      name: 'postnr',
      doc: 'Postnummer. 4 cifre.',
      examples: ['2700']
    }
  ],
  examples: {
    query: [
      {
        description: 'Find vejnavne som ligger i postnummeret<em>2400 København NV</em> og indeholder et ord der starter med <em>hvid</em>',
        query: [
          {
            name: 'postnr',
            value: '2400'
          },
          {
            name: 'q',
            value: 'hvid*'
          }
        ]
      },
      {
        description: 'Find alle vejnavne i Københavns kommune (kommunekode 0101)',
        query: [
          {
            name: 'kommunekode',
            value: '0101'
          }
        ]
      }

    ],
    get: []
  }
};

var vejstykkerDoc = {
  parameters: [
    {
      name: 'q',
      doc: 'Søgetekst. Der søges i vejnavnet. Alle ord i søgeteksten skal matche vejnavnet. ' +
        'Wildcard * er tilladt i slutningen af hvert ord. ' +
        'Der skelnes ikke mellem store og små bogstaver.',
      examples: ['tværvej']
    },
    {
      name: 'navn',
      doc: "Vejnavn. Der skelnes mellem store og små bokstaver. Der kan anvendes wildcard-søgning.",
      examples: ['Margrethepladsen', 'Viborgvej']
    },
    {
      name: 'kommunekode',
      doc: 'Kommunekode. 4 cifre. Eksempel: 0101 for Københavns kommune.',
      examples: ['0101']
    },
    {
      name: 'kode',
      doc: 'vejkode. 4 cifre.',
      examples: ['0052']
    },
    {
      name: 'postnr',
      doc: 'Postnummer. 4 cifre.',
      examples: ['2700']
    }
  ],
  examples: {
    query: [
      {
        description: 'Find vejnavne som ligger i postnummeret<em>2400 København NV</em> og indeholder et ord der starter med <em>hvid</em>',
        query: [
          {
            name: 'postnr',
            value: '2400'
          },
          {
            name: 'q',
            value: 'hvid*'
          }
        ]
      },
      {
        description: 'Find alle vejnavne i Københavns kommune (kommunekode 0101)',
        query: [
          {
            name: 'kommunekode',
            value: '0101'
          }
        ]
      }
    ],
    get: []
  }
};

var supplerendeBynavneDoc = {
  parameters: [
    {
      name: 'q',
      doc: 'Søgetekst. Der søges i vejnavnet. Alle ord i søgeteksten skal matche vejnavnet. ' +
        'Wildcard * er tilladt i slutningen af hvert ord.'
    },
    {
      name: 'navn',
      doc: 'Navnet på det supplerende bynavn, f.eks. <em>Holeby</em>',
      examples: ['Holeby', 'Aabybro']
    },
    {
      name: 'postnr',
      doc: 'Postnummer. 4 cifre.',
      examples: ['2700']
    },
    {
      name: 'kommunekode',
      doc: 'Kommunekode. 4 cifre. Eksempel: 0101 for Københavns kommune.',
      examples: ['0101']
    }
  ],
  examples: {
    query: [
      {
        description: 'Find de supplerende bynavne som ligger i postnummeret <em>3700 Rønne</em>',
        query: [
          {
            name: 'postnr',
            value: '3700'
          }
          ]
      },
      {
        description: 'Find de supplerende bynavne, hvor et ord i det supplerende bynavn starter med <em>aar</em>',
        query: [
          { name: 'q',
            value: "aar*"
          }
          ]
      }
    ],
    get: [
      {
        description: 'Hent det supplerende bynavn med navn <em>Aarsballe</em>',
        path: ['Aarsballe']
      }]
  }
};

module.exports= {
  vejnavn: vejnavneDoc,
  vejstykke: vejstykkerDoc,
  supplerendeBynavn: supplerendeBynavneDoc
};