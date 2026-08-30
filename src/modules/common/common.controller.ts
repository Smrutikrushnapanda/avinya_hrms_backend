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
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { User } from '../auth-core/entities/user.entity';
import { OrganizationTimezoneService } from '../../shared/organization-timezone.service';

const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;

@ApiTags('Common')
@Controller('common')
@UseGuards(JwtAuthGuard)
export class CommonController {
  constructor(
    private readonly commonService: Common,
    private readonly timezoneService: OrganizationTimezoneService,
  ) {}

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
    @GetUser() actor: User,
    @Res() res: any,
  ) {
    if (!file) {
      return res.status(400).json({ message: 'File is required' });
    }

    try {
      const organizationId =
        (actor as any)?.organizationId || actor.organizationId;
      const destination = `${path || 'uploads'}/${Date.now()}-${file.originalname}`;
      const url = await this.commonService.uploadFile(
        file.buffer,
        destination,
        file.mimetype,
        isPublic !== 'false',
        organizationId,
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
  @ApiOperation({ summary: 'Get current server time in org timezone' })
  @ApiResponse({
    status: 200,
    description: 'Current time in the authenticated org timezone (ISO with Z)',
    schema: {
      example: {
        isoTime: '2025-08-19T11:25:30.123Z',
        formatted: '19-08-2025 11:25:30',
        timezone: 'Asia/Kolkata',
      },
    },
  })
  async getServerTime(@GetUser() actor?: User) {
    // Resolve the authenticated organization's timezone — never a hardcoded
    // Asia/Kolkata assumption. Transport is UTC ISO 8601 with Z.
    const orgId = (actor as any)?.organizationId || actor?.organizationId;
    const tz = orgId
      ? await this.timezoneService.getOrganizationTimezone(orgId)
      : 'Asia/Kolkata';
    const now = DateTime.utc();
    return {
      isoTime: now.toISO(), // UTC ISO 8601 with Z
      formatted: OrganizationTimezoneService.formatForZone(
        now.toJSDate(),
        tz,
        'dd-LL-yyyy HH:mm:ss',
      ),
      timezone: tz,
    };
  }
}
