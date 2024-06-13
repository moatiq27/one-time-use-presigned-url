# One-Time presigned urls

## Deployment

This repo assumes you will be deploying to `us-east-1` region.

Before running the commands, make sure you have your AWS environment variables setup correctly. Make sure you are in the directory and run the following:

`npm install`

`npm run cdk bootstrap`

`npm run cdk deploy`

## Clean Up

To remove the resources deployed as part of this application, make sure the S3 buckets deployed are empty and then run:

`npm run cdk destroy`
