import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { join } from 'path';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export class OneTimePresignedUrlStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const entriesTable = new dynamo.Table(this, 'entriesTable', {
      partitionKey: { name: 'pk', type: dynamo.AttributeType.STRING },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const bucket = new s3.Bucket(this, 'assets-bucket', {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const urlLambda = new lambda.NodejsFunction(this, 'urlLambda', {
      entry: join(__dirname, './url-lambda.ts'),
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
      runtime: Runtime.NODEJS_18_X,
    });
    bucket.grantRead(urlLambda);

    const api = new apigw.HttpApi(this, 'api', {
      corsPreflight: {
        allowMethods: [apigw.CorsHttpMethod.GET],
      },
    });

    api.addRoutes({
      integration: new apigwIntegrations.HttpLambdaIntegration('UrlLambdaIntegration', urlLambda),
      path: '/get-url',
      methods: [apigw.HttpMethod.GET],
    });

    const entriesTableParameter = new ssm.StringParameter(this, 'URL_ENTRIES_TABLE_NAME', {
      stringValue: entriesTable.tableName,
      parameterName: 'URL_ENTRIES_TABLE_NAME',
    });

    const edgeLambda = new lambda.NodejsFunction(this, 'edgeLambda', {
      entry: join(__dirname, './edge-lambda.ts'),
      runtime: Runtime.NODEJS_18_X,
    });

    entriesTable.grantReadWriteData(edgeLambda.currentVersion);
    entriesTableParameter.grantRead(edgeLambda.currentVersion);

    const distribution = new cloudfront.Distribution(this, 'distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        cachePolicy: new cloudfront.CachePolicy(this, 'cachePolicy', {
          maxTtl: Duration.seconds(1),
          minTtl: Duration.seconds(0),
          defaultTtl: Duration.seconds(0),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
        }),
        edgeLambdas: [
          {
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
            functionVersion: edgeLambda.currentVersion,
            includeBody: false,
          },
        ],
      },
    });

    urlLambda.addEnvironment('CF_DOMAIN', distribution.domainName);

    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride('DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity', '');

    new CfnOutput(this, 'assetsBucketName', { value: bucket.bucketName });

    new CfnOutput(this, 'getPresignedUrlEndpoint', {
      value: `${api.apiEndpoint}/get-url`,
    });
  }
}
