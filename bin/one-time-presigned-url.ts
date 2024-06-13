import { App } from 'aws-cdk-lib';
import { OneTimePresignedUrlStack } from '../lib/one-time-presigned-url-stack';

const app = new App();
new OneTimePresignedUrlStack(app, 'OneTimePresignedUrlStack');
