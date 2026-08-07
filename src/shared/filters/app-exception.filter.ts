import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { MongoServerError } from 'mongodb';
import { ErrorResponse } from './error-response-interface';

@Catch()
export class AppExceptionsHandler implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionsHandler.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, errorCode } = this.resolveException(exception);

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} - ${Array.isArray(message) ? message.join('; ') : message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} - ${Array.isArray(message) ? message.join('; ') : message}`);
    }

    const body: ErrorResponse = {
      success: false,
      statusCode: status,
      message,
      ...(errorCode ? { errorCode } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private resolveException(exception: unknown): {
    status: number;
    message: string | string[];
    errorCode?: string;
  } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'string' ? res : ((res as { message?: string | string[] }).message ?? exception.message);
      const errorCode = typeof res === 'object' ? (res as { errorCode?: string }).errorCode : undefined;
      return { status: exception.getStatus(), message, errorCode };
    }

    if (exception instanceof MongoServerError && exception.code === 11000) {
      const field = Object.keys(exception.keyPattern ?? {})[0] ?? 'field';
      return {
        status: HttpStatus.CONFLICT,
        message: `Duplicate value for '${field}'`,
        errorCode: 'DUPLICATE_KEY',
      };
    }

    if (exception instanceof MongooseError.ValidationError) {
      const messages = Object.values(exception.errors).map((e) => e.message);
      return {
        status: HttpStatus.BAD_REQUEST,
        message: messages.join('; '),
        errorCode: 'MONGOOSE_VALIDATION_ERROR',
      };
    }

    if (exception instanceof MongooseError.CastError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Invalid ${exception.path}: '${exception.value}'`,
        errorCode: 'INVALID_ID_FORMAT',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }
}
