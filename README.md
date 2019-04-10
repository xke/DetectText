# Detect Text

Connect with 3 Cloud providers for detecting text from images. Choose the best default provider based on your use cases. 

Fully using this code requires having accounts for Amazon Web Services, Google Cloud Platform, and Microsoft Azure. It also requires having access keys for Google Cloud Vision, Azure Computer Vision, and AWS Rekognition on the corresponding platforms. In this example, additional features for image archiving and email sending are implemented with AWS S3 and SES. The Amazon access keys must have permission to write to an S3 bucket of your choosing, and to send email via SES. 

**To try it on your machine:**

* Reference `config.example.json` to create a file `config.json` that contains your access keys etc.
* `npm install`
* `npm start`
* Go to `http://localhost:5555` and upload an image


