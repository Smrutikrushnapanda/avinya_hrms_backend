import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiResponse, UploadApiErrorResponse, v2 as cloudinary } from 'cloudinary';

/**
 * Allowed MIME types for image uploads
 */
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/**
 * Maximum file size in bytes (5MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Folder name in Cloudinary
 */
const CLOUDINARY_FOLDER = 'hrms/employees';

/**
 * DTO for upload response
 */
export class UploadResponseDto {
  url!: string;
  public_id!: string;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly configService: ConfigService) {
    this.initializeCloudinary();
  }

  /**
   * Initialize Cloudinary with credentials from environment
   */
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

    this.logger.log('Cloudinary initialized successfully');
  }

  /**
   * Validate file before upload
   */
  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: jpg, jpeg, png, webp`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds the maximum limit of 5MB`,
      );
    }
  }

  /**
   * Upload an image file to Cloudinary
   * @param file - The multer file object
   * @returns Promise<UploadResponseDto> - Contains url and public_id
   */
  async uploadImage(file: Express.Multer.File): Promise<UploadResponseDto> {
    // Validate file
    this.validateFile(file);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_FOLDER,
          resource_type: 'image',
          transformation: [
            { quality: 'auto:best' },
            { fetch_format: 'auto' },
          ],
        },
        (err: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (err) {
            this.logger.error(`Cloudinary upload failed: ${err.message}`);
            reject(
              new InternalServerErrorException(
                `Failed to upload image: ${err.message}`,
              ),
            );
            return;
          }

          if (!result) {
            this.logger.error('Cloudinary upload returned no result');
            reject(
              new InternalServerErrorException('Failed to upload image: No result returned'),
            );
            return;
          }

          this.logger.log(`Image uploaded successfully: ${result.public_id}`);

          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        },
      );

      // Write the file buffer to the upload stream
      uploadStream.end(file.buffer);
    });
  }

  /**
   * Delete an image from Cloudinary by public_id
   * @param publicId - The public ID of the image to delete
   */
  async deleteImage(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Image deleted: ${publicId}, result: ${result.result}`);
      return result.result === 'ok';
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to delete image: ${errorMessage}`);
      throw new InternalServerErrorException('Failed to delete image');
    }
  }
}

