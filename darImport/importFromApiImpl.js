"use strict";

var moment = require('moment');
var _ = require('underscore');

var importDarImpl = require('./importDarImpl');
var logger = require('../logger').forCategory('darImport');
var qUtil = require('../q-util');
var defaultDarClient = require('./darClient');

var defaultOptions = {
  /**
   * The maximum duration a BBR transaction may take. If any transaction is in progress,
   * we know that the data will be visible at most this duration later.
   */
  maxDarTxDuration: moment.duration(60, 'seconds'),
  /**
   * The maximum number of records DAR will return in one request. DAR guarantees that no transaction
   * will generate more than this number of records.
   */
  maxReturnedRecords: 10000,
  darClient: defaultDarClient
};

module.exports = function(opt) {
  var options = _.defaults({}, opt, defaultOptions);
  var getPage = options.darClient.getPage;
  var maxReturnedRecords = options.maxReturnedRecords;
  var maxDarTxDuration = options.maxDarTxDuration;

  var rowKey = function(row) {
    // we ensure that rows with registreringslut is first, so
    // it is the one that remains when we use uniq afterwards.
    return row.versionid + '-' + (row.registreringslut ? 'A' : 'B');
  };

  function mergeResults(result, page) {
    var unsorted = result.concat(page);
    var sorted = unsorted.sort(function(a, b) {
      return rowKey(a).localeCompare(rowKey(b));
    });
    var unique = _.uniq(sorted, true, function(row) {
      return row.versionid;
    });

    return unique;
  }

  function getTimestamp(item) {
    if(item.registreringslut) {
      return moment(item.registreringslut);
    }
    else {
      return moment(item.registreringstart);
    }
  }

  function allHasSameTimestamp(page) {
    if(page.length === 0) {
      return false;
    }
    var ts = getTimestamp(page[0]);
    return _.every(page, function(item) {
      return getTimestamp(item).isSame(ts);
    });
  }

  /**
   * Get all records with timestamp greater or equal to tsFrom.
   * Return an array of records ordered by versionid
   * @param baseUrl
   * @param entityName
   * @param tsFrom
   */
  function getRecordsSince(baseUrl, entityName, tsFrom, tsTo) {
    return getPage(baseUrl, entityName, tsFrom, tsTo).then(function(page) {
      var result = page;
      return qUtil.awhile(
        function() { return page.length >= maxReturnedRecords; },
        function() {
          var maxPageTs = _.reduce(page, function(memo, item) {
            var ts = getTimestamp(item);
            if(memo.isBefore(ts)) {
              return ts;
            }
            else {
              return memo;
            }
          }, getTimestamp(page[0]));
          // DAR guarantees that at most 10K items will have same timestamp.
          // This is neccessary because we do paging using timestamps.
          // If more than 10K items have same timestamp, and we
          // can only get 10K items, then we cannot get them all.
          if(allHasSameTimestamp(page)) {
            logger.error('Received a page with 10000 items with equal timestamp.' +
            ' This will result in lost records.', {
              entityName: entityName,
              tsFrom: tsFrom.toISOString(),
              tsTo: tsTo.toISOString(),
              recordTimestamp: page[0].registreringstart
            });
            tsFrom = maxPageTs.add(moment.duration(1));
          }
          else {
            tsFrom = maxPageTs;
          }
          return getPage(baseUrl, entityName, tsFrom, tsTo).then(function(_page) {
            page = _page;
            result = mergeResults(result, page);
            return result;
          });
        })
        .then(function() {
          return result;
        });
    });
  }

  /**
   * Fetch each entity type from API.
   * @param baseUrl
   * @param tsFrom Fetch rows time timestamp >= this value
   * @param Fetch rows with timestamp less than or equal this value.
   * @returns A map, where key is the entity type and value is an array of rows fetched from the
   * API
   */
  function fetch(baseUrl, tsFrom, tsTo) {
    return qUtil.reduce(['adgangspunkt', 'husnummer', 'adresse'], function(memo, entityName) {
      return getRecordsSince(baseUrl, entityName, tsFrom, tsTo).then(function(result) {
        memo[entityName] = result;
        return memo;
      });
    }, {});
  }

  /**
   * Repeatedly fetch all changed records from API, ontil two succeeding fetches gives the same result.
   * This is neccesary to ensure that we do not fetch a partial transaction from the API.
   * NOTE: Because of transactions in progress, additional records may appear later.
   * @param baseUrl
   * @param resultSet
   * @param tsFrom
   * @param tsTo
   * @returns {*}
   */
  function fetchUntilStable(baseUrl, resultSet, tsFrom, tsTo, report) {
    function countResults(resultSet) {
      return Object.keys(resultSet).reduce(function(memo, entityName) {
        return memo + resultSet[entityName].length;
      }, 0);
    }
    if(!resultSet) {
      return fetch(baseUrl, tsFrom, tsTo).then(function(resultSet) {
        return fetchUntilStable(baseUrl, resultSet, tsFrom, tsTo, report);
      });
    }
    if(countResults(resultSet) === 0) {
      // no results, no need to check for changes
      return resultSet;
    }
    // If we get some results, we fetch again to ensure that we
    // did not receive a partial transaction
    return fetch(baseUrl, tsFrom, tsTo).then(function(secondResult) {
      if(countResults(resultSet) === countResults(secondResult)) {
        if(report) {
          report.fetchUntilStable = {
            adgangspunktCount: secondResult.adgangspunkt.length,
            husnummerCount: secondResult.husnummer.length,
            adresseCount: secondResult.adresse.length
          };
        }
        return secondResult;
      }
      else {
        return fetchUntilStable(baseUrl, secondResult, tsFrom, tsTo, report);
      }
    });
  }

  function getLastFetched(client) {
    return client.queryp('SELECT lastfetched FROM dar_lastfetched', []).then(function(result) {
      if(result.rows && result.rows[0] && result.rows[0].lastfetched) {
        return moment(result.rows[0].lastfetched);
      }
      return null;
    });
  }

  function setLastFetched(client, timestamp) {
    return client.queryp('UPDATE dar_lastfetched SET lastfetched = $1', [timestamp]);
  }

  function getLastSeenTs(client) {
    return client.queryp('SELECT GREATEST(' +
    '(SELECT max(coalesce(upper(registrering), lower(registrering))) from dar_adgangspunkt), ' +
    '(SELECT max(coalesce(upper(registrering), lower(registrering))) from dar_husnummer),' +
    '(SELECT max(coalesce(upper(registrering), lower(registrering))) from dar_adresse)) as lastseen',[]).then(function(result) {
      if(result.rows && result.rows.length > 0) {
        return moment(result.rows[0].lastseen);
      }
      return null;
    });
  }

  function splitInTransactions(changeset, tsFrom) {
    // Look for rows witch has been both created and expired in the same batch, and
    // create a record for the creation. If we do not do this,
    // we will never see the address in DAWA.
    changeset = _.reduce(changeset, function(memo, rows, entityName) {
      var result = _.clone(rows);
      rows.forEach(function(row) {
        if(row.registreringslut &&
          !tsFrom.isAfter(moment(row.registreringstart))) {
          var creationRow = _.clone(row);
          creationRow.registreringslut = null;
          result.push(creationRow);
        }
      });
      memo[entityName] = result;
      return memo;
    }, {});
    var groupedChangeset = _.reduce(changeset, function(memo, rows, entityName) {
      memo[entityName] = _.groupBy(rows, function(row) {
        return row.registreringslut || row.registreringstart;
      });
      return memo;
    }, {});
    var transactionTimestamps = _.reduce(groupedChangeset, function(memo, entityTimestampMap) {
      return _.union(memo, Object.keys(entityTimestampMap));
    }, []).sort();
    return transactionTimestamps.map(function(timestamp) {
      return Object.keys(changeset).reduce(function(memo, entityName) {
        memo[entityName] = groupedChangeset[entityName][timestamp] || [];
        return memo;
      }, {});
    });
  }

  function transactionAlreadyPerformed(client, rowMap) {
    var entityWithRows = _.find(Object.keys(rowMap), function(entityName) {
      return rowMap[entityName].length > 0;
    });
    var row = rowMap[entityWithRows][0];
    var expired = !!row.registreringslut;
    var sql = 'SELECT EXISTS(SELECT * FROM dar_' + entityWithRows + ' WHERE versionid=$1';
    if(expired) {
      sql += ' AND NOT upper_inf(registrering)';
    }
    sql += ') as performed';
    return client.queryp(sql, [row.versionid]).then(function(result) {
      return result.rows[0].performed;
    });
  }

  function importFromApi(db, url, report) {
    var tsFrom, tsTo;
    var lastFetchedTs;
    return db.withTransaction('READ_ONLY', function (client) {
      return getLastFetched(client)
        .then(function (lastFetched) {
          if (!lastFetched) {
            return getLastSeenTs(client);
          }
          else {
            return lastFetched;
          }
        })
        .then(function (_lastFetchedTs) {
          lastFetchedTs = _lastFetchedTs;
        }
      );
    })
      .then(function() {
        if (!lastFetchedTs) {
          tsFrom = moment.unix(0);
        }
        else {
          tsFrom = lastFetchedTs;
        }
        tsTo = moment();
        return fetchUntilStable(url, null, tsFrom, tsTo, report);
      })
      .then(function (resultSet) {
        if (resultSet.adgangspunkt.length + resultSet.husnummer.length + resultSet.adresse.length === 0) {
          logger.info('No new records on API', {
            tsFrom: tsFrom.toISOString(),
            tsTo: tsTo.toISOString()
          });
          return;
        }
        else {
          return qUtil.mapSerial(splitInTransactions(resultSet, tsFrom), function(transactionSet) {
            return db.withTransaction('READ_WRITE', function(client) {
              return transactionAlreadyPerformed(client, transactionSet)
                .then(function(transactionPerformed) {
                  if(transactionPerformed) {
                    return;
                  }
                  else {
                    var someRow =_.find(transactionSet, function(rows) {
                      return rows.length > 0;
                    })[0];
                    var txTimestamp = someRow.registreringslut || someRow.registreringstart;
                    report['tx_' +txTimestamp] = {};
                    return importDarImpl.withDarTransaction(client, 'api', function() {
                      return importDarImpl.applyDarChanges(client, transactionSet, report['tx_' +txTimestamp]);
                    });
                  }
                });
            });
          });
        }
      }).then(function () {
        return db.withTransaction('READ_WRITE', function(client) {
          return setLastFetched(client, tsTo.subtract(maxDarTxDuration));
        });
      });
  }

  return {
    importFromApi: importFromApi,
    internal: {
      fetchUntilStable: fetchUntilStable,
      splitInTransactions: splitInTransactions
    }
  };
};
