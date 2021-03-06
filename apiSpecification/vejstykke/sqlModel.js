"use strict";

const dbapi = require('../../dbapi');
var nameAndKey = require('./nameAndKey');
var sqlParameterImpl = require('../common/sql/sqlParameterImpl');
var parameters = require('./parameters');
var sqlUtil = require('../common/sql/sqlUtil');
var assembleSqlModel = sqlUtil.assembleSqlModel;
var selectIsoTimestamp = sqlUtil.selectIsoDate;

var columns = {
  kode: {
    column: 'vejstykker.kode'
  },
  kommunekode: {
    column: 'vejstykker.kommunekode'
  },
  oprettet: {
    select: selectIsoTimestamp('vejstykker.oprettet')
  },
  ændret: {
    select: selectIsoTimestamp('vejstykker.aendret')
  },
  kommunenavn: {
    select: "k.navn",
    where: null
  },
  navn: {
    column: 'vejstykker.vejnavn'
  },
  adresseringsnavn: {
    column: 'vejstykker.adresseringsnavn'
  },
  postnr: {
    select: null,
    where: function(sqlParts, parameterArray) {
      // this is a bit hackish, we add the parameters from
      // the parent query to the subquery to get
      // correct parameter indices for the subquery
      var subquery = {
        select: ["*"],
        from: ['vejstykkerpostnumremat'],
        whereClauses: ['vejstykkerpostnumremat.kommunekode = vejstykker.kommunekode', 'vejstykkerpostnumremat.vejkode = vejstykker.kode'],
        orderClauses: [],
        sqlParams: sqlParts.sqlParams
      };
      var propertyFilterFn = sqlParameterImpl.simplePropertyFilter([{
        name: 'postnr',
        multi: true
      }], {});
      propertyFilterFn(subquery, {postnr: parameterArray});
      var subquerySql = dbapi.createQuery(subquery).sql;
      sqlParts.whereClauses.push('EXISTS(' + subquerySql + ')');
    }
  },
  postnumre: {
    select: `(SELECT json_agg(CAST((p.nr, p.navn) AS PostnummerRef))
    FROM vejstykkerpostnumremat vp
    JOIN postnumre p ON vp.postnr = p.nr
    WHERE vp.kommunekode = vejstykker.kommunekode AND vp.vejkode = vejstykker.kode)`
  },
  tsv: {
    column: 'vejstykker.tsv'
  },
  geom_json: {
    select: function (sqlParts, sqlModel, params) {
      var sridAlias = dbapi.addSqlParameter(sqlParts, params.srid || 4326);
      return 'ST_AsGeoJSON(ST_Transform(vejstykker.geom,' + sridAlias + '::integer))';
    }
  }
};

const distanceParameterImpl = (sqlParts, params) => {
  // This is implemented with a JOIN
  // when using a subquery, PostgreSQL fails to utilize the spatial index
  // Probably a bug in PostgreSQL
  if (params.afstand !== undefined) {
    const kommunekodeAlias = dbapi.addSqlParameter(sqlParts, params.neighborkommunekode);
    const vejkodeAlias = dbapi.addSqlParameter(sqlParts, params.neighborkode);
    const afstandAlias = dbapi.addSqlParameter(sqlParts, params.afstand);
    sqlParts.from.push(`, vejstykker v2`);
    dbapi.addWhereClause(sqlParts, `\
v2.kommunekode = ${kommunekodeAlias} \
AND v2.kode = ${vejkodeAlias} \
AND ST_DWithin(vejstykker.geom, v2.geom, ${afstandAlias})
AND NOT (vejstykker.kommunekode = ${kommunekodeAlias} AND vejstykker.kode = ${vejkodeAlias})`);

  }
};

const regexParameterImpl = (sqlParts, params) => {
  if(params.regex) {
    const regexAlias = dbapi.addSqlParameter(sqlParts, params.regex);
    dbapi.addWhereClause(sqlParts, `vejnavn ~ ${regexAlias}`);
  }
};

function fuzzySearchParameterImpl(sqlParts, params) {
  if(params.fuzzyq) {
    var fuzzyqAlias = dbapi.addSqlParameter(sqlParts, params.fuzzyq);
    sqlParts.whereClauses.push("vejstykker.vejnavn IN (select distinct ON (vejnavn, dist) vejnavn from (SELECT vejnavn, vejnavn <-> " + fuzzyqAlias + " as dist from vejstykker ORDER BY dist LIMIT 1000) as v order by v.dist limit 100)");
    sqlParts.orderClauses.push("levenshtein(lower(vejnavn), lower(" + fuzzyqAlias + "), 2, 1, 3)");
  }
}


var parameterImpls = [
  sqlParameterImpl.simplePropertyFilter(parameters.propertyFilter, columns),
  sqlParameterImpl.search(columns),
  sqlParameterImpl.geomWithin('vejstykker.geom'),
  sqlParameterImpl.reverseGeocoding(),
  sqlParameterImpl.autocomplete(columns, ['navn']),
  distanceParameterImpl,
  regexParameterImpl,
  fuzzySearchParameterImpl,
  sqlParameterImpl.paging(columns, nameAndKey.key)
];

var baseQuery = function() {
  return {
    select: [],
    from: ['vejstykker' +
      " LEFT JOIN kommuner k ON (vejstykker.kommunekode = k.kode)"],
    whereClauses: [],
    orderClauses: [],
    sqlParams: []
  };
};

module.exports = sqlUtil.applyFallbackToFuzzySearch(assembleSqlModel(columns, parameterImpls, baseQuery));

var registry = require('../registry');
registry.add('vejstykke', 'sqlModel', undefined, module.exports);
