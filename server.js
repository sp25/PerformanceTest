var express = require('express');
var app = express();
var fs = require("fs");

var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var path = require("path");
var url = 'mongodb://localhost:27017/bd_avance';

var url_2d_points = 'mongodb://localhost:27017/bd_projet_2d_p';
var url_2d_lignes = 'mongodb://localhost:27017/bd_projet_2d_l';
var url_2dsphere_points = 'mongodb://localhost:27017/bd_projet_2dsphere_p';
var url_2dsphere_lignes = 'mongodb://localhost:27017/bd_projet_2dsphere_l';
var url_inputs = 'mongodb://localhost:27017/bd_inputs';
var distancesGeom = [];
var positionPoint = { "type": "Point", "coordinates": [ 7.562892923000049, 51.535703584000032 ] };
var distances =[1,2,4,8];
var distancesGeom = [];

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

app.get('/',function(req,res){
    res.sendFile(path.join(__dirname+'/accueil.html'));
});

app.get('/performances', function(req, res) {
    var index2d = req.query.index2d;
    var geometrie = req.query.geometrie;
    var operateur = req.query.operateur;
    var distance = parseInt(req.query.distance);
    var donnees = req.query.donnees;

    console.log("Début obtenir paramètres...");
    var url = obtenirUrlClientMongo(index2d, geometrie);
    var distanceParam = obtenirDistance(index2d, distance, operateur);
    var query = obtenirQuery(index2d, operateur, distance);

    console.log("Début connection à Mongo...");
    MongoClient.connect(url, function (err, db) {
        if (err) throw err;

        console.log("Début de la requête sur BD :" + url);
        var cursor = db.collection(donnees).find(query, {explain: true}).toArray(function (err, explanation) {

            console.log("Fin de la requête:");
            console.log("Query:" + query);
            console.log("Table:" + donnees);
            console.log("temps:" + explanation[0].executionStats.executionTimeMillis);
            console.log("returned:" + explanation[0].executionStats.nReturned);

            temps = explanation[0].executionStats.executionTimeMillis;
            returned = explanation[0].executionStats.nReturned;

            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({
                temps: String(temps),
                returned: String(returned)
            }))
            db.close();
        });
    })
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


function obtenirUrlClientMongo(index2d, geometrie){

    var url = "";
    if (index2d && geometrie == 'ponctuelle') url = url_2d_points;
    else if (index2d && geometrie == 'lineaire') url = url_2d_lignes;
    else if (!index2d && geometrie == 'ponctuelle') url = url_2dsphere_points;
    else if (!index2d && geometrie == 'lineaire') url = url_2dsphere_lignes;

    return url;
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

function obtenirPolygoneSelonDistance(distance){
    return distancesGeom[distance];
}

function init(){

    MongoClient.connect(url_inputs, function(err, db) {
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

var server = app.listen(8081, function () {

    var host = server.address().address;
    var port = server.address().port;
    init();
    console.log("App listening at http://%s:%s", host, port)
});
