"use strict";

var async = require('async');
var path = require('path');
var format = require('util').format;
var _ = require('underscore');

var datamodels = require('../crud/datamodel');
var sqlCommon = require('./common');

var psqlScript = sqlCommon.psqlScript;

function normaliseTableSpec(specs){
  return _.map(
    specs,
    function(spec){
      if (!spec.scriptFile){
        spec.scriptFile = spec.name+".sql";
      }
      if (!spec.type){
        spec.type = 'table';
      }
      return spec;
    });
}

// Note, the sequence of the tables matter!
exports.tableSpecs = normaliseTableSpec([
  {name: 'transaction_history'},
  {name: 'bbr_events'},
  {name: 'dagitemaer'},
  {name: 'vejstykker'},
  {name: 'postnumre'},
  {name: 'stormodtagere'},
  {name: 'adgangsadresser'},
  {name: 'enhedsadresser'},
  {name: 'vejstykkerpostnr',           scriptFile: 'vejstykker-postnr-view.sql', type: 'view'},
  {name: 'postnumremini',              scriptFile: 'postnumre-mini-view.sql',    type: 'view'},
  {name: 'vejstykkerview',             scriptFile: 'vejstykker-view.sql',        type: 'view'},
  {name: 'vejstykkerpostnumremat',     scriptFile: 'vejstykker-postnumre-view.sql'},
  {name: 'postnumre_kommunekoder_mat', scriptFile: 'postnumre-kommunekoder-mat.sql'},
  {name: 'supplerendebynavne',         scriptFile: 'supplerendebynavne-view.sql'},
  {name: 'adgangsadresserdagirel',     scriptFile: 'adgangsadresser-dagi-view.sql'},
  {name: 'griddeddagitemaer',          scriptFile: 'gridded-dagi-view.sql'},
  {name: 'adgangsadresserview',        scriptFile: 'adgangsadresser-view.sql',   type: 'view'},
  {name: 'adresser',                   scriptFile: 'adresse-view.sql',           type: 'view'},
  {name: 'wms_adgangsadresser', type: 'view'},
  {name: 'wfs_adgangsadresser', type: 'view'},
  {name: 'wfs_adresser', type: 'view'}
]);

exports.forAllTableSpecs = function(client, func, callback){
  async.eachSeries(
    exports.tableSpecs,
    function(spec, cb){
      func(client, spec, cb);
    },
    callback);
};

exports.disableTriggersAndInitializeTables = function(client) {
  return function(callback) {
    async.series([
      sqlCommon.disableTriggers(client),
      exports.initializeTables(client),
      sqlCommon.enableTriggers(client)
    ], callback);
  };
}

exports.initializeTables = function(client){
  return function(callback) {
    exports.forAllTableSpecs(client,
      function (client, spec, cb){
        if (spec.type !== 'view'){
          sqlCommon.execSQL("select "+spec.name+"_init()", client, true, cb);
        } else {
          cb();
        }
      },
      callback);
  };
};

exports.loadTables = function(client, scriptDir) {
  return function(callback) {
    console.log('creating tables');
    async.series([
      psqlScript(client, path.join(scriptDir, 'tables'), 'misc.sql'),
      function(callback) {
        exports.forAllTableSpecs(client,
          function(client, spec, callback) {
            if(spec.type !== 'view') {
              console.log("loading script tables/" + spec.scriptFile);
              return (psqlScript(client, path.join(scriptDir, 'tables'), spec.scriptFile))(callback);
            }
            else {
              return callback();
            }
          }, callback);
      }
    ],
      callback);
  };
};

/*
 * For each table that has a history table, generate a trigger to maintain it.
 * This is horrible, but generic code in plpgsql is even worse. Perhaps
 * plv8 would be an option?
 */
function createHistoryTriggers(client) {
  return function(callback) {
    var sql = _.reduce(['postnummer', 'vejstykke', 'adgangsadresse', 'adresse'], function(sql, datamodelName) {
      var datamodel = datamodels[datamodelName];
      var table = datamodel.table;
      sql += format('DROP FUNCTION IF EXISTS %s_history_update() CASCADE;\n', table);
      sql += format('CREATE OR REPLACE FUNCTION %s_history_update()\n', table);
      sql += 'RETURNS TRIGGER AS $$\n';
      sql += 'DECLARE\n';
      sql += 'seqnum integer;\n';
      sql += 'optype operation_type;\n';
      sql += "BEGIN\n";

      // we need to verify that one of the history fields have changed, not just the tsv- or geom columns
      var isNotDistinctCond = datamodel.columns.map(function(column) {
        return format("OLD.%s IS NOT DISTINCT FROM NEW.%s", column, column);
      }).join(" AND ");

      sql += format("IF TG_OP = 'UPDATE' AND (%s) THEN\n", isNotDistinctCond);
      sql += "RETURN NULL;\n";
      sql += "END IF;\n";


      sql += "seqnum = (SELECT COALESCE((SELECT MAX(sequence_number) FROM transaction_history), 0) + 1);\n";
      sql += "optype = lower(TG_OP);\n";

      // set valid_to on existing history row
      sql += "IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN\n";

      var keyClause = _.map(datamodel.key, function(keyColumn) {
        return keyColumn + ' = OLD.' + keyColumn;
      }).join(' AND ');

      sql += format("UPDATE %s_history SET valid_to = seqnum WHERE %s AND valid_to IS NULL;\n", table, keyClause);
      sql += "END IF;\n";

      // create the new history row
      sql += "IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN\n";
      sql += format("INSERT INTO %s_history(\n", table);
      sql += 'valid_from, ';
      sql += datamodel.columns.join(', ') + ')\n';
      sql += " VALUES (\n";
      sql += 'seqnum, ' + datamodel.columns.map(function(column) {
        return 'NEW.' + column;
      }).join(', ') + ");\n";
      sql += "END IF;\n";

      // add entry to transaction_history
      sql += format("INSERT INTO transaction_history(sequence_number, entity, operation) VALUES(seqnum, '%s', optype);", datamodel.name);
      sql += "RETURN NULL;\n";
      sql += "END;\n";
      sql += "$$ LANGUAGE PLPGSQL;\n";

      // create the trigger
      sql += format("CREATE TRIGGER %s_history_update AFTER INSERT OR UPDATE OR DELETE\n", table);
      sql += format("ON %s FOR EACH ROW EXECUTE PROCEDURE\n", table);
      sql += format("%s_history_update();\n", table);

      return sql;
    }, '');
    console.log(sql);
    client.query(sql, [], callback);
  };
}

exports.reloadDatabaseCode = function(client, scriptDir) {
  return function(callback) {
    console.log('loading database functions');
    async.series([
      psqlScript(client, scriptDir, 'misc.sql'),
      function(callback) {
        exports.forAllTableSpecs(client,
          function (client, spec, cb){
            console.log("loading script " + spec.scriptFile);
            return (psqlScript(client, scriptDir, spec.scriptFile))(cb);
          }, callback);
      },
      createHistoryTriggers(client)
    ], callback);
  };
};

exports.loadSchemas = function(client, scriptDir){
  return function(callback){
    async.series([
      exports.loadTables(client, scriptDir),
      exports.reloadDatabaseCode(client, scriptDir)
    ], callback);
  };
};
