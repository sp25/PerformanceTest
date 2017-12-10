//var app = require('../server');
var express = require('express');
var app = express();
var fs = require("fs");
var url = require('url');

var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var path = require("path");

var urlHero = "mongodb://publicUser:211jymlaPublic25@ds135926.mlab.com:35926/heroku_kqb2bkkp";
var dataset2dsp_p = '_2dsp_p';
var dataset2dsp_l = '_2dsp_l';
var dataset2d_p = '_2d_p';
var dataset2d_l = '_2d_l';

var distancesGeom = [];
var positionPoint = { "type": "Point", "coordinates": [ 7.562892923, 51.535703584 ] };
var distances =[1,2,4,8];
var distancesGeom = [];

var express = require('express')
var app = express()

app.set('port', (process.env.PORT || 8081))
app.use(express.static(__dirname + '/public'))

//var https = require('https');
var http = require('http');

http.createServer(app).listen('port');
//https.createServer(app).listen('port');

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'))
})

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

app.get('/',function(req,res){
    res.sendFile(path.join(__dirname, 'accueil.html'));
});

app.get('/performances', function(req, res) {
    var index2d = req.query.index2d;
    var geometrie = req.query.geometrie;
    var operateur = req.query.operateur;
    var distance = parseInt(req.query.distance);
    var donnees = req.query.donnees;

    console.log("Début obtenir paramètres...");
    var donnees = obtenirDatasetClientMongo(index2d, geometrie);
    var distanceParam = obtenirDistance(index2d, distance, operateur);
    var query = obtenirQuery(index2d, operateur, distance);
    var temps = 0;
    var returned = 0;
    console.log("Table: " + donnees);
    console.log("Distance: " + distanceParam);

    console.log("Début connection à Mongo...");
    MongoClient.connect(urlHero, function (err, db) {
        if (err) throw err;

        console.log("Début de la requête sur BD :" + urlHero);

        if (operateur != 'pipeline') {

                var cursor = db.collection(donnees).find(query, {explain: true}).toArray(function (err, explanation) {

                console.log("Fin de la requête:");
                console.log("Query:" + query);
                console.log("Table:" + donnees);

                if (explanation) {
                    console.log("temps:" + explanation[0].executionStats.executionTimeMillis);
                    console.log("returned:" + explanation[0].executionStats.nReturned);

                    temps = explanation[0].executionStats.executionTimeMillis;
                    returned = explanation[0].executionStats.nReturned;
                }
                else {
                    console.log("Erreur");
                }

                res.setHeader('Content-Type', 'application/json');
                res.send(JSON.stringify({
                    temps: String(temps),
                    returned: String(returned)
                }))
                db.close();
            });
            return;
        }
        else {
            var queryAgg = obtenirQueryAgregation(index2d, distance);
            var before = new Date();
            console.log("Début de la requête:");
            var cursor = db.collection(donnees).aggregate(queryAgg).toArray(function (err, explanation) {

                console.log("Fin de la requête:");
                console.log("Query:" + query);
                console.log("Table:" + donnees);

                var after = new Date();
                var execution_mills = after - before;

                temps = execution_mills;
                returned = "N/A";

                res.setHeader('Content-Type', 'application/json');
                res.send(JSON.stringify({
                    temps: String(temps),
                    returned: String(returned)
                }))
                db.close();
            });
            return;
        }
    });
});

function obtenirDistance(index2d, distance, operateur){

    if (index2d){
        if (operateur == '$near'){
            return distance / 80;
        }
        else {
            return distance / 6378.1;
        }
    }
    else {
        return distance * 1000;
    }
}


function obtenirDatasetClientMongo(index2d, geometrie){

    var datasetBase = "dataset1";
    var dataset = "";
    if (index2d && geometrie == 'ponctuelle') dataset = datasetBase + dataset2d_p;
    else if (index2d && geometrie == 'lineaire') dataset = datasetBase + dataset2d_l;
    else if (!index2d && geometrie == 'ponctuelle') dataset = datasetBase + dataset2dsp_p;
    else if (!index2d && geometrie == 'lineaire') dataset = datasetBase + dataset2dsp_l;

    return dataset;
}

function obtenirQuery(index2d, operateur, distance){
    var query = "";
    if (index2d){
        if (operateur == '$near'){
           query = { geometry :{ $near : positionPoint.coordinates, $maxDistance: distance / 80} };
        }
        else {
            query = { geometry :{ $geoWithin : { $centerSphere : [ positionPoint.coordinates , distance / 6378.1 ] }} };
        }
    }
    else {
        var dist = distance * 1000;
        var polygone = obtenirPolygoneSelonDistance(distance);
        if (operateur == '$near') {
            query = { geometry: {$near:{$geometry:positionPoint, $maxDistance:distanceDepart}} };
        }
        else if (operateur == '$within') {
            query = { geometry: {$within:{$geometry:polygone}}};
        }
        else {
            query = { geometry: {$geoIntersects:{$geometry:polygone}}};
        }
    }
    return query;
}

function obtenirQueryAgregation(index2d, distance){
    var queryIN = "";
    if (index2d){
        queryIN =[{$geoNear: { near:positionPoint.coordinates, maxDistance: distance, distanceField:"dist", spherical:"false", limit:3000000}}, {$group: {_id: "$properties.fclass", count: {$sum: 1}}}];
    }
    else {
        queryIN =[{$geoNear: { near: { type: "Point", coordinates:positionPoint.coordinates }, maxDistance: distance, distanceField:"dist", spherical:"true", limit:3000000}}, {$group: {_id: "$properties.fclass", count: {$sum: 1}}}];
    }
    return queryIN;
}

function obtenirPolygoneSelonDistance(distance){
    return distancesGeom[distance];
}

function init(){

    MongoClient.connect(urlHero, function(err, db) {
        if (err) throw err;

        for (var j = 0; j < distances.length; j++) {
            distance = distances[j];
            var query = {"properties.BUFF_DIST": distance};
            db.collection("input_surfacique").find(query).toArray(function (err, result) {
                if (err) throw err;
                distancesGeom.push(result.geometry)
                db.close();
            });
        }
    });
}