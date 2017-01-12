"use strict";
/* eslint no-console: 0 */
/* eslint no-constant-condition: 0 */

const csvStringify = require('csv-stringify');
const fs = require('fs');
const url = require('url');
const http = require('http');
const q = require('q');
const _ = require('underscore');

var cliParameterParsing = require('../bbr/common/cliParameterParsing');

const PSQL_CSV_OPTIONS = {
  delimiter: ';',
  quote: '"',
  escape: '\\',
  header: true,
  encoding: 'utf8'
};

const LOG_COLUMNS = ['ts', 'name', 'key', 'value'];

const csvLogger = filePath => {
  const csvTransform =  csvStringify(_.extend({columns: LOG_COLUMNS}, PSQL_CSV_OPTIONS));
  const fileStream = fs.createWriteStream(filePath);
  csvTransform.pipe(fileStream);
  return data => {
    csvTransform.write(data);
  };
};

let concurrency = 0;

const performRequest = (options) => {
  return q.Promise((resolve, reject) => {
    const before = Date.now();
    let byteCount = 0;
    concurrency++;
    http.get(Object.assign(options, {
      headers: {
        "X-Forwarded-For": "1.2.3.4"
      }
    }), res => {
      res.on('data', chunk => {
        byteCount += chunk.byteLength;
      });
      res.on('error', err => {
        reject(err);
        concurrency--;
      });
      res.on('end', () => {
        concurrency--;
        resolve({
          duration: Date.now() - before,
          byteCount: byteCount
        });
      });
    });
  });
};


const launchSingleRequestGenerator = (baseUrl, spec) => {
  const stringUrl = _.isFunction(spec.url) ? spec.url() : spec.url;
  const parsedUrl = url.parse(url.resolve(baseUrl, stringUrl));

  return performRequest(parsedUrl);
};

const launchGetRepeatedlyGenerator = (baseUrl, spec) => {
  return q.async(function*() {
    while(true) {
      yield launchSingleRequestGenerator(baseUrl, spec);
    }
  })();
};

const lauchfixedConcurrencyGenerator = (baseUrl, spec)  => {
  return q.async(function*() {
    for(let i = 0; i < spec.concurrency; ++i) {
      launchGetRepeatedlyGenerator(baseUrl, spec);
      yield q.delay(spec.rampUpDelay);
    }
  })();
};

const launchFixedRpsGenerator = (baseUrl, spec, log) => {
  setInterval(() => {
    launchSingleRequestGenerator(baseUrl, spec).then(result => {
      log({
        ts: Date.now(),
        name: 'FixedRps',
        key: 'duration',
        value: result.duration
      });
    });
  }, 1000 / spec.max);
};


const generatorTypeMap = {
  fixedConcurrency: lauchfixedConcurrencyGenerator,
  fixedRps: launchFixedRpsGenerator
};

var optionSpec = {
  baseUrl: [false, 'URL på dawa service', 'string', 'http://127.0.0.1:3000'],
  logfile: [false, 'Logfil', 'string', 'log.csv'],
  generators: [false, 'JS-fil med generators', 'string']
};


cliParameterParsing.main(optionSpec, Object.keys(optionSpec), function(args, options) {
  const baseUrl = options.baseUrl;
  const logger = csvLogger(options.logfile);
  const generators = require(options.generators);
  for(let generator of generators) {
    const launchFn = generatorTypeMap[generator.type];
    launchFn(baseUrl, generator, logger);
  }

  setInterval(() => {
    console.log('concurrency: ' + concurrency);
  }, 1000);
});
