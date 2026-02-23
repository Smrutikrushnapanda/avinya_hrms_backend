import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as Sharp from 'sharp';
import { subMonths } from 'date-fns';
import { supabase } from '../../shared/supabase';
import { AttendancePhotoType } from './dto/upload-attendance-photo.dto';

interface StoredObject {
  path: string;
  createdAt?: Date;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly bucket =
    process.env.SUPABASE_ATTENDANCE_BUCKET || 'attendance-photos';
  private readonly logger = new Logger(StorageService.name);
  private readonly signedUrlTtlSeconds =
    Number(process.env.SUPABASE_SIGNED_URL_TTL_SECONDS) ||
    60 * 60 * 24 * 180; // default 6 months
  private readonly hardFileSizeBytes = 5 * 1024 * 1024; // 5 MB
  private readonly targetMaxBytes = 400 * 1024; // 400 KB cap after compression

  constructor() {
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

  async onModuleInit() {
    await this.ensureBucketExists();
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

    const { buffer, extension, mimeType } = await this.compressToJpegUnderLimit(
      file.buffer,
    );

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${now.getUTCDate()}`.padStart(2, '0');

    const safeCompanyId = companyId.trim();
    const safeUserId = userId.trim();

    const key = `${safeCompanyId}/${safeUserId}/${year}/${month}/${day}/${type}.${extension}`;

    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(key, buffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`);
      throw new InternalServerErrorException('Could not store attendance photo');
    }

    return key;
  }

  async getSignedUrl(key: string): Promise<string> {
    if (!key) {
      throw new BadRequestException('Storage key is required');
    }

    // If a full URL or data URI is passed, return as-is to avoid oversized signed-url requests
    if (/^(https?:)?\/\//i.test(key) || key.startsWith('data:')) {
      return key;
    }

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, this.signedUrlTtlSeconds);

    if (error || !data?.signedUrl) {
      this.logger.error(`Failed to create signed URL: ${error?.message}`);
      throw new InternalServerErrorException('Could not generate signed URL');
    }

    return data.signedUrl;
  }

  async deletePhotosOlderThanMonths(months = 6): Promise<void> {
    const threshold = subMonths(new Date(), months);
    const objects = await this.listFilesRecursively();

    const expiredKeys = objects
      .filter(({ createdAt, path }) => {
        const created = createdAt || this.extractDateFromPath(path);
        return created ? created < threshold : false;
      })
      .map((item) => item.path);

    if (!expiredKeys.length) {
      return;
    }

    const { error } = await supabase.storage
      .from(this.bucket)
      .remove(expiredKeys);

    if (error) {
      this.logger.error(`Failed to delete expired photos: ${error.message}`);
      throw new InternalServerErrorException('Photo cleanup failed');
    }

    this.logger.log(`Deleted ${expiredKeys.length} expired attendance photos`);
  }

  private async compressToJpegUnderLimit(input: Buffer): Promise<{
    buffer: Buffer;
    mimeType: string;
    extension: string;
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
        return { buffer: output, mimeType: 'image/jpeg', extension: 'jpg' };
      }
    }

    throw new BadRequestException(
      'Image is too large even after compression. Please upload a photo under 400 KB.',
    );
  }

  private async ensureBucketExists() {
    const { data, error } = await supabase.storage.getBucket(this.bucket);
    if (data && !error) {
      return;
    }

    const createResult = await supabase.storage.createBucket(this.bucket, {
      public: false,
      fileSizeLimit: `${this.hardFileSizeBytes}`, // 5MB limit server-side
    });

    if (createResult.error && createResult.error.message !== 'The resource already exists') {
      this.logger.error(`Failed to ensure bucket "${this.bucket}": ${createResult.error.message}`);
      throw new InternalServerErrorException('Unable to initialize storage bucket');
    }

    this.logger.log(`Ensured Supabase bucket "${this.bucket}" exists (private).`);
  }

  private async listFilesRecursively(prefix = ''): Promise<StoredObject[]> {
    const stack: string[] = [prefix];
    const files: StoredObject[] = [];
    const pageSize = 100;

    while (stack.length) {
      const currentPrefix = stack.pop() as string;
      let offset = 0;

      while (true) {
        const { data, error } = await supabase.storage
          .from(this.bucket)
          .list(currentPrefix, {
            limit: pageSize,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          });

        if (error) {
          this.logger.error(
            `Failed to list objects for prefix ${currentPrefix}: ${error.message}`,
          );
          throw new InternalServerErrorException('Unable to list storage objects');
        }

        if (!data || data.length === 0) {
          break;
        }

        for (const entry of data) {
          const path = currentPrefix
            ? `${currentPrefix}/${entry.name}`
            : entry.name;

          // Folders have empty metadata; files carry metadata with size/mimetype
          const isFolder = !entry.metadata;

          if (isFolder) {
            stack.push(path);
          } else {
            files.push({
              path,
              createdAt: entry.created_at ? new Date(entry.created_at) : undefined,
            });
          }
        }

        if (data.length < pageSize) {
          break;
        }

        offset += pageSize;
      }
    }

    return files;
  }

  private extractDateFromPath(path: string): Date | undefined {
    // Expected format: companyId/userId/YYYY/MM/DD/type.jpg
    const segments = path.split('/');
    if (segments.length < 6) {
      return undefined;
    }

    const [companyId, userId, year, month, day] = segments;
    if (!companyId || !userId || !year || !month || !day) {
      return undefined;
    }

    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
