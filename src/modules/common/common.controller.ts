import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Common } from './common.service';
import { Express } from 'express';

@Controller('common')
export class CommonController {
  constructor(private readonly commonService: Common) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('path') path: string,
    @Query('public') isPublic: string,
  ) {
    const destination = `${path || 'uploads'}/${Date.now()}-${file.originalname}`;
    const url = await this.commonService.uploadFile(
      file.buffer,
      destination,
      file.mimetype,
      isPublic !== 'false',
    );
    return { url };
  }
}
