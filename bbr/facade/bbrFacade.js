"use strict";

//var https        = require('https');
var express        = require('express');
var winston        = require('winston');
var expressWinston = require('express-winston');
var _              = require('underscore');
var ZSchema        = require("z-schema");
var AWS            = require('aws-sdk');
var async = require('async');
var dynamoEvents = require('./../common/dynamoEvents');
var eventSchemas = require('./../common/eventSchemas');
var cli = require('cli');
var cliParameterParsing = require('../common/cliParameterParsing');

var optionSpec = {
  awsRegion: [false, 'AWS region, hvor Dynamo databasen befinder sig', 'string', 'eu-west-1'],
  awsAccessKeyId: [false, 'Access key der anvendes for at tilgå Dynamo', 'string'],
  awsSecretAccessKey: [false, 'Secret der anvendes for at tilgå Dynamo', 'string'],
  dynamoTable: [false, 'Navn på dynamo table hvori hændelserne gemmes', 'string'],
  listenPort: [false, 'TCP port hvor der tages imod hændelser fra BBR via HTTP kald', 'number', 3333]
};

cli.parse(optionSpec, []);

cli.main(function(args, options) {
  cliParameterParsing.addEnvironmentOptions(optionSpec, options);
  cliParameterParsing.checkRequiredOptions(options, _.keys(optionSpec));

  /********************************************************************************
   ***** Setup *********************************************************************
   ********************************************************************************/

  var dd = new AWS.DynamoDB({apiVersion      : '2012-08-10',
    region          : options.awsRegion,
    accessKeyId     : options.awsAccessKeyId,
    secretAccessKey : options.awsSecretAccessKey});

  var TABLENAME = options.dynamoTable;
  var listenPort = options.listenPort;

  var logglyOptions = {subdomain        : 'dawa',
    inputToken       : process.env.DAWALOGGLY,
    json             : true,
    handleExceptions : true};

  var app = express();
  setupLogging(app);
  app.use(express.compress());
  app.use(express.bodyParser());


  /********************************************************************************
   ***** Routes ********************************************************************
   ********************************************************************************/

  app.get('/', function (req, res) {
    res.send("<h4>Dette er AWS endepunktet for BBR hændelser</h4>"+
      "Brug HTTP POST /haendelse for at afgive en hændelse.<br>"+
      'Mere dokumentation kan findes på '+
      '<a href="https://github.com/DanmarksAdresser/Dawa/tree/master/bbr-facade/doc">'+
      'github.com/DanmarksAdresser/Dawa/tree/master/bbr-facade/doc</a><br>'+
      'Se sekvensnummeret for sidste hændelse her: <a href="/sidsteSekvensnummer">/sidsteSekvensnummer</a>');
  });

// Can be used for monitoring
  app.get('/sidsteSekvensnummer', function (req, res) {
    dynamoEvents.getLatest(dd, TABLENAME, function(error, latest){
      if (error)
      {
        winston.error('DynamoDB query ERROR: %j %j', error, latest, {});
        res.send(500, error);
      }
      else
      {
        if (latest.Items.length > 0)
        {
          res.send(""+latest.Items[0].seqnr.N);
        }
        else
        {
          res.send("0");
        }
      }
    });
  });

  function validateAndStore(haendelse, res, latest) {
    validateSchema(
      haendelse,
      function (error) {
        if (error) {
          winston.info(error);
          res.send(400, error);
        }
        else {
          validateSequenceNumber(haendelse, latest, function (error, exists, seqNr) {
            if (error) {
              winston.info(error);
              res.send(400, error);
            }
            else {
              if (exists) {
                res.send('Hændelse modtaget med sekvensnummer=' + seqNr);
              }
              else {
                dynamoEvents.putItem(dd, TABLENAME, seqNr, haendelse,
                  function (error, data) {
                    if (error) {
                      winston.error('DynamoDB put ERROR: %j %j', error, data, {});
                      res.send(500, error);
                    }
                    else {
                      res.send('Hændelse modtaget med sekvensnummer=' + seqNr);
                    }
                  });
              }
            }
          });
        }
      });
  }
  app.post('/haendelse', function (req, res) {
    var haendelse = req.body;
    winston.info('Received haendelse: %j', haendelse, {});
    async.waterfall([
    ], function(err) {

    });
    dynamoEvents.getLatest(dd, TABLENAME, function(error, latest){
      if (error)
      {
        winston.error('DynamoDB query ERROR: %j %j', error, latest, {});
        res.send(500, error);
      }
      else
      {
        winston.info('DynamoDB query latest: %j %j', error, latest, {});
        validateAndStore(haendelse, res, latest);
      }
    });
  });

  function validateSequenceNumber(haendelse, latest, cb){
    var newSeqNr = parseInt(haendelse.sekvensnummer);
    var len = latest.Items.length;
    var lastSeqNr = parseInt(len > 0 ? latest.Items[0].seqnr.N : '0');
    if (lastSeqNr === newSeqNr)
    {
      var lastJson = JSON.parse(latest.Items[0].data.S);
      if (_.isEqual(haendelse, lastJson))
      {
        cb(null, true, newSeqNr);
      }
      else
      {
        cb({type: 'InputError',
          title: 'Sequence number already known, but event differs',
          details: {text: 'The sequence number exists, but the given event differs from the '+
            'existing event. Resending of events are allowed, but not changing'+
            'already send events.',
            sequenceNumber: lastSeqNr,
            existingEvent: lastJson,
            givenEvent: haendelse}});
      }
    }
    else
    {
      if (len === 0 || newSeqNr === (lastSeqNr+1))
      {
        cb(null, false, newSeqNr);
      }
      else
      {
        cb({type: 'InputError',
          title: 'Illegal sequence number',
          details: {text: 'The given sequence number do not match the expected',
            currentSequenceNumber: lastSeqNr,
            expectedSequenceNumber: lastSeqNr + 1,
            givenSequenceNumber: newSeqNr,
            givenEvent: haendelse}});
      }
    }
  }

  /*******************************************************************************
   **** Some more setup. Have to be after the routes ******************************
   *******************************************************************************/

  app.use(expressWinston.errorLogger({transports: expressLogTransports()}));

  app.listen(listenPort);
//https.createServer(app).listen(listenPort);

  winston.info("Express server listening on port %d in %s mode", listenPort, app.settings.env);


  /*******************************************************************************
   **** Helper functions **********************************************************
   *******************************************************************************/

  function setupLogging(app){
    require('winston-loggly');
    if (process.env.DAWALOGGLY){
      winston.add(winston.transports.Loggly, logglyOptions);
      winston.info("Production mode. Setting up Loggly logging %s", process.env.DAWALOGGLY);
    }
    app.use(expressWinston.logger({transports: expressLogTransports()}));
    winston.handleExceptions(new winston.transports.Console());
  }

  function expressLogTransports(){
    var transports = [];
    if (process.env.DAWALOGGLY){
      transports.push(new winston.transports.Loggly(logglyOptions));
    }
    transports.push(new winston.transports.Console());
    return transports;
  }

  var validator = new ZSchema({ sync: true });
  function validateSchema(json, cb){
    var validate = function(schema){
      if (!validator.validate(json, schema)) {
        throw validator.getLastError();
      }
    };

    try {
      switch (json.type) {
        case 'enhedsadresse'     : validate(eventSchemas.enhedsadresse)     ; break;
        case 'vejnavn'           : validate(eventSchemas.vejnavn)          ; break;
        case 'supplerendebynavn' : validate(eventSchemas.supplerendebynavn) ; break;
        case 'postnummer' : validate(eventSchemas.postnummer); break;
        case 'postnummertilknytning' : validate(eventSchemas.postnummertilknytning) ; break;
        case 'adgangsadresse'    : validate(eventSchemas.adgangsadresse)    ; break;
        default:
          return cb({type: 'ValidationError',
            title: 'Unknown event type',
            details: 'Unknown event type: '+json.type});
      }
    }
    catch (error){
      if (validator.getLastError().valid === true){
        return cb();
      } else {
        return cb({type: 'ValidationError',
          title: 'Schema validation error',
          details: validator.getLastError()});
      }
    }
    return cb();
  }

  /********************************************************************************
   ***** EOF ***********************************************************************
   ********************************************************************************/
});