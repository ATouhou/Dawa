"use strict";

/*
 * This file specifies the JSON representation of each resource type in the form of a JSON schema and a
 * mapper function. The mapper function maps from database rows.
 */

var commonMappers = require('./commonMappers');
var commonSchemaDefinitionsUtil = require('./commonSchemaDefinitionsUtil');
var dagiTemaer = require('./dagiTemaer');
var definitions = require('./commonSchemaDefinitions');
var schemaUtil = require('./schemaUtil');
var util = require('./util');
var _ = require('underscore');

var adressebetegnelse = util.adressebetegnelse;
var d = util.d;
var globalSchemaObject = commonSchemaDefinitionsUtil.globalSchemaObject;
var kode4String = util.kode4String;
var makeHref = commonMappers.makeHref;
var mapKommuneRef = commonMappers.mapKommuneRef;
var mapKommuneRefArray = commonMappers.mapKommuneRefArray;
var mapPostnummerRef = commonMappers.mapPostnummerRef;
var mapPostnummerRefArray = commonMappers.mapPostnummerRefArray;
var maybeNull = util.maybeNull;
var nullableType = schemaUtil.nullableType;
var schemaObject = schemaUtil.schemaObject;

exports.adgangsadresse = {
  schema: globalSchemaObject({
    title: 'Adgangsadresse',
    properties: {
      href: {
        description: 'Adgangsadressens URL.',
        $ref: '#/definitions/Href'
      },
      'id'     : {
        description: 'Universel, unik identifikation af adressen af datatypen UUID. ' +
          'Er stabil over hele adressens levetid (ligesom et CPR-nummer) ' +
          'dvs. uanset om adressen evt. ændrer vejnavn, husnummer, postnummer eller kommunekode. ' +
          'Repræsenteret som 32 hexadecimale tegn. Eksempel: ”0a3f507a-93e7-32b8-e044-0003ba298018”.',
        '$ref': '#/definitions/UUID'
      },
      'vejstykke'    : {
        description: 'Vejstykket som adressen er knyttet til. Udgår og bliver erstattet af Navngiven vej.',
        $ref: '#/definitions/VejstykkeKodeOgNavn'
      },
      'husnr'  : {
        description: 'Husnummer der identificerer den pågældende adresse i forhold til andre adresser med samme vejnavn.' +
          ' Husnummeret består af et tal 1-999 evt. suppleret af et stort bogstav A..Z, og fastsættes i stigende orden, ' +
          'normalt med lige og ulige numre på hver side af vejen. Eksempel: "11", "12A", "187B".',
        type: 'string',
        pattern: '([1-9]|[1-9]\\d|[1-9]\\d{2})[A-Z]?'
      },
      'bygningsnavn': {
        description: 'Evt. bygningsnavn eller gårdnavn, der er registreret af kommunen som en supplerende adressebetegnelse. Indtil 34 tegn. Eksempel: ”Solholm”. Udgår og bliver overført til Stednavne.',
        type: nullableType('string')
      },
      'supplerendebynavn': {
        description: 'Et supplerende bynavn – typisk landsbyens navn – eller andet lokalt stednavn der er fastsat af ' +
          'kommunen for at præcisere adressens beliggenhed indenfor postnummeret. ' +
          'Indgår som en del af den officielle adressebetegnelse. Indtil 34 tegn. Eksempel: ”Sønderholm”.',
        type: nullableType('string'), maxLength: 34
      },
      'postnummer': {
        description: 'Postnummeret som adressen er beliggende i.',
        $ref: '#/definitions/NullablePostnummerRef'
      },
      'kommune':{
        description: 'Kommunen som adressen er beliggende i.',
        $ref: '#/definitions/KommuneRef'
      },
      'ejerlav': schemaObject({
        description: 'Det matrikulære ejerlav som adressen ligger i.',
        nullable: true,
        properties: {
          'kode': {
            description: 'Unik identifikation af det matrikulære ”ejerlav”, som adressen ligger i. ' +
              'Repræsenteret ved indtil 7 cifre. Eksempel: ”170354” for ejerlavet ”Eskebjerg By, Bregninge”.',
            '$ref': '#/definitions/UpTo7'
          },
          'navn': {
            description: 'Det matrikulære ”ejerlav”s navn. Eksempel: ”Eskebjerg By, Bregninge”.',
            type: 'string'
          }
        },
        docOrder: ['kode', 'navn']
      }),
      'matrikelnr': {
        description: 'Betegnelse for det matrikelnummer, dvs. jordstykke, som adressen er beliggende på. ' +
          'Repræsenteret ved Indtil 7 tegn: max. 4 cifre + max. 3 små bogstaver. Eksempel: ”18b”.',
        type: nullableType('string'),
        pattern: '^[0-9a-zæøå]{1,7}$'
      },
      'esrejendomsnr': {
        description: 'Identifikation af den vurderingsejendom jf. Ejendomsstamregisteret, ' +
          'ESR, som det matrikelnummer som adressen ligger på, er en del af. ' +
          'Repræsenteret ved seks cifre. Eksempel ”001388”.',
        type: nullableType('string'),
        pattern: '^[0-9]{1,6}'
      },
      'historik' : schemaObject({
        'description': 'Væsentlige tidspunkter for adressen',
        properties: {
          'oprettet': {
            description: 'Dato og tid for adressens oprettelse. Eksempel: 2001-12-23T00:00:00.',
            '$ref': '#/definitions/NullableDateTime'
          },
          'ikrafttrædelse': {
            description: 'Dato og tid for adressens ikrafttrædelse. Eksempel: 2002-01-01T00:00:00.',
            '$ref': '#/definitions/NullableDateTime'
          },
          'ændret': {
            description: 'Dato og tid hvor der sidst er ændret i adressen. Eksempel: 2002-04-08T00:00:00.',
            type: nullableType('string'),
            '$ref': '#/definitions/NullableDateTime'
          }
        },
        docOrder: ['oprettet', 'ikrafttrædelse', 'ændret']

      }),
      'adgangspunkt': schemaObject({
        description: 'Geografisk punkt, som angiver særskilt adgang fra navngiven vej ind på et areal eller bygning.',
        properties: {
          koordinater: {
            description: 'Adgangspunktets koordinater som array [x,y].',
            $ref: '#/definitions/NullableGeoJsonCoordinates'
          },
          nøjagtighed: {
            description: 'Kode der angiver nøjagtigheden for adressepunktet. ' +
              'Et tegn. ”A” betyder at adressepunktet er absolut placeret på et detaljeret grundkort, ' +
              'tyisk med en nøjagtighed bedre end +/- 2 meter. ”B” betyder at adressepunktet er beregnet – ' +
              'typisk på basis af matrikelkortet, således at adressen ligger midt på det pågældende matrikelnummer. ' +
              'I så fald kan nøjagtigheden være ringere en end +/- 100 meter afhængig af forholdene. ' +
              '”U” betyder intet adressepunkt.',
            type: 'string',
            pattern: '^A|B|U$'
          },
          kilde: {
            description: 'Kode der angiver kilden til adressepunktet. Et tegn. ' +
              '”1” = oprettet maskinelt fra teknisk kort; ' +
              '”2” = Oprettet maskinelt fra af matrikelnummer tyngdepunkt; ' +
              '”3” = Eksternt indberettet af konsulent på vegne af kommunen; ' +
              '”4” = Eksternt indberettet af kommunes kortkontor o.l. ' +
              '”5” = Oprettet af teknisk forvaltning."',
            type: nullableType('integer'), minimum: 1, maximum: 5

          },
          tekniskstandard: {
            description: 'Kode der angiver den specifikation adressepunktet skal opfylde. 2 tegn. ' +
              '”TD” = 3 meter inde i bygningen ved det sted hvor indgangsdør e.l. skønnes placeret; ' +
              '”TK” = Udtrykkelig TK-standard: 3 meter inde i bygning, midt for længste side mod vej; ' +
              '”TN” Alm. teknisk standard: bygningstyngdepunkt eller blot i bygning; ' +
              '”UF” = Uspecificeret/foreløbig: ikke nødvendigvis placeret i bygning."',
            type: nullableType('string'),
            pattern: '^TD|TK|TN|UF$'
          },
          tekstretning: {
            description: 'Angiver en evt. retningsvinkel for adressen i ”gon” ' +
              'dvs. hvor hele cirklen er 400 gon og 200 er vandret. ' +
              'Værdier 0.00-400.00: Eksempel: ”128.34”.',
            type: nullableType('number'),
            minimum: 0,
            maximum: 400
          },
          ændret: {
            description: 'Dato og tid for sidste ændring i adressepunktet. Eksempel: ”1998-11-17T00:00:00”',
            '$ref': '#/definitions/NullableDateTime'
          }
        },
        docOrder: ['koordinater','nøjagtighed','kilde', 'tekniskstandard','tekstretning', 'ændret']
      }),
      'DDKN': schemaObject({
        nullable: true,
        description: 'Adressens placering i Det Danske Kvadratnet (DDKN).',
        properties: {
          'm100': {
            description: 'Angiver betegnelsen for den 100 m celle som adressen er beliggende i. 15 tegn. Eksempel: ”100m_61768_6435”.',
            type: 'string',
            pattern: '^100m_(\\d{5})_(\\d{4})$'
          },
          'km1' : {
            description: 'Angiver betegnelsen for den 1 km celle som adressen er beliggende i. 12 tegn. Eksempel: ”1km_6176_643”.',
            type: 'string',
            pattern:  '^1km_(\\d{4})_(\\d{3})$'
          },
          'km10': {
            description: 'Angiver betegnelsen for den 10 km celle som adressen er beliggende i. 11 tegn. Eksempel: ”10km_617_64”.',
            type: 'string',
            pattern: '^10km_(\\d{3})_(\\d{2})$'
          }
        },
        docOrder: ['m100', 'km1', 'km10']
      }),
      'sogn': schemaObject({
        nullable: true,
        description: 'Sognet som adressen er beliggende i.',
        properties: {
          kode: {
            description: 'Identifikation af sognet',
            $ref: '#/definitions/Kode4'
          },
          navn: {
            description: 'Sognets navn',
            type: 'string'
          }
        },
        docOrder: ['kode', 'navn']
      }),
      'region': schemaObject({
        nullable: true,
        description: 'Regionen som adressen er beliggende i.',
        properties: {
          kode: {
            description: 'Identifikation af regionen',
            $ref: '#/definitions/Kode4'
          },
          navn: {
            description: 'Regionens navn',
            type: 'string'
          }
        },
        docOrder: ['kode', 'navn']
      }),
      'retskreds': schemaObject({
        nullable: true,
        description: 'Retskredsen som adressen er beliggende i.',
        properties: {
          kode: {
            description: 'Identifikation af retskredsen',
            $ref: '#/definitions/Kode4'
          },
          navn: {
            description: 'Retskredsens navn',
            type: 'string'
          }
        },
        docOrder: ['kode', 'navn']
      }),
      'politikreds': schemaObject({
        nullable: true,
        description: 'Politikredsen som adressen er beliggende i.',
        properties: {
          kode: {
            description: 'Identifikation af politikredsen',
            $ref: '#/definitions/Kode4'
          },
          navn: {
            description: 'Politikredsens navn',
            type: 'string'
          }
        },
        docOrder: ['kode', 'navn']
      }),
      'opstillingskreds': schemaObject({
        nullable: true,
        description: 'Opstillingskresen som adressen er beliggende i.',
        properties: {
          kode: {
            description: 'Identifikation af opstillingskredsen.',
            $ref: '#/definitions/Kode4'
          },
          navn: {
            description: 'Opstillingskredsens navn.',
            type: 'string'
          }
        },
        docOrder: ['kode', 'navn']
      }),
      'afstemningsområde': schemaObject({
        nullable: true,
        description: 'Afstemningsområdet som adressen er beliggende i.',
        properties: {
          kode: {
            description: 'Identifikation af afstemningsområdet',
            $ref: '#/definitions/Kode4'
          },
          navn: {
            description: 'Afstemningsområdet navn',
            type: 'string'
          }
        },
        docOrder: ['kode', 'navn']
      })
    },
    docOrder: ['href','id', 'vejstykke', 'husnr','bygningsnavn', 'supplerendebynavn',
      'postnummer','kommune', 'ejerlav', 'matrikelnr','esrejendomsnr', 'historik',
      'adgangspunkt', 'DDKN', 'sogn','region','retskreds','politikreds','opstillingskreds','afstemningsområde']
  }),
  mapper: function (rs, options){
    function mapDagiTema(tema) {
      return {
        href: makeHref(options.baseUrl, tema.tema, tema.kode),
        kode: tema.kode,
        navn: tema.navn
      };
    }
    var adr = {};
    adr.href = makeHref(options.baseUrl, 'adgangsadresse', [rs.a_id]);
    adr.id = rs.a_id;
    adr.vejstykke = {
      href: makeHref(options.baseUrl, 'vejstykke', [rs.vejkode]),
      navn: maybeNull(rs.vejnavn),
      kode: kode4String(rs.vejkode)
    };
    adr.husnr = rs.husnr;
    adr.bygningsnavn = maybeNull(rs.bygningsnavn);
    adr.supplerendebynavn = maybeNull(rs.supplerendebynavn);
    adr.postnummer = mapPostnummerRef({nr: rs.postnr, navn: rs.postnrnavn}, options.baseUrl);
    adr.kommune = mapKommuneRef({kode: rs.kommunekode, navn: rs.kommunenavn}, options.baseUrl);
    if(rs.ejerlavkode) {
      adr.ejerlav = {
        kode: rs.ejerlavkode,
        navn: rs.ejerlavnavn
      };
    }
    else {
      adr.ejerlav = null;
    }
    adr.esrejendomsnr = maybeNull(rs.esrejendomsnr);
    adr.matrikelnr = maybeNull(rs.matrikelnr);
    adr.historik = {
      oprettet: d(rs.a_oprettet),
      ikrafttrædelse: d(rs.a_ikraftfra),
      'ændret': d(rs.a_aendret)
    };
    adr.adgangspunkt = {
      koordinater: rs.geom_json ? JSON.parse(rs.geom_json).coordinates : null,
      'nøjagtighed': maybeNull(rs.noejagtighed),
      kilde: maybeNull(rs.kilde),
      tekniskstandard: maybeNull(rs.tekniskstandard),
      tekstretning:    maybeNull(rs.tekstretning),
      'ændret':        d(rs.adressepunktaendringsdato)
    };
    adr.DDKN = rs.kn100mdk || rs.kn1kmdk || rs.kn10kmdk ? {
      m100: maybeNull(rs.kn100mdk),
      km1:  maybeNull(rs.kn1kmdk),
      km10: maybeNull(rs.kn10kmdk)
    } : null;

    // DAGI temaer
    adr.sogn = null;
    adr.region = null;
    adr.retskreds = null;
    adr.politikreds = null;
    adr.opstillingskreds = null;
    adr.afstemningsområde = null;
    var dagiTemaArray = rs.dagitemaer ? rs.dagitemaer.filter(function(tema) { return util.notNull(tema.tema); }) : [];
    var dagiTemaer = _.indexBy(_.map(dagiTemaArray, mapDagiTema), 'tema');
    // kommune is handled differently
    delete dagiTemaer.kommune;
    _.extend(adr, dagiTemaer);
    return adr;
  }
};

var adresseDefinitions = _.clone(definitions);
adresseDefinitions.Adgangsadresse = exports.adgangsadresse.schema;

exports.adresse = {
  schema: globalSchemaObject({
    'title': 'Adresse',
    'properties': {
      'href': {
        description: 'Adressens unikke URL.',
        $ref: '#/definitions/Href'
      },
      'id':      {
        description: 'Universel, unik identifikation af adressen af datatypen UUID . ' +
          'Er stabil over hele adressens levetid (ligesom et CPR-nummer) ' +
          'dvs. uanset om adressen evt. ændrer vejnavn, husnummer, postnummer eller kommunekode. ' +
          'Repræsenteret som 32 hexadecimale tegn. Eksempel: ”0a3f507a-93e7-32b8-e044-0003ba298018”.',
        '$ref': '#/definitions/UUID'
      },
      'etage':   {
        description: 'Etagebetegnelse. Hvis værdi angivet kan den antage følgende værdier: ' +
          'tal fra 1 til 99, st, kl, kl2 op til kl9.',
        '$ref': '#/definitions/NullableEtage'
      },
      'dør':     {
        description: 'Dørbetnelse. Hvis værdi angivet kan den antage følgende værdier: ' +
          'tal fra 1 til 9999, små og store bogstaver samt tegnene / og -.',
        type: nullableType('string')
      },
      'adressebetegnelse': {
        description: '',
        type: 'string'
      },
      'adgangsadresse': {
        description: 'Adressens adgangsadresse',
        $ref: '#/definitions/Adgangsadresse'
      }
    },
    docOrder: ['href','id', 'etage', 'dør', 'adressebetegnelse', 'adgangsadresse'],
    definitions: adresseDefinitions
  }),
  mapper: function (rs, options){
    var adr = {};
    adr.id = rs.e_id;
    adr.href = makeHref(options.baseUrl, 'adresse', [rs.e_id]);
    adr.etage = maybeNull(rs.etage);
    adr.dør = maybeNull(rs.doer);
    adr.adressebetegnelse = adressebetegnelse(rs);
    adr.adgangsadresse = exports.adgangsadresse.mapper(rs, options);
    return adr;
  }
};

exports.supplerendebynavn = {
  schema: globalSchemaObject({
    'title': 'supplerendebynavn',
    'properties': {
      href: {
        description: 'Det supplerende bynavns unikke URL',
        $ref: '#/definitions/Href'
      },
      'navn': {
        description: 'Det supplerende bynavn. Indtil 34 tegn. Eksempel: ”Sønderholm”.',
        type: 'string',
        maxLength: 34
      },
      'postnumre': {
        description: 'Postnumre, som det supplerende bynavn er beliggende i.',
        type: 'array',
        items: { '$ref': '#/definitions/PostnummerRef'}
      },
      'kommuner': {
        description: 'Kommuner, som det supplerende bynavn er beliggende i.',
        type: 'array',
        items: { '$ref': '#/definitions/KommuneRef'}
      }
    },
    'docOrder': ['href', 'navn', 'kommuner', 'postnumre']
  }),
  mapper: function(row, options) {
    var baseUrl = options.baseUrl;
    return {
      href: makeHref(baseUrl, 'supplerendebynavn', [row.supplerendebynavn]),
      navn: row.supplerendebynavn,
      postnumre: mapPostnummerRefArray(row.postnumre, baseUrl),
      kommuner: mapKommuneRefArray(row.kommuner, baseUrl)
    };
  }
};

exports.vejnavn = {
  schema: globalSchemaObject({
    'title': 'vejnavn',
    'properties': {
      href: {
        description: 'Vejnavnets unikke URL.',
        $ref: '#/definitions/Href'
      },
      'navn': {
        description: 'Vejnavnet',
        type: 'string'
      },
      'postnumre': {
        description: 'De postnumre, hvori der ligger en vej med dette navn.',
        type: 'array',
        items: {
          $ref: '#/definitions/PostnummerRef'
        }
      },
      'kommuner': {
        description: 'De kommuner hvori der ligger en vej med dette navn.',
        type: 'array',
        items: { '$ref': '#/definitions/KommuneRef'}
      }
    },
    docOrder: ['href', 'navn', 'postnumre', 'kommuner']
  }),
  mapper: function (row, options) {
    return {
      href: makeHref(options.baseUrl, 'vejnavn', [row.navn]),
      navn: row.navn,
      postnumre: mapPostnummerRefArray(row.postnumre, options.baseUrl),
      kommuner: mapKommuneRefArray(row.kommuner, options.baseUrl)

    };
  }
};

exports.vejstykke = {
  schema: globalSchemaObject({
    'title': 'vejstykke',
    'properties': {
      'href': {
        description: 'Vejstykkets unikke URL.',
        $ref: '#/definitions/Href'
      },
      'kode': {
        description: 'Identifikation af vejstykke. ' +
          'Er unikt indenfor den pågældende kommune. Repræsenteret ved fire cifre. ' +
          'Eksempel: I Københavns kommune er ”0004” lig ”Abel Cathrines Gade”.',
        '$ref': '#/definitions/Kode4'
      },
      'navn' : {
        description: 'Vejens navn som det er fastsat og registreret af kommunen. Repræsenteret ved indtil 40 tegn. Eksempel: ”Hvidkildevej”.',
        type: 'string',
        maxLength: 40
      },
      'kommune': {
        description: 'Kommunen som vejstykket er beliggende i.',
        $ref: '#/definitions/KommuneRef'
      },
      'postnumre': {
        description: 'Postnummrene som vejstykket er beliggende i.',
        type: 'array',
        items: {
          $ref: '#/definitions/PostnummerRef'
        }
      }
    },
    docOrder: ['href', 'kode', 'navn', 'kommune', 'postnumre']
  }),
  mapper: function (row, options) {
    return {
      href: makeHref(options.baseUrl, 'vejstykke', [row.kommunekode, row.kode]),
      kode: kode4String(row.kode),
      navn: row.vejnavn,
      kommune: mapKommuneRef({ kode: row.kommunekode, navn: row.kommunenavn}, options.baseUrl),
      postnumre: mapPostnummerRefArray(row.postnumre, options.baseUrl)
    };
  }
};

exports.postnummer = {
  schema: globalSchemaObject({
    'title': 'postnummer',
    'properties': {
      'href': {
        description: 'Postnummerets unikke URL.',
        '$ref': '#/definitions/Href'
      },
      'nr'      : {
        description: 'Unik identifikation af det postnummer som postnummeret er beliggende i. Postnumre fastsættes af Post Danmark. Repræsenteret ved fire cifre. Eksempel: ”2400” for ”København NV”.',
        '$ref': '#/definitions/Postnr'
      },
      'navn'    : {
        description: 'Det navn der er knyttet til postnummeret, typisk byens eller bydelens navn. Repræsenteret ved indtil 20 tegn. Eksempel: ”København NV”.',
        type: 'string',
        maxLength: 20
      },
      'version' : {
        '$ref': '#/definitions/DateTime'
      },
      'stormodtageradresse': {
        description: 'Hvis postnummeret er et stormodtagerpostnummer rummer feltet adressen på stormodtageren.',
        type: nullableType('string')
      },
      'kommuner': {
        description: 'De kommuner hvis areal overlapper postnumeret areal.',
        type: 'array',
        items: {
          '$ref': '#/definitions/KommuneRef'
        }
      }
    },
    'docOrder': ['href','nr', 'navn', 'version', 'stormodtageradresse', 'kommuner']
  }),
  mapper: function (row, options) {
    return {
      href: makeHref(options.baseUrl, 'postnummer', [row.nr]),
      nr:  kode4String(row.nr),
      navn: row.navn,
      version: row.version,
      stormodtageradresse: null,
      kommuner: mapKommuneRefArray(row.kommuner,options.baseUrl)
    };
  }
};

dagiTemaer.forEach(function(tema) {
  function dagiSchema(dagiTema) {
    return  {
      'title': dagiTema.singular,
      'properties': {
        'href': {
          description: dagiTema.singularSpecific + 's unikke URL.',
          $ref: '#/definitions/Href'
        },
        'kode': {
          description: 'Fircifret ' + dagiTema.singular + 'kode.',
          $ref: '#/definitions/Kode4'
        },
        'navn': {
          description: dagiTema + dagiTema.singularSpecific + 's navn.',
          type: 'string'
        }
      },
      'docOrder': ['href', 'kode', 'navn']
    };
  }

  exports[tema.singular] = {
    schema: globalSchemaObject(dagiSchema(tema)),
    mapper: commonMappers.dagiTemaJsonMapper(tema.plural)
  };
});

_.each(exports, function(rep) {
  rep.schema = schemaUtil.compileSchema(rep.schema);
});