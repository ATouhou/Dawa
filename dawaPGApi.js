"use strict";

var express     = require('express');
var JSONStream  = require('JSONStream');
var _           = require('underscore');
var pg          = require('pg');
var QueryStream = require('pg-query-stream');
var eventStream = require('event-stream');

var SQL ="\n"+
  "  SELECT * FROM adgangsadresser as A\n"+
  "  LEFT JOIN enhedsadresser as E ON (E.adgangsadresseid = A.id)\n" +
  "  LEFT JOIN vejnavne as V ON (A.kommunekode = V.kommunekode\n"+
  "            AND A.vejkode = V.kode)\n" +
  "  LEFT JOIN postnumre as P ON (A.postnr = P.nr)\n";

//var connString = "postgres://pmm@dkadrdevdb.co6lm7u4jeil.eu-west-1.rds.amazonaws.com:5432/dkadr";
// var connString = "postgres://ahj@localhost/dawa2";
var connString = process.env.pgConnectionUrl;

function vejnavnRowToSuggestJson(row) {
  return {
    id: '',
    vej: {
      kode: '',
      navn: row.vejnavn
    },
    husnr: '',
    etage: '',
    dør: '',
    bygningsnavn: '',
    supplerendebynavn: '',
    postnummer: {
      nr: '',
      navn: '',
      href: ''
    }
  };
}

function adresseRowToSuggestJson(row) {
  return {
    id: row.id,
    vej: {
      kode: row.vejkode,
      navn: row.vejnavn
    },
    husnr: row.husnr ? row.husnr : "",
    etage: row.etage ? row.etage : "",
    dør: row.doer ? row.doer : "",
    bygningsnavn: '',
    supplerendebynavn: '',
    postnummer: {
      nr: "" + row.postnr,
      navn: row.postnrnavn,
      href: 'http://dawa.aws.dk/kommuner/' + row.postnr
    }
  };
}

function withPsqlClient(cb) {
  return pg.connect(connString, cb);
}

// pipe stream to HTTP response. Invoke cb when done. Pass error, if any, to cb.
function streamToHttpResponse(stream, res, cb) {
  res.on('error', function (err) {
    console.error("An error occured while streaming data to HTTP response", new Error(err));
    cb(err);
  });
  res.on('close', function () {
    console.log("Client closed connection");
    cb("Client closed connection");
  });
  res.on('finish', cb);
  stream.pipe(res);
}

function streamingQuery(client, sql, params) {
  //    console.log("\nAddress SQL: "+sql);
  return client.query(new QueryStream(sql, params, {batchSize: 10000}));
}

function toPgSuggestQuery(q) {
  q = q.replace(/[^a-zA-Z0-9ÆæØøÅåéE]/g, ' ');

  // normalize whitespace
  q = q.replace(/\s+/g, ' ');

  var hasTrailingWhitespace = /.*\s$/.test(q);
  // remove leading / trailing whitespace
  q = q.replace(/^\s*/g, '');
  q = q.replace(/\s*$/g, '');


  // translate spaces into AND clauses
  var tsq = q.replace(/ /g, ' & ');

  // Since we do suggest, if there is no trailing whitespace,
  // the last search clause should be a prefix search
  if (!hasTrailingWhitespace) {
    tsq += ":*";
  }
  return tsq;
}

exports.setupRoutes = function () {
  var app = express();
  app.set('jsonp callback', true);
  app.use(express.methodOverride());
  app.use(express.bodyParser());

  app.get(/^\/adresser.json(?:(\w+))?$/i, function (req, res) {
    var whereClauses = [];
    if (req.query.postnr) {
      whereClauses.push("A.postnr = " + parseInt(req.query.postnr)+"\n");
    }
    if (req.query.polygon) {
      // mapping GeoJson to WKT (Well-Known Text)
      var p = JSON.parse(req.query.polygon);
      var mapPoint   = function(point) { return ""+point[0]+" "+point[1]; };
      var mapPoints  = function(points) { return "("+_.map(points, mapPoint).join(", ")+")"; };
      var mapPolygon = function(poly) { return "POLYGON("+_.map(poly, mapPoints).join(" ")+")"; };
      var poly = mapPolygon(p);
      whereClauses.push(
      "ST_Contains(ST_GeomFromText($1, 4326)::geometry, A.geom)\n");
    }
    var where = "  WHERE "+whereClauses.join("        AND ");

    withPsqlClient(function(err, client, done) {
      var stream = eventStream.pipeline(
        streamingQuery(client, SQL+where, [poly]),
        JSONStream.stringify()
      );
      streamToHttpResponse(stream, res, done);
    });
  });



  app.get('/adresser/autocomplete', function (req, res) {
    var q = req.query.q;

    var tsq = toPgSuggestQuery(q);

    var postnr = req.query.postnr;

    var args = [tsq];
    if (postnr) {
      args.push(postnr);
    }

    withPsqlClient(function (err, client, done) {
      // TODO handle error

      var responseDataStream;
      // Search vejnavne first
      // TODO check, at DISTINCT ikke unorder vores resultat
      var vejnavneSql = 'SELECT DISTINCT vejnavn FROM (SELECT * FROM Vejnavne, to_tsquery(\'vejnavne\', $1) query WHERE (tsv @@ query)';

      if (postnr) {
        vejnavneSql += ' AND EXISTS (SELECT * FROM Enhedsadresser WHERE vejkode = Vejnavne.kode AND kommunekode = Vejnavne.kommunekode AND postnr = $2)';
      }

      vejnavneSql += 'ORDER BY ts_rank(Vejnavne.tsv, query) DESC) AS v LIMIT 10';

      client.query(vejnavneSql, args, function (err, result) {
        if (err) {
          console.error('error running query', err);
          // TODO reportErrorToClient(...)
          return done(err);
        }
        if (result.rows.length > 1) {
          responseDataStream =
            eventStream.pipeline(
              eventStream.readArray(result.rows),
              eventStream.mapSync(vejnavnRowToSuggestJson),
              JSONStream.stringify()
            );
          streamToHttpResponse(responseDataStream, res, done);
          return;
        }

        var sql = 'SELECT * FROM Adresser, to_tsquery(\'vejnavne\', $1) query  WHERE (tsv @@ query)';
        if (postnr) {
          sql += ' AND postnr = $2';
        }
        sql += ' ORDER BY ts_rank(Adresser.tsv, query) DESC';

        sql += ' LIMIT 10';


        var queryStream = streamingQuery(client, sql, args);
        responseDataStream = eventStream.pipeline(
          queryStream,
          eventStream.mapSync(adresseRowToSuggestJson),
          JSONStream.stringify()
        );
        streamToHttpResponse(responseDataStream, res, done);
      });
    });
  });

  return app;
};

// For manuel testing
// Area around my home (PMM): POLYGON((56.129 9.60, 56.139 9.60, 56.139 9.65, 56.129 9.65, 56.129 9.60))
// About 1200 addresses in the polygon