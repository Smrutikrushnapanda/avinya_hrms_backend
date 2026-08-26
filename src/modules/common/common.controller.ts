import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Query,
  Get,
  BadRequestException,
  InternalServerErrorException,
  UseGuards,
  Res,
} from '@nestjs/common';
import * as multer from 'multer';
import { memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiQuery,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { Common } from './common.service';
import { Express } from 'express';
import { DateTime } from 'luxon';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

@ApiTags('Common')
@Controller('common')
@UseGuards(JwtAuthGuard)
export class CommonController {
  constructor(private readonly commonService: Common) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        path: {
          type: 'string',
          example: 'avatars',
        },
        public: {
          type: 'string',
          example: 'true',
        },
      },
    },
  })
  @ApiQuery({
    name: 'path',
    required: false,
    description: 'Folder path to store file',
  })
  @ApiQuery({
    name: 'public',
    required: false,
    description: 'Whether the file is public (true/false)',
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    schema: { example: { url: 'https://your-bucket/avatars/123-file.png' } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_SIZE },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('path') path: string,
    @Query('public') isPublic: string,
    @Res() res: any,
  ) {
    if (!file) {
      return res.status(400).json({ message: 'File is required' });
    }

    try {
      const destination = `${path || 'uploads'}/${Date.now()}-${file.originalname}`;
      const url = await this.commonService.uploadFile(
        file.buffer,
        destination,
        file.mimetype,
        isPublic !== 'false',
      );
      return res.status(201).json({ url });
    } catch (err: any) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            message: `File size exceeds the maximum limit of ${(MAX_UPLOAD_SIZE / (1024 * 1024)).toFixed(2)}MB. Please compress the file and try again.`,
          });
        }
      }
      throw new InternalServerErrorException('File upload failed');
    }
  }

  @Get('time/now')
  @ApiOperation({ summary: 'Get current server time in IST' })
  @ApiResponse({
    status: 200,
    description: 'Current server time in ISO and formatted string',
    schema: {
      example: {
        isoTime: '2025-08-19T11:25:30.123+05:30',
        formatted: '19-08-2025 11:25:30',
      },
    },
  })
  getServerTime() {
    const ist = DateTime.now().setZone('Asia/Kolkata');
    return {
      isoTime: ist.toISO(),
      formatted: ist.toFormat('dd-LL-yyyy HH:mm:ss'),
    };
  }
}
