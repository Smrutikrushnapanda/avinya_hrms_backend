import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { supabase } from '../../shared/supabase';

@Injectable()
export class Common implements OnModuleInit {
  private readonly logger = new Logger(Common.name);
  private readonly bucket = process.env.COMMON_UPLOADS_BUCKET || 'common-uploads';
  private readonly signedUrlTtlSeconds = 60 * 60; // 1 hour

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  async uploadFile(
    fileBuffer: Buffer,
    destination: string,
    contentType: string,
    isPublic = true,
  ): Promise<string> {
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(destination, fileBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`);
      throw new InternalServerErrorException('File upload failed');
    }

    if (isPublic) {
      const { data } = supabase.storage.from(this.bucket).getPublicUrl(destination);
      return data.publicUrl;
    }

    const { data, error: signError } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(destination, this.signedUrlTtlSeconds);

    if (signError || !data?.signedUrl) {
      this.logger.error(`Failed to create signed URL: ${signError?.message}`);
      throw new InternalServerErrorException('File upload failed');
    }

    return data.signedUrl;
  }

  private async ensureBucketExists() {
    const { data, error } = await supabase.storage.getBucket(this.bucket);
    if (data && !error) return;

    const { error: createError } = await supabase.storage.createBucket(this.bucket, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10 MB
    });

    if (createError && createError.message !== 'The resource already exists') {
      this.logger.error(`Failed to create bucket "${this.bucket}": ${createError.message}`);
    } else {
      this.logger.log(`Supabase bucket "${this.bucket}" ensured.`);
    }
  }
}
