import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth-core/guards/jwt-auth.guard';
import { RolesGuard } from '../auth-core/guards/roles.guard';
import { Roles } from '../auth-core/decorators/roles.decorator';
import { GetUser } from '../auth-core/decorators/get-user.decorator';
import { EmailActor, RequestEmailService } from './request-email.service';
import { RequestEmailKind } from './entities/request-email-template.entity';
import {
  PreviewRequestEmailDto,
  SaveRequestEmailTemplateDto,
  TestRequestEmailDto,
} from './dto/request-email.dto';

@ApiTags('Application Email Configuration')
@ApiBearerAuth()
@Controller(':kind')
@UseGuards(JwtAuthGuard)
export class RequestEmailController {
  constructor(private readonly service: RequestEmailService) {}

  @Get('email-configuration')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
  @ApiOperation({
    summary:
      'List organization application email templates and supported placeholders',
  })
  list(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
  ) {
    return this.service.list(actor, kind);
  }

  @Post('email-configuration/test')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
  @ApiOperation({
    summary: 'Send a test application email using the current draft template',
  })
  sendTestEmail(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
    @Body() dto: TestRequestEmailDto,
  ) {
    return this.service.sendTestEmail(actor, kind, dto);
  }

  @Post('email-configuration')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
  create(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
    @Body() dto: SaveRequestEmailTemplateDto,
  ) {
    return this.service.save(actor, kind, dto);
  }

  @Put('email-configuration/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
  update(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveRequestEmailTemplateDto,
  ) {
    return this.service.save(actor, kind, dto, id);
  }

  @Delete('email-configuration/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
  remove(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(actor, kind, id);
  }

  @Post('email-preview/:userId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Render editable application email using authenticated employee details',
  })
  preview(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: PreviewRequestEmailDto,
  ) {
    return this.service.preview(actor, kind, userId, dto);
  }

  @Get('email-deliveries')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
  deliveries(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
  ) {
    return this.service.listDeliveries(actor, kind);
  }

  @Get('email-deliveries/by-request/:requestId')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
  @ApiOperation({ summary: 'View the submitted application email for a request' })
  deliveryForRequest(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.service.getDeliveryForRequest(actor, kind, requestId);
  }

  @Post('email-deliveries/:id/retry')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'HR', 'SUPERADMIN', 'SUPER_ADMIN', 'ORG_ADMIN')
  retry(
    @GetUser() actor: EmailActor,
    @Param('kind', new ParseEnumPipe(RequestEmailKind)) kind: RequestEmailKind,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.retry(actor, kind, id);
  }
}
