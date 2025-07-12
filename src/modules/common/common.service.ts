import { Injectable } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class Common {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME!;
    this.storage = new Storage();
  }

  async uploadFile(
    fileBuffer: Buffer,
    destination: string,
    contentType: string,
    isPublic = true,
  ): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(destination);

    await file.save(fileBuffer, {
      metadata: { contentType },
      resumable: false,
    });

    if (isPublic) {
      await file.makePublic();
      return `https://storage.googleapis.com/${this.bucketName}/${destination}`;
    }

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });
    return url;
  }
}