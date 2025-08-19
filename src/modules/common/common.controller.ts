import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Query,
  Get,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Common } from './common.service';
import { Express } from 'express';
import { DateTime } from 'luxon';

@ApiTags('Common')
@Controller('common')
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
  @ApiQuery({ name: 'path', required: false, description: 'Folder path to store file' })
  @ApiQuery({ name: 'public', required: false, description: 'Whether the file is public (true/false)' })
  @ApiResponse({ status: 201, description: 'File uploaded successfully', schema: { example: { url: 'https://your-bucket/avatars/123-file.png' } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('path') path: string,
    @Query('public') isPublic: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    try {
      const destination = `${path || 'uploads'}/${Date.now()}-${file.originalname}`;
      const url = await this.commonService.uploadFile(
        file.buffer,
        destination,
        file.mimetype,
        isPublic !== 'false',
      );
      return { url };
    } catch (err) {
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