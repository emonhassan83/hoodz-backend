import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ObjectCannedACL,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { HttpStatusCode } from 'axios';

import { env } from '../configs/env.configs';
import s3Client from '../configs/s3Client.configs';
import ApiError from '../errors/ApiError';

//upload a single file
export const uploadToS3 = async ({
  file,
  fileName,
}: {
  file: any;
  fileName: string;
}): Promise<string | null> => {
  const command = new PutObjectCommand({
    Bucket: env.AWS_BUCKET_NAME,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: ObjectCannedACL.public_read, //access public read
  });

  try {
    const key = await s3Client.send(command);
    if (!key) {
      throw new ApiError(HttpStatusCode.BadRequest, 'File Upload failed');
    }
    const url = `${env.S3_BASE_URL}/${fileName}`;

    return url;
  } catch (error) {
    console.log(error);
    throw new ApiError(HttpStatusCode.BadRequest, 'File Upload failed');
  }
};

// delete file from s3 bucket
export const deleteFromS3 = async (key: string) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: env.AWS_BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
  } catch (error) {
    console.log('🚀 ~ deleteFromS3 ~ error:', error);
    throw new Error('s3 file delete failed');
  }
};

// upload multiple files

export const uploadManyToS3 = async (
  files: {
    file: any;
    path: string;
    key?: string;
  }[]
): Promise<{ url: string; key: string }[]> => {
  try {
    const uploadPromises = files.map(async ({ file, path, key }) => {
      const newFileName = key
        ? key
        : `${Math.floor(100000 + Math.random() * 900000)}${Date.now()}`;

      const fileKey = `${path}/${newFileName}`;

      const command = new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: fileKey,
        Body: file?.buffer,
        ContentType: file.mimetype,
        ACL: ObjectCannedACL.public_read, //access public read
      });

      const nn = await s3Client.send(command);
      // const url = `${config?.aws?.s3BaseUrl}/${fileKey}`;
      const url = `${env.S3_BASE_URL}/${fileKey}`;
      return { url, key: newFileName };
    });

    const uploadedUrls = await Promise.all(uploadPromises);
    return uploadedUrls;
  } catch (error) {
    throw new Error('File Upload failed');
  }
};

export const deleteManyFromS3 = async (keys: string[]) => {
  try {
    const deleteParams = {
      Bucket: env.AWS_BUCKET_NAME,
      Delete: {
        Objects: keys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    };

    const command = new DeleteObjectsCommand(deleteParams);

    const response = await s3Client.send(command);

    return response;
  } catch (error) {
    console.error('Error deleting S3 files:', error);
    throw new ApiError(HttpStatusCode.BadRequest, 'S3 file delete failed');
  }
};
