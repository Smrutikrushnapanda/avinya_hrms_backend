import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { CreateRegisterDto } from '../dto/register.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

export function SwaggerFindUserIdByDOB() {
  return applyDecorators(
    ApiOperation({ summary: 'Find user ID by name and DOB' }),
    ApiBody({
      schema: {
        example: {
          name: 'Alok Sahoo',
          dob: '1996-07-10',
        },
      },
    }),
    ApiResponse({ status: 200, description: 'Returns user ID if found.' }),
  );
}

export function SwaggerRegisterUser() {
  return applyDecorators(
    ApiOperation({ summary: 'Register a new user (applicant self registration)' }),
    ApiBody({
      type: CreateRegisterDto,
      examples: {
        example1: {
          summary: 'Standard Registration',
          value: {
            firstName: 'Alok',
            middleName: '',
            lastName: 'Sahoo',
            email: 'aloksahoo001@gmail.com',
            mobileNumber: '9658048235',
            dob: '1995-05-24',
            gender: 'MALE',
            organizationId: '39f4c246-622b-46e3-9c48-7ee4aa684b8d',
            mobileOtpId: 101,
            mobileOTP: 123456,
            emailOtpId: 102,
            emailOTP: 123456,
          },
        },
      },
    }),
    ApiResponse({
      status: 201,
      description: 'User registered successfully',
      schema: {
        example: {
          id: 'c5ccc12f-b750-4f3c-bfe6-cb7444bb24e5',
          userName: '9658048235',
          email: 'aloksahoo001@gmail.com',
          password: 'P4PDkSnpqeEF',
          firstName: 'Alok',
          middleName: '',
          lastName: 'Sahoo',
          dob: '1995-05-24',
          gender: 'MALE',
          mobileNumber: '9658048235',
          organization: {
            id: '39f4c246-622b-46e3-9c48-7ee4aa684b8d',
          },
          isActive: true,
          isEmailVerified: false,
          isMobileVerified: false,
          lastLoginAt: null,
          createdAt: '2025-06-14T09:46:36.046Z',
          updatedAt: '2025-06-14T09:46:36.046Z',
          mustChangePassword: false,
        },
      },
    }),
  );
}

export function SwaggerCreateUser() {
  return applyDecorators(
    ApiOperation({ summary: 'Create a user (admin)' }),
    ApiBody({ type: CreateUserDto }),
    ApiResponse({ status: 201, description: 'User created successfully' }),
  );
}

export function SwaggerGetAllUsers() {
  return applyDecorators(
    ApiOperation({ summary: 'Get all users (with pagination, search, sort)' }),
    ApiQuery({ name: 'limit', required: false, type: Number, example: 10 }),
    ApiQuery({ name: 'offset', required: false, type: Number, example: 0 }),
    ApiQuery({ name: 'search', required: false, type: String, example: 'Alok' }),
    ApiQuery({ name: 'sortField', required: false, type: String, example: 'user_name' }),
    ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'], example: 'ASC' }),
    ApiResponse({ status: 200, description: 'List of users' }),
  );
}

export function SwaggerGetUserById() {
  return applyDecorators(
    ApiOperation({ summary: 'Get user by ID' }),
    ApiParam({ name: 'user_id', required: true, type: String, example: 'user-uuid' }),
    ApiResponse({ status: 200, description: 'User details' }),
  );
}

export function SwaggerUpdateUser() {
  return applyDecorators(
    ApiOperation({ summary: 'Update user by ID' }),
    ApiParam({ name: 'user_id', required: true, type: String, example: 'user-uuid' }),
    ApiBody({ type: UpdateUserDto }),
    ApiResponse({ status: 200, description: 'User updated' }),
  );
}

export function SwaggerDeleteUser() {
  return applyDecorators(
    ApiOperation({ summary: 'Delete user by ID' }),
    ApiParam({ name: 'user_id', required: true, type: String, example: 'user-uuid' }),
    ApiResponse({ status: 200, description: 'User deleted' }),
  );
}