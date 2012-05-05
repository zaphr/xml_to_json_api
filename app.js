var express = require('express');

var app = module.exports = express.createServer();

var http = require('http'),   
    xml2js = require('xml2js'),
    require('underscore');

var redis = require("redis"),
	client = redis.createClient();

	client.on("error", function (err) {
	    console.log("Error " + err);
	});

// Configuration

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes

app.get('/things/:id', function (req,res) {	
	fetch_xml_and_return_json('/api/pois/' + req.params.id, req,res);								
});

app.get('/places/:id/things', function (req, res){
	fetch_xml_and_return_json('/api/places/' + req.params.id + '/pois', req, res, 'poi');
});

app.get('/places/:id/things/full', function (req, res){
	fetch_xml_and_return_json('/api/places/' + req.params.id + '/pois?detail=full', req, res, 'poi');
});

app.get('/places/search/:place_name', function (req, res){
	fetch_xml_and_return_json('/api/places?name=' + req.params.place_name , req, res, 'place');
});

app.get('/places/:id/things/:type', function (req, res){
	var request_url = '/api/places/' + req.params.id + '/pois?type=' + req.params.type;
	fetch_xml_and_return_json(request_url, req, res, 'poi');
});

app.get('/things/:poi_type?/around/:latlong/:distance?', function (req,res) {
	var distance = req.params.distance, poi_type = req.params.poi_type;
	
	if (distance === undefined){ distance = '1000';}	
	if (poi_type === undefined){ poi_type = 'anything';} 
	
	var request_url = '/api/bounding_boxes/' 
	                  +  bounding_box(req.params.latlong, distance) 
	                  + '/pois';
	
	if (poi_type !== 'anything' && poi_type !== 'Anything') {	
	  request_url += '?poi_type=' + req.params.poi_type;
	}
	
	fetch_xml_and_return_json(request_url, req,res, 'poi');								
});



var bounding_box = function (latlong, distance){
  var 	latitude, 
		longitude,

		mod = 0.000008 * distance,
		latlongs = latlong.split(',');
		
		latitude = 	parseFloat(latlongs[0]);
		longitude = parseFloat(latlongs[1]);
		
		// Truncate to 5 decimal places to clean up request url
		return (latitude + mod).toFixed(5) + ',' + (latitude - mod).toFixed(5)
		 + ',' + (longitude + mod).toFixed(5) + ',' + (longitude - mod).toFixed(5);						
};

var fetch_xml_and_return_json = function (path, req, res, result_type){
	// Attempt to fetch JSON from redis
    client.get( path, function( err, data ) {
      if( data ) {
	    // Return JSON to client if already cached
        res.send(JSON.parse(data));
      } else {

	
	    var parser = new xml2js.Parser();	

	    var username = 'xxxxxxxxxx',
	        password = 'xxxxxxxxxx',
	        auth = 'Basic ' + new Buffer(username + ':' + password).toString('base64'),
	        header = {'Authorization': auth};

	    var options = {
	      host: 'api.lonelyplanet.com',
	      port: 80,
	      path: path,
	      method: 'GET',
	      headers: header
	    };

	    var request = http.request(options, function(response) {
	      response.setEncoding('utf8');
	    });

	    request.addListener('response', function(response){
		  var data = '';

          // Response is returned from server in multiple chunks
		  response.addListener('data', function(chunk){
			data += chunk;
		  });

		  response.addListener('end', function(){
			// Convert XML to JSON
			// Buggy with extended character set
			parser.parseString(data);
		  });				
	    });

	    parser.addListener('end', function(result) {
		  var result_array = normalise_result_structure(result, result_type);
		  // Send JSON back to client		
	      res.send(result_array);
	      // Write JSON to redis with gateway uri as key
	      client.set(path, JSON.stringify(result_array));
	    });
	    request.end();	
      }

   });	
			
};

// xml returned from gateway is inconsistent
// Fix so 0, 1 or many results are returned in array
var normalise_result_structure = function (result, result_type) {
	  var result_array = result;

      // Just get JSON for results / remove artifacts from conversion 
	  if (typeof result_type !== 'undefined'){
		result_array = result_array[result_type];	
	  } 
	  
	  // Cover for 0 results. Still want to return an array 		
	  if (typeof result_array === 'undefined'){
		result_array = [];	
	  }
	
	  // Drop single result objects in an array
	  if (!Array.isArray(result_array)){
		result_array = [result_array];
	  }
	  return result_array;	
};



if (!module.parent) {
  app.listen(8000);
  console.log("Express server listening on port %d", app.address().port);
}
