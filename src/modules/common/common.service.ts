import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { posix as pathPosix } from 'path';

@Injectable()
export class Common {
  private readonly logger = new Logger(Common.name);
  private readonly baseFolder = 'hrms/common';

  constructor(private readonly configService: ConfigService) {
    this.initializeCloudinary();
  }

  async uploadFile(
    fileBuffer: Buffer,
    destination: string,
    contentType: string,
    isPublic = true,
    organizationId?: string,
  ): Promise<string> {
    if (!isPublic) {
      this.logger.warn(
        'Private uploads are not supported in Common service with Cloudinary; uploading as public',
      );
    }

    // Sanitize destination to prevent path traversal
    const safeDestination = destination
      .replace(/[^a-zA-Z0-9/_-]/g, '')
      .replace(/\.\./g, '')
      .replace(/^\.+/, '')
      .trim();

    const normalizedDestination = safeDestination
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .join('/');
    const parsedPath = pathPosix.parse(normalizedDestination);

    const baseFolder = organizationId
      ? `hrms/${organizationId}/common`
      : this.baseFolder;

    const folder = [baseFolder, parsedPath.dir].filter(Boolean).join('/');
    const publicId = parsedPath.name;

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: publicId,
            overwrite: false,
            resource_type: 'auto',
            use_filename: false,
            unique_filename: true,
          },
          (error, uploadResult) => {
            if (error) {
              reject(error);
              return;
            }

            if (!uploadResult) {
              reject(new Error('No upload result returned from Cloudinary'));
              return;
            }

            resolve(uploadResult);
          },
        );

        stream.end(fileBuffer);
      });

      return result.secure_url;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown upload error';
      this.logger.error(`Cloudinary upload failed: ${message}`);
      throw new InternalServerErrorException('File upload failed');
    }
  }

  private initializeCloudinary(): void {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.error(
        'Cloudinary credentials are missing in environment variables',
      );
      throw new Error(
        'Cloudinary credentials are missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }
}
