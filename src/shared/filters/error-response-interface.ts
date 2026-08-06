export interface ErrorResponse {
  success: false;
  statusCode: number;
  message: string | string[];
  errorCode?: string;
  path: string;
  timestamp: string;
}
