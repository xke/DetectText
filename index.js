/* 

DetectText: 

Connect with 3 Cloud providers for detecting text from images. Choose the best default provider based on your use cases. 

by github.com/xke

Using this code requires having accounts for Amazon Web Services, Google Cloud Platform, and Microsoft Azure. It also requires having access keys for Google Cloud Vision, Azure Computer Vision, and AWS Rekognition on the corresponding platforms.

Please reference config.example.json to create a file config.json that contains access keys and other configurations. 

Image archiving and email sending functionality is implemented with AWS S3 and SES in this example.
*/ 

const config = require('./config.json');

var express = require('express');
var app = express();

var multer  = require('multer')
var upload = multer({ dest: 'uploads/' }); // folder to store uploaded files

var request = require('request'); // for REST API access

var fs = require('fs-extra');
var path = require('path');

app.use(express.static('public')); // location of index.html portal

var ejs = require('ejs'); // ejs for rendering html output (as needed)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


// Text detection API and router
// ----------------------------------------------------------------------------
app.post('/api/detecttext', upload.single("image"), function (req, res, next) {

	if (req.file == null) {
		res.send("Error: No image file sent. Please try again.");
	}

	var source = req.body.source;
	if (source==null) { 
		source = ""; 
	}

	var requestedEngine = req.body.engine;

	if (requestedEngine==null || requestedEngine=="") { 
		// set default engine
		requestedEngine = "google"; 
	}

	var imageFile = fs.readFileSync(req.file.path);
	var uploadName = requestedEngine + "-" + source + (new Date()).getTime(); // milliseconds

	var detectedText = "";

	switch(requestedEngine) {

    case "amazon":
    	amazonDetectText(imageFile, uploadName, function(err, detectedText) {
				res.send(detectedText);
			});
    	break;

    case "google":
    	googleDetectText(imageFile, uploadName, function(err, detectedText) {
				res.send(detectedText);
			});
    	break;

    case "microsoft":
      microsoftDetectText(imageFile, uploadName, function(err, detectedText) {
				res.send(detectedText);
			});
      break;

    case "all":

    	results = []
    	totalResultsToRender = 3

    	amazonDetectText(imageFile, uploadName, function(err, detectedText) {
				results.push({engine: "Amazon", detectedText: detectedText});
				if (results.length==totalResultsToRender) {
					res.render('all', { results : results});
				}
			});

      googleDetectText(imageFile, uploadName, function(err, detectedText) {
				results.push({engine: "Google", detectedText: detectedText});
				if (results.length==totalResultsToRender) {
					res.render('all', { results : results});
				}
			});

      microsoftDetectText(imageFile, uploadName, function(err, detectedText) {
				results.push({engine: "Microsoft", detectedText: detectedText});
				if (results.length==totalResultsToRender) {
					res.render('all', { results : results});
				}
			});

    	break;

    default: 
    	// the requested engine should be one of the above
      res.send("Error: Requested engine "+requestedEngine+" not found.");
      break;
	}


});

// Google Cloud Vision set up
// https://cloud.google.com/vision/docs/detecting-text#vision-text-detection-nodejs
// ----------------------------------------------------------------------------

const googVision = require('@google-cloud/vision');
const googVisionClient = new googVision.ImageAnnotatorClient();

const googApiKey = config.googleKey;
const googVisionURL = "https://vision.googleapis.com/v1/images:annotate?key=" + googApiKey;

googleDetectText = function (imageFile, uploadName, callback) {

	// convert image to base 64 and stick it into a post request
	var postDataString = '{"requests":[{"image":{"content":"'+ imageFile.toString('base64') +'"},"features":[{"type":"TEXT_DETECTION"}]}]}';

	//console.log(postDataString);

  var clientServerOptions = {
      uri: googVisionURL,
      body: postDataString,
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      }
  }

  // send the request!
  // https://github.com/request/request

  request(clientServerOptions, function (err, response, body) {
  	
	 	if (err) {
	 		awsUploadToS3(uploadName, imageFile);
			callback(err, null);

	 	} else {

	 	  var data = JSON.parse(body); // without the replace, there are issues!

	 	  detectedText = data.responses[0].textAnnotations[0].description;

			if(detectedText==null) {
				detectedText = "";
			} else {
				detectedText = detectedText.trim();
			}

			callback(null, detectedText);

		  awsUploadToS3(uploadName, imageFile);
		  awsUploadToS3(uploadName+".txt", detectedText);

		}

		// send email if error or to alert text detection...
		awsSendEmail(err, detectedText, uploadName);

  });

}


// Microsoft Azure setup
// https://docs.microsoft.com/en-us/azure/cognitive-services/computer-vision/quickstarts/node-print-text
// ----------------------------------------------------------------------------

const msftSubscriptionKey = config.microsoftKey;
const msftURI = "https://westcentralus.api.cognitive.microsoft.com/vision/v2.0/ocr";
const msftParams = {
    'language': 'unk',
    'detectOrientation': 'true',
};

microsoftDetectText = function (imageFile, uploadName, callback) {

	const options = {
	    uri: msftURI,
	    qs: msftParams,
	    body: imageFile,
	    headers: {
	        'Content-Type': 'application/octet-stream',
	        'Ocp-Apim-Subscription-Key' : msftSubscriptionKey
	    }
	};

	request.post(options, (err, response, body) => {

	  if (err) {
	 		awsUploadToS3(uploadName, imageFile);
			callback(err, null);

	  } else {
		  
		  /*
		  let jsonResponse = JSON.stringify(JSON.parse(body), null, '  ');
		  console.log('JSON Response\n');
		  console.log(jsonResponse);
		  */

		 	var data = JSON.parse(body); 
		 	
		 	detectedText = "";

		 	lines = data.regions[0].lines;
		 	for (l=0; l < lines.length; l++) {
		 		words = lines[l].words;
		 		for (w=0; w < words.length; w++) {
		 			detectedText += " " + words[w].text;
		 		}
		 	}

			detectedText = detectedText.trim();

			//console.log("detectedText: "+detectedText);

			callback(null, detectedText);

		  awsUploadToS3(uploadName, imageFile);
		  awsUploadToS3(uploadName+".txt", detectedText);

		}

		// send email if error or to alert text detection...
		awsSendEmail(err, detectedText, uploadName);

	});

}


// AWS setup
// ----------------------------------------------------------------------------

var AWS = require('aws-sdk');
AWS.config.region = "us-east-1";
AWS.config.accessKeyId = config.amazonAccessKeyId;
AWS.config.secretAccessKey = config.amazonSecretAccessKey;

var rekognition = new AWS.Rekognition({region: "us-east-1"});

amazonDetectText = function (imageFile, uploadName, callback) {

	rekognition.detectText({
	 	"Image": { 
	 		"Bytes": imageFile,
	 	},
	}, function(err, data) {

	 	if (err) {
			callback(err, null);
		  awsUploadToS3(uploadName, imageFile);

	 	} else {

			if(data) {
				// try to process the data
				detectedWords = "";
				detectedText = "";

				if (data.TextDetections) {
					for (i in data.TextDetections) {
						if (data.TextDetections[i].Type=="WORD") {
							detectedWords = detectedWords + data.TextDetections[i].DetectedText + " ";
						}
					}
				}

				detectedText = detectedWords.trim();	

			}

			callback(null, detectedText);
		  awsUploadToS3(uploadName, imageFile);
		  awsUploadToS3(uploadName+".txt", detectedText);

		}

		// send email if error or to alert text detection...
		awsSendEmail(err, detectedText, uploadName);
		


	});
}

// AWS utility functions to upload to S3 and send email
// ----------------------------------------------------------------------------

var s3 = new AWS.S3();
var bucketName = config.amazonWriteOnlyBucketName;

awsUploadToS3 = function (fileName, fileData, uploadName) {

   params = {Bucket: bucketName, Key: fileName, Body: fileData };

   s3.putObject(params, function(err, data) {
       if (err) {
           console.log("s3.putObject error: " +err)
       } else {
           console.log("Successfully uploaded data to "+bucketName+"/"+fileName);
       }
    });

}

var ses = new AWS.SES({
   region: 'us-east-1'
});

awsSendEmail = function(err, detectedText, uploadName) {

	var subject = config.emailSubjectPrompt + " New image uploaded";
	var body = "Detected text:\n\n" + detectedText + "\n\nSee image at https://s3.console.aws.amazon.com/s3/object/"+bucketName+"/"+uploadName;
	if (err) {
		subject = config.emailSubjectPrompt + " Error";
		body = "Error: " + err + "\n\nSee image at https://s3.console.aws.amazon.com/s3/object/"+bucketName+"/"+uploadName;
	}


  var eParams = {
      Destination: {
          ToAddresses: [config.emailToAddress]
      },
      Message: {
          Body: {
              Text: {
                  Data: body
              }
          },
          Subject: {
              Data: subject
          }
      },
      Source: config.emailFromAddress
  };

  var email = ses.sendEmail(eParams, function(err, data){
      if(err) console.log(err);
      else {
      	console.log("awsSendEmail Success: Email Sent");
      }
  });

};

app.listen(process.env.PORT || 5555, function () {
	//console.log('Listening on port 5555!');
})