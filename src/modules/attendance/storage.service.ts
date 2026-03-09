import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sharp from 'sharp';
import { subMonths } from 'date-fns';
import {
  UploadApiResponse,
  v2 as cloudinary,
} from 'cloudinary';
import { AttendancePhotoType } from './dto/upload-attendance-photo.dto';

interface StoredObject {
  publicId: string;
  createdAt?: Date;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly cloudinaryBaseFolder = 'hrms/attendance';
  private readonly hardFileSizeBytes = 5 * 1024 * 1024; // 5 MB
  private readonly targetMaxBytes = 400 * 1024; // 400 KB cap after compression

  constructor(private readonly configService: ConfigService) {
    this.initializeCloudinary();

    const sweepHours = Number(process.env.ATTENDANCE_PHOTO_SWEEP_HOURS || 24);
    const sweepEnabled = process.env.DISABLE_ATTENDANCE_PHOTO_SWEEP !== 'true';

    if (sweepEnabled) {
      setInterval(() =>
        this
          .deletePhotosOlderThanMonths(6)
          .catch((error) => this.logger.error(`Cleanup failed: ${error.message}`)),
      sweepHours * 60 * 60 * 1000);
    }
  }

  async uploadAttendancePhoto(
    file: Express.Multer.File,
    companyId: string,
    userId: string,
    type: AttendancePhotoType,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Photo file is required');
    }
    if (!companyId || !userId) {
      throw new BadRequestException('companyId and userId are required');
    }

    if (file.size > this.hardFileSizeBytes) {
      throw new BadRequestException('Max file size is 5 MB');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only JPEG, PNG, or WebP images are allowed',
      );
    }

    const { buffer, mimeType } = await this.compressToJpegUnderLimit(file.buffer);

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${now.getUTCDate()}`.padStart(2, '0');

    const safeCompanyId = companyId.trim();
    const safeUserId = userId.trim();
    const folder =
      `${this.cloudinaryBaseFolder}/${safeCompanyId}/${safeUserId}/${year}/${month}/${day}`;
    const publicId = `${type}-${Date.now()}`;

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: publicId,
            overwrite: false,
            resource_type: 'image',
            format: 'jpg',
            use_filename: false,
            unique_filename: false,
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

        stream.end(buffer);
      });

      return result.secure_url;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown upload error';
      this.logger.error(`Cloudinary attendance upload failed: ${message}`);
      throw new InternalServerErrorException('Could not store attendance photo');
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    if (!key) {
      throw new BadRequestException('Storage key is required');
    }

    if (/^(https?:)?\/\//i.test(key) || key.startsWith('data:')) {
      return key;
    }

    const legacyStorageBaseUrl = this.configService.get<string>('LEGACY_STORAGE_BASE_URL');
    if (legacyStorageBaseUrl) {
      return `${legacyStorageBaseUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
    }

    this.logger.warn(
      `Received legacy storage key without a public base URL configured: ${key}`,
    );
    return key;
  }

  async deletePhotosOlderThanMonths(months = 6): Promise<void> {
    const threshold = subMonths(new Date(), months);
    const objects = await this.listCloudinaryResources();

    const expiredPublicIds = objects
      .filter(({ createdAt }) => (createdAt ? createdAt < threshold : false))
      .map((item) => item.publicId);

    if (!expiredPublicIds.length) {
      return;
    }

    try {
      await cloudinary.api.delete_resources(expiredPublicIds, {
        resource_type: 'image',
      });
      this.logger.log(`Deleted ${expiredPublicIds.length} expired attendance photos`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delete error';
      this.logger.error(`Failed to delete expired Cloudinary photos: ${message}`);
      throw new InternalServerErrorException('Photo cleanup failed');
    }
  }

  private async compressToJpegUnderLimit(input: Buffer): Promise<{
    buffer: Buffer;
    mimeType: string;
  }> {
    const qualitySteps = [80, 72, 64, 56];

    for (const quality of qualitySteps) {
      const output = await Sharp(input)
        .rotate()
        .resize({
          width: 1280,
          height: 1280,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();

      if (output.byteLength <= this.targetMaxBytes) {
        return { buffer: output, mimeType: 'image/jpeg' };
      }
    }

    throw new BadRequestException(
      'Image is too large even after compression. Please upload a photo under 400 KB.',
    );
  }

  private initializeCloudinary(): void {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.error('Cloudinary credentials are missing in environment variables');
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

  private async listCloudinaryResources(): Promise<StoredObject[]> {
    const files: StoredObject[] = [];
    let nextCursor: string | undefined;

    do {
      let response: {
        resources?: Array<{ public_id: string; created_at?: string }>;
        next_cursor?: string;
      };
      try {
        response = await cloudinary.api.resources({
          type: 'upload',
          resource_type: 'image',
          prefix: `${this.cloudinaryBaseFolder}/`,
          max_results: 500,
          next_cursor: nextCursor,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown list error';
        this.logger.error(`Failed to list Cloudinary resources: ${message}`);
        throw new InternalServerErrorException('Unable to list storage objects');
      }

      for (const resource of response.resources || []) {
        files.push({
          publicId: resource.public_id,
          createdAt: resource.created_at ? new Date(resource.created_at) : undefined,
        });
      }

      nextCursor = response.next_cursor;
    } while (nextCursor);

    return files;
  }
}
