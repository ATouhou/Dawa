"use strict";

var async = require('async');
var csv = require('csv');
var copyFrom = require('pg-copy-streams').from;
var Iconv  = require('iconv').Iconv;
var fs = require('fs');
var zlib = require('zlib');
var _ = require('underscore');

var sqlCommon = require('./common');
var bbrFieldMappings = require('../bbr/common/fieldMappings');

function loadCsv(client, inputStream, options, callback) {
  var sql = "COPY " + options.tableName + "(" + options.columns.join(',') + ") FROM STDIN WITH (ENCODING 'utf8',HEADER TRUE, FORMAT csv, DELIMITER ';', QUOTE '\"')";
  console.log("executing sql %s", sql);
  var pgStream = client.query(copyFrom(sql));

  csv().from.stream(inputStream, {
    delimiter: ';',
    quote: '"',
    escape: '\\',
    columns: true,
    encoding: 'utf8'
  }).transform(options.transformer).to(pgStream, {
      delimiter: ';',
      quote: '"',
      escape: '\\',
      columns: options.columns,
      header: true,
      encoding: 'utf8'
    }).on('error', function (error) {
      callback(error);
    });


  pgStream.on('end', callback);
}

var legacyTransformers = {
  postnummer: function(row, idx) {
    console.log(JSON.stringify(row));
    if(idx % 100 === 0) {
      console.log(idx + ", " + row.PostCodeIdentifier);
    }
    var result = {
      nr: row.PostCodeIdentifier,
      navn: row.DistrictName,
      stormodtager: 0
    };
    console.log(JSON.stringify(result));
    return  result;
  },
  vejstykke: function(row, idx) {
    if(idx % 1000 === 0) {
      console.log(idx);
    }
    return {
      kode : row.StreetCode,
      kommunekode: row.MunicipalityCode,
      vejnavn : row.StreetName,
      adresseringsnavn: null
    };
  },
  enhedsadresse: function(row, idx) {
    if(idx % 1000 === 0) {
      console.log(idx);
    }
    return {
      id : row.AddressSpecificIdentifier,
      adgangsadresseid : row.AddressAccessReference,
      oprettet : row.AddressSpecificCreateDate,
      aendret : row.AddressSpecificChangeDate,
      etage : row.FloorIdentifier,
      doer : row.SuiteIdentifier
    };
  },
  adgangsadresse: function(row, idx) {
    if(idx % 1000 === 0) {
      console.log(idx);
    }
    return {
      id: row.AddressAccessIdentifier,
      vejkode: row.StreetCode,
      kommunekode: row.MunicipalityCode,
      husnr: row.StreetBuildingIdentifier,
      supplerendebynavn: row.DistrictSubdivisionIdentifier,
      postnr: row.PostCodeIdentifier,
      ejerlavkode: row.CadastralDistrictIdentifier,
      ejerlavnavn: row.CadastralDistrictName,
      matrikelnr: row.LandParcelIdentifier,
      esrejendomsnr: row.MunicipalRealPropertyIdentifier,
      oprettet: row.AddressAccessCreateDate,
      ikraftfra: row.AddressAccessValidDate,
      aendret: row.AddressAccessChangeDate,
      etrs89oest: row.ETRS89utm32Easting,
      etrs89nord: row.ETRS89utm32Northing,
      wgs84lat: row.WGS84GeographicLatitude,
      wgs84long: row.WGS84GeographicLongitude,
      noejagtighed: row.AddressCoordinateQualityClassCode,
      kilde: row.AddressGeometrySourceCode,
      tekniskstandard: row.AddressCoordinateTechnicalStandardCode,
      tekstretning: row.AddressTextAngleMeasure,
      kn100mdk: row.GeometryDDKNcell100mText,
      kn1kmdk: row.GeometryDDKNcell1kmText,
      kn10kmdk: row.GeometryDDKNcell10kmText,
      adressepunktaendringsdato: row.AddressPointRevisionDateTime
    };
  }
};

function transformBbr(fieldMapping) {
  var mapping = _.invert(fieldMapping);
  return function(row) {
    return _.reduce(row, function(memo, value, key) {
      if(value === 'null') {
        value = null;
      }
      memo[mapping[key] || key] = value;
      return memo;
    }, {});
  };
}

var transformBbrAdgangsadresse = transformBbr(bbrFieldMappings.adgangsadresse);
var transformEnhedsadresse = transformBbr(bbrFieldMappings.enhedsadresse);
function removePrefixZeroes(str) {
  while (str && str.charAt(0) === '0') {
    str = str.substring(1);
  }
  return str;
}

var bbrTransformers = {
  postnummer: function(row) {
    var result = transformBbr(bbrFieldMappings.postnummer)(row);
    result.stormodtager = 0;
    return result;
  },
  vejstykke: transformBbr(bbrFieldMappings.vejstykke),
  enhedsadresse: function(row) {
    var result = transformEnhedsadresse(row);
    if(!_.isUndefined(result.etage) && !_.isNull(result.etage)) {
      result.etage = removePrefixZeroes(result.etage);
      result.etage = result.etage.toLowerCase();
    }
    if(!_.isUndefined(result.doer) && !_.isNull(result.doer)) {
      result.doer = result.doer.toLowerCase();
    }
    return result;
  },
  adgangsadresse: function(row) {
    var result = transformBbrAdgangsadresse(row);
    // vi skal lige have fjernet de foranstillede 0'er
    result.husnr = removePrefixZeroes(result.husnr);
    return result;
  }
};

var bbrFileNames = {
  vejstykke: 'Vejnavn.CSV',
  adgangsadresse: 'Adgangsadresse.CSV',
  enhedsadresse: 'Enhedsadresse.CSV',
  postnummer: 'Postnummer.CSV'
};

var legacyFileNames = {
  vejstykke: 'RoadName.csv.gz',
  adgangsadresse: 'AddressAccess.csv.gz',
  enhedsadresse: 'AddressSpecific.csv.gz',
  postnummer: 'PostCode.csv.gz'
};

var bbrFileStreams = function(dataDir, filePrefix, encoding) {
  return _.reduce(bbrFileNames, function(memo, filename, key) {
    memo[key] = function() {
      var stream = fs.createReadStream(dataDir + '/' + filePrefix + filename);
      if(encoding && encoding !== 'UTF-8') {
        return stream.pipe(new Iconv(encoding, 'UTF-8'));
      }
      return stream;
    };
    return memo;
  }, {});
};

var legacyFileStreams = function(dataDir) {
  return _.reduce(legacyFileNames, function(memo, filename, key) {
    memo[key] = function() {
      var stream = fs.createReadStream(dataDir +'/' + filename);
      var unzipped = stream.pipe(zlib.createGunzip());
      unzipped.setEncoding('utf8');
      return unzipped;
    };
    return memo;
  }, {});
};

function loadAdditionalBbrFiles(client, callback) {
  callback();
}

exports.loadCsvOnly = function(client, options, callback) {
  var format = options.format;
  var dataDir = options.dataDir;
  var filePrefix = options.filePrefix || '';
  var encoding = options.encoding;
  var tablePrefix = options.tablePrefix || '';

  var transformers = format === 'legacy' ? legacyTransformers : bbrTransformers;
  var fileStreams = format == 'legacy' ? legacyFileStreams(dataDir) : bbrFileStreams(dataDir, filePrefix, encoding);
  async.series([
    function(callback) {
      console.log("Indlæser postnumre....");
      var postnumreStream = fileStreams.postnummer();
      loadCsv(client, postnumreStream, {
        tableName : tablePrefix + 'Postnumre',
        columns : ['nr', 'navn', 'stormodtager'],
        transformer: transformers.postnummer
      }, callback);
    },
    function(callback) {
      console.log("Indlæser vejstykker....");
      var vejstykkerStream = fileStreams.vejstykke();
      loadCsv(client, vejstykkerStream, {
        tableName : tablePrefix + 'Vejstykker',
        columns : ['kode', 'kommunekode', 'vejnavn'],
        transformer: transformers.vejstykke

      }, callback);
    },
    function(callback) {
      console.log("Indlæser adgangsadresser....");
      var adgangsAdresserStream = fileStreams.adgangsadresse();
      loadCsv(client, adgangsAdresserStream, {
        tableName : tablePrefix + 'Adgangsadresser',
        columns : ['id', 'vejkode', 'kommunekode',
          'husnr', 'supplerendebynavn',
          'postnr', 'ejerlavkode', 'ejerlavnavn', 'matrikelnr', 'esrejendomsnr',
          'oprettet', 'ikraftfra', 'aendret', 'etrs89oest', 'etrs89nord', 'wgs84lat', 'wgs84long',
          'noejagtighed', 'kilde', 'tekniskstandard', 'tekstretning', 'kn100mdk', 'kn1kmdk', 'kn10kmdk', 'adressepunktaendringsdato'],
        transformer: transformers.adgangsadresse

      }, callback);
    },
    function(callback) {
      console.log("Indlæser enhedsadresser....");
      var enhedsadresserStream = fileStreams.enhedsadresse();
      loadCsv(client, enhedsadresserStream, {
        tableName : tablePrefix + 'Enhedsadresser',
        columns : ['id', 'adgangsadresseid', 'oprettet', 'aendret', 'ikraftfra', 'etage', 'doer'],
        transformer: transformers.enhedsadresse

      }, callback);
    },
    function(callback) {
      if(format === 'bbr') {
        loadAdditionalBbrFiles(client, callback);
      }
      else {
        callback();
      }
    }
  ], callback);
};

exports.load = function(client, options, callback) {

  async.series([
    sqlCommon.disableTriggers(client),
    function(cb) {
      exports.loadCsvOnly(client, options, cb);
    },
    sqlCommon.psqlScript(client, __dirname, 'initialize-history.sql'),
    sqlCommon.initializeTables(client),
    sqlCommon.enableTriggers(client)
  ], callback);
};