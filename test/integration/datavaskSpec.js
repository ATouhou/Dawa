//"use strict";
//
//var expect = require('chai').expect;
//var q = require('q');
//
//require('../../apiSpecification/allSpecs');
//
//var datavaskResources = require('../../apiSpecification/datavask/resources');
//var helpers = require('./helpers');
//var testdb = require('../helpers/testdb');
//
//var adresseTests = [
//  {
//    it: 'Kan finde en adresse, som matcher præcist',
//    betegnelse: 'Margrethepladsen 4, 4. 8000 Aarhus C',
//    result: {
//      kategori: 'A',
//      id: '91b21c97-fb07-4aac-98c5-61bcb4689f78'
//    }
//  },
//  {
//    it: 'Kan finde en adresse, som har stavefejl',
//    betegnelse: 'Margreteplassen 4, 4. 8000 Aarhus C',
//    result: {
//      kategori: 'B',
//      id: '91b21c97-fb07-4aac-98c5-61bcb4689f78'
//    }
//  },
//  {
//    it: 'Hvis en anden vej matcher bedre, så er resultatet kategori C',
//    betegnelse: 'Jyllandsvej 17, 4600 Køge',
//    result: {
//      kategori: 'C',
//      id: '0a3f50ab-8c3d-32b8-e044-0003ba298018' // Sjællandsvej 17, 4600 Køge
//    }
//  },
//  {
//    it: 'Hvis der er ukendte tokens, så er resultatet kategori C',
//    betegnelse: 'Margrethepladsen 4, 2., 8000 Aarhus C',
//    result: {
//      kategori: 'C',
//      id: '91b21c97-fb07-4aac-98c5-61bcb4689f78'
//    }
//  }
//];
//
//describe('Adressevask', () => {
//  testdb.withTransactionEach('test', function (clientFn) {
//    adresseTests.forEach((test) => {
//      it(test.it, ()=> {
//        return q.async(function*() {
//          var result = yield helpers.getJson(clientFn(), datavaskResources.adresse, {}, {betegnelse: test.betegnelse})
//          expect(result.kategori).to.equal(test.result.kategori);
//          expect(result.resultater[0].adresse.id).to.equal(test.result.id);
//        })();
//      });
//    });
//  });
//});