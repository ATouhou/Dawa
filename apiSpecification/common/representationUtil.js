"use strict";

var dagiTemaer = require('../dagitemaer/dagiTemaer');
var _ = require('underscore');

var kode4String = require('../util').kode4String;

/*
 * Computes the list of fields that should be included in the CSV representation for the given type
 */
exports.flatCandidateFields = function(fields) {
  return fields.filter(function(field) {
    return !field.multi && field.selectable;
  });
};

exports.fieldsWithNames = function(fields, names) {
  return _.filter(fields, function(field) {
    return _.contains(names,field.name);
  });
};

exports.fieldsWithoutNames = function(fields, names) {
  return _.reject(fields, function(field) {
    return _.contains(names, field.name);
  });
};

exports.defaultFlatMapper = function(flatFields) {
  return function(row) {
    return _.reduce(flatFields, function(memo, field) {
      var modelValue = row[field.name];
      var formattedValue;
      if(field.formatter) {
        formattedValue = field.formatter(modelValue);
      }
      else {
        formattedValue = modelValue;
      }
      memo[field.name] = formattedValue;
      return memo;
    }, {});
  };
};

exports.defaultFlatRepresentation = function(fields) {
  var flatFields = exports.flatCandidateFields(fields);
  return {
    fields: flatFields,
    outputFields: _.pluck(flatFields, 'name'),
    mapper: function (baseUrl, params) {
      return exports.defaultFlatMapper(flatFields);
    }
  };
};

exports.geojsonRepresentation = function(geomJsonField, flatRepresentation) {
  return {
    fields: flatRepresentation.fields.concat([geomJsonField]),
    mapper: function(baseUrl, params, singleResult) {
      var flatMapper = flatRepresentation.mapper(baseUrl, params, singleResult);
      return function(row) {
        var result = {};
        result.type = 'Feature';
        if (row.geom_json) {
          result.geometry = JSON.parse(row.geom_json);
        }
        if (singleResult) {
          result.crs = {
            type: 'name',
            properties: {
              name: 'EPSG:' + (params.srid || 4326)
            }
          };
        }
        result.properties = flatMapper(row);
        return result;
      };
    }
  };
};

exports.adresseFlatRepresentation = function(fields) {
  var fieldsExcludedFromFlat = ['geom_json'];
  var defaultFlatFields = exports.fieldsWithoutNames(exports.flatCandidateFields(fields), fieldsExcludedFromFlat);

  var requiredFlatFields = defaultFlatFields.concat(_.where(fields, {name: 'dagitemaer'}));


  var includedDagiTemaer = ['region', 'sogn', 'politikreds', 'retskreds', 'opstillingskreds'];
  var dagiTemaMap = _.indexBy(dagiTemaer, 'singular');
  var outputFlatFields = _.reduce(includedDagiTemaer, function (memo, temaNavn) {
    memo.push(dagiTemaMap[temaNavn].prefix + 'kode');
    memo.push(dagiTemaMap[temaNavn].prefix + 'navn');
    return memo;
  }, _.pluck(defaultFlatFields, 'name'));

  var defaultFlatMapper = exports.defaultFlatMapper(defaultFlatFields);

  var flatRepresentation = {
    fields: requiredFlatFields,
    outputFields: outputFlatFields,
    mapper: function () {
      return function (obj) {
        var result = defaultFlatMapper(obj);
        includedDagiTemaer.forEach(function (temaNavn) {
          var tema = _.findWhere(obj.dagitemaer, { tema: temaNavn});
          if (tema) {
            result[dagiTemaMap[temaNavn].prefix + 'kode'] = kode4String(tema.kode);
            result[dagiTemaMap[temaNavn].prefix + 'navn'] = tema.navn;
          }
        });
        return result;
      };
    }
  };
  return flatRepresentation;
};