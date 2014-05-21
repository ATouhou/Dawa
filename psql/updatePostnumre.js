"use strict";

// This script loads postnumre into the database from a CSV-file.

var util      = require('util');
var winston   = require('winston');
var csv       = require('csv');
var _         = require('underscore');
var Q = require('q');
var fs = require('fs');

var sqlCommon = require('./common');
var datamodels = require('../crud/datamodel');
var dataUtil = require('./dataUtil');
var divergensImpl = require('./divergensImpl');
var loadAdresseImpl = require('./load-adresse-data-impl');
var logger = require('../logger').forCategory('updatePostnumre');

var cliParameterParsing = require('../bbr/common/cliParameterParsing');
var optionSpec = {
  pgConnectionUrl: [false, 'URL som anvendes ved forbindelse til databasen', 'string']
};

var MAX_INT = 2147483647;

function loadPostnummerCsv(client, inputFile, tableName) {
  return function() {
    console.log('indlæser CSV');
    var stream = fs.createReadStream(inputFile);
    return Q.nfcall(loadAdresseImpl.loadCsv, client, stream, {
      tableName: tableName,
      transformer: function(row) {
        console.log('transforming ' + JSON.stringify(row));
        return {
          nr: row.postnr,
          navn: row.navn,
          stormodtager: row.stormodtager
        };
      },
      columns: ['nr', 'navn', 'stormodtager']
    });
  };
}

function createReport(client, inputFile) {
  var report = Q.nfcall(dataUtil.createTempTable, client, 'updated_postnumre', 'postnumre')
    .then(loadPostnummerCsv(client, inputFile, 'updated_postnumre'))
    .then(function() {
      console.log('Beregner forskel');
      return divergensImpl.computeTableDifferences(client, datamodels.postnummer, 'postnumre', 'updated_postnumre');
    });

  return report.then(function() {
    return Q.nfcall(dataUtil.dropTable,client, 'updated_postnumre');
  }).then(function() {
    return report;
  });
}

cliParameterParsing.main(optionSpec, _.keys(optionSpec), function(args, options) {
  var inputFile = args[0];
  var connString = options.pgConnectionUrl;
  sqlCommon.withWriteTransaction(connString, function(err, client, commit) {
    if(err) {
      throw err;
    }
    createReport(client, inputFile).then(function(report) {
      return divergensImpl.rectifyDifferences(client, datamodels.postnummer, report, MAX_INT);
    }).then(function() {
      return Q.nfcall(commit, null);
    }).then(function() {
      console.log('complete');
    }).done();
  });
});
