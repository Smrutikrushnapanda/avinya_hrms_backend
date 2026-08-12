import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import * as dotenv from 'dotenv';

dotenv.config();
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Enable cookie parser
  app.use(cookieParser());

  // CORS: allow the production web origin, local dev origins, and
  // requests without an Origin header (native mobile, desktop, curl).
  const allowedOrigins = [
    'https://avinyahrms.duckdns.org',
    'http://avinyahrms.duckdns.org',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, x-user-cookie',
    credentials: false,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Avinya HRMS API')
    .setDescription('Avinya HRMS API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Start server
  await app.listen(process.env.PORT || 8080, '0.0.0.0');

  console.log(
    `Server running on: http://localhost:${process.env.PORT || 8080}`,
  );
  console.log(
    `Swagger docs: http://localhost:${process.env.PORT || 8080}/docs`,
  );
}

bootstrap();
