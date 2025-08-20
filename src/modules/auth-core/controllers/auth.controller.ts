import {
  Controller,
  Post,
  Body,
  Res,
  UnauthorizedException,
  Get,
  UseGuards,
} from '@nestjs/common';
import { AuthService, UserWithRoles } from '../services/auth.service';
import { LoginDto } from '../dto/auth.dto';
import { Response } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { GetUser } from '../decorators/get-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'User login and get JWT token' })
  @ApiBody({
    type: LoginDto,
    required: true,
    examples: {
      example1: {
        summary: 'Sample Login Request',
        value: {
          userName: 'alok.sahoo@panchsofttechnologies.com',
          password: 'Ab@2025',
          clientInfo: {
            ip: '203.0.113.42',
            device: 'Windows 11 Chrome',
            location: 'Bhubaneswar, India',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'User logged in successfully',
    schema: {
      example: {
        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwODkzNjI5MS1kOGY0LTQ0MjktYWM1MS0yODc5ZWEzNGRmNDMiLCJ1c2VyTmFtZSI6ImFsb2suc2Fob29AcGFuY2hzb2Z0dGVjaG5vbG9naWVzLmNvbSIsImZpcnN0TmFtZSI6IkFsb2siLCJtaWRkbGVOYW1lIjoiIiwibGFzdE5hbWUiOiJTYWhvbyIsImdlbmRlciI6Ik1BTEUiLCJkb2IiOiIxOTk1LTA1LTI0IiwiZW1haWwiOiJhbG9rLnNhaG9vQHBhbmNoc29mdHRlY2hub2xvZ2llcy5jb20iLCJtb2JpbGVOdW1iZXIiOiI5NjU4MDQ4MjM1Iiwib3JnYW5pemF0aW9uSWQiOiIyNGZhY2QyMS0yNjVhLTRlZGQtOGZkMS1iYzY5YTAzNmY3NTUiLCJyb2xlcyI6W3siaWQiOiJlNWI3NjFmNi1kNTU3LTRkNDUtYjcyNC1hYTFiM2IyY2I5NWEiLCJyb2xlTmFtZSI6IkVNUExPWUVFIn1dLCJtdXN0Q2hhbmdlUGFzc3dvcmQiOnRydWUsImlhdCI6MTc1MjI5OTIyMSwiZXhwIjoxNzUyMzAyODIxfQ.3xusjy6rEaguYYD5s8eIlQf-CD2SfA8ibxg_R_K-gJc",
        "user": {
            "id": "08936291-d8f4-4429-ac51-2879ea34df43",
            "userName": "alok.sahoo@panchsofttechnologies.com",
            "email": "alok.sahoo@panchsofttechnologies.com",
            "password": "$2b$12$Uzo/gUA/0kBehY0YNWYfreGrPvkj7dCnp9SDQum8h3rOHcrXyqPme",
            "firstName": "Alok",
            "middleName": "",
            "lastName": "Sahoo",
            "dob": "1995-05-24",
            "gender": "MALE",
            "mobileNumber": "9658048235",
            "organization": {
                "id": "24facd21-265a-4edd-8fd1-bc69a036f755"
            },
            "isActive": true,
            "isEmailVerified": false,
            "isMobileVerified": false,
            "lastLoginAt": "2025-07-12T05:42:19.072Z",
            "createdAt": "2025-07-12T05:32:15.484Z",
            "updatedAt": "2025-07-12T05:42:19.072Z",
            "mustChangePassword": true,
            "roles": [
                {
                    "id": "e5b761f6-d557-4d45-b724-aa1b3b2cb95a",
                    "roleName": "EMPLOYEE"
                }
            ]
        }
    },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiCookieAuth()
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      loginDto.userName,
      loginDto.password,
      loginDto.clientInfo,
    );

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const { access_token } = await this.authService.login(
      user as UserWithRoles,
    );

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 1000 * 60 * 15, // 15 minutes
    });

    return { access_token, user };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and clear auth cookie' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: { example: { message: 'Logged out successfully' } },
  })
  @ApiCookieAuth()
  async logout(
    @Res({ passthrough: true }) res: Response,
    @Body() body: { userId?: string; clientInfo?: any },
  ) {
    // Step 1: Clear the auth cookie
    res.clearCookie('token');

    // Step 2: Optionally log the logout activity
    if (body?.userId) {
      await this.authService.logout(body.userId, body.clientInfo);
    }

    // Step 3: Return success response
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get logged-in user profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns user profile',
    schema: {
      example: {
        userId: 'c5ccc12f-b750-4f3c-bfe6-cb7444bb24e5',
        userName: '9658048235',
        firstName: 'Alok',
        middleName: '',
        lastName: 'Sahoo',
        gender: 'MALE',
        dob: '1995-05-24',
        email: 'aloksahoo001@gmail.com',
        mobileNumber: '9658048235',
        organizationId: '39f4c246-622b-46e3-9c48-7ee4aa684b8d',
        mustChangePassword: false,
      },
    },
  })
  @ApiBearerAuth()
  @ApiCookieAuth()
  getProfile(@GetUser() user: any) {
    return user;
  }
}
