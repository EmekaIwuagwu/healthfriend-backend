import multer, { StorageEngine, FileFilterCallback } from 'multer';
import { GridFSBucket } from 'mongodb';
import { GridFsStorage } from 'multer-gridfs-storage';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { 
  MAX_FILE_SIZE, 
  ALLOWED_IMAGE_TYPES, 
  ALLOWED_DOCUMENT_TYPES, 
  ALLOWED_FILE_TYPES 
} from '../utils/constants';
import { createErrorResponse, generateFileName } from '../utils/helpers';
import { HTTP_STATUS } from '../utils/constants';

// GridFS Storage Configuration
const createGridFSStorage = (): GridFsStorage => {
  return new GridFsStorage({
    url: process.env.MONGODB_URI!,
    options: { useUnifiedTopology: true },
    file: (req: Request, file: Express.Multer.File) => {
      return new Promise((resolve, reject) => {
        crypto.randomBytes(16, (err, buf) => {
          if (err) {
            return reject(err);
          }
          
          const filename = generateFileName(file.originalname, 'healthfriend');
          const fileInfo = {
            filename: filename,
            bucketName: getBucketName(file.mimetype),
            metadata: {
              originalName: file.originalname,
              uploadedBy: (req as any).user?.id || 'anonymous',
              uploadedAt: new Date(),
              fileType: getFileType(file.mimetype),
              size: file.size
            }
          };
          
          resolve(fileInfo);
        });
      });
    }
  });
};

// Local Storage Configuration (for development)
const localStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads');
    cb(null, uploadPath);
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    const filename = generateFileName(file.originalname, 'healthfriend');
    cb(null, filename);
  }
});

// Memory Storage Configuration (for processing before saving)
const memoryStorage = multer.memoryStorage();

// File Filter Function
const fileFilter = (allowedTypes: string[] = ALLOWED_FILE_TYPES) => {
  return (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  };
};

// Get file type based on mimetype
const getFileType = (mimetype: string): string => {
  if (ALLOWED_IMAGE_TYPES.includes(mimetype)) return 'image';
  if (ALLOWED_DOCUMENT_TYPES.includes(mimetype)) return 'document';
  return 'other';
};

// Get bucket name based on file type
const getBucketName = (mimetype: string): string => {
  const fileType = getFileType(mimetype);
  switch (fileType) {
    case 'image':
      return 'images';
    case 'document':
      return 'documents';
    default:
      return 'files';
  }
};

// Storage selection based on environment
const getStorage = (): StorageEngine => {
  if (process.env.NODE_ENV === 'production') {
    return createGridFSStorage();
  } else {
    return localStorage;
  }
};

// Base upload configuration
const createUploadConfig = (options: {
  allowedTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
}) => {
  const {
    allowedTypes = ALLOWED_FILE_TYPES,
    maxFileSize = MAX_FILE_SIZE,
    maxFiles = 5
  } = options;

  return multer({
    storage: getStorage(),
    fileFilter: fileFilter(allowedTypes),
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
      fields: 10,
      fieldNameSize: 100,
      fieldSize: 1024 * 1024 // 1MB for field values
    }
  });
};

// Avatar Upload Configuration
export const avatarUpload = createUploadConfig({
  allowedTypes: ALLOWED_IMAGE_TYPES,
  maxFileSize: 2 * 1024 * 1024, // 2MB for avatars
  maxFiles: 1
}).single('avatar');

// Medical Documents Upload Configuration
export const medicalDocsUpload = createUploadConfig({
  allowedTypes: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES],
  maxFileSize: MAX_FILE_SIZE,
  maxFiles: 10
}).array('documents', 10);

// Doctor Verification Documents Upload
export const verificationDocsUpload = createUploadConfig({
  allowedTypes: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES],
  maxFileSize: MAX_FILE_SIZE,
  maxFiles: 5
}).array('verificationDocs', 5);

// Chat Attachments Upload Configuration
export const chatAttachmentsUpload = createUploadConfig({
  allowedTypes: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES],
  maxFileSize: 5 * 1024 * 1024, // 5MB for chat attachments
  maxFiles: 3
}).array('attachments', 3);

// Single File Upload Configuration
export const singleFileUpload = createUploadConfig({
  allowedTypes: ALLOWED_FILE_TYPES,
  maxFileSize: MAX_FILE_SIZE,
  maxFiles: 1
}).single('file');

// Multiple Files Upload Configuration
export const multipleFilesUpload = createUploadConfig({
  allowedTypes: ALLOWED_FILE_TYPES,
  maxFileSize: MAX_FILE_SIZE,
  maxFiles: 10
}).array('files', 10);

// Memory Upload for Processing
export const memoryUpload = multer({
  storage: memoryStorage,
  fileFilter: fileFilter(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5
  }
});

// Upload Middleware with Error Handling
export const handleUploadError = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    let statusCode = HTTP_STATUS.BAD_REQUEST;

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts in multipart data';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields in form data';
        break;
      default:
        message = err.message || 'Unknown upload error';
    }

    res.status(statusCode).json(
      createErrorResponse(message, 'FILE_UPLOAD_ERROR')
    );
    return;
  }

  if (err.message && err.message.includes('File type')) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      createErrorResponse(err.message, 'INVALID_FILE_TYPE')
    );
    return;
  }

  next(err);
};

// GridFS File Operations
export class GridFSService {
  private bucket: GridFSBucket;

  constructor(bucketName: string = 'uploads') {
    this.bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName
    });
  }

  // Upload file to GridFS
  async uploadFile(
    buffer: Buffer,
    filename: string,
    metadata: any = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.bucket.openUploadStream(filename, {
        metadata: {
          ...metadata,
          uploadedAt: new Date()
        }
      });

      uploadStream.on('error', reject);
      uploadStream.on('finish', () => {
        resolve(uploadStream.id.toString());
      });

      uploadStream.end(buffer);
    });
  }

  // Download file from GridFS
  async downloadFile(fileId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const downloadStream = this.bucket.openDownloadStream(
        new mongoose.Types.ObjectId(fileId)
      );

      downloadStream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      downloadStream.on('error', reject);
      downloadStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  // Delete file from GridFS
  async deleteFile(fileId: string): Promise<void> {
    await this.bucket.delete(new mongoose.Types.ObjectId(fileId));
  }

  // Get file info from GridFS
  async getFileInfo(fileId: string): Promise<any> {
    const files = await this.bucket
      .find({ _id: new mongoose.Types.ObjectId(fileId) })
      .toArray();
    
    return files[0] || null;
  }

  // Stream file from GridFS
  createDownloadStream(fileId: string) {
    return this.bucket.openDownloadStream(
      new mongoose.Types.ObjectId(fileId)
    );
  }

  // List files with pagination
  async listFiles(
    filter: any = {},
    skip: number = 0,
    limit: number = 10
  ): Promise<any[]> {
    return await this.bucket
      .find(filter)
      .skip(skip)
      .limit(limit)
      .toArray();
  }
}

// File serving middleware
export const serveFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fileId } = req.params;
    const { bucket = 'uploads' } = req.query;

    if (!fileId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse('File ID is required', 'VALIDATION_ERROR')
      );
      return;
    }

    const gridFS = new GridFSService(bucket as string);
    const fileInfo = await gridFS.getFileInfo(fileId);

    if (!fileInfo) {
      res.status(HTTP_STATUS.NOT_FOUND).json(
        createErrorResponse('File not found', 'NOT_FOUND')
      );
      return;
    }

    // Set appropriate headers
    res.set({
      'Content-Type': fileInfo.metadata?.mimetype || 'application/octet-stream',
      'Content-Length': fileInfo.length.toString(),
      'Content-Disposition': `inline; filename="${fileInfo.filename}"`,
      'Cache-Control': 'public, max-age=3600' // 1 hour cache
    });

    // Stream the file
    const downloadStream = gridFS.createDownloadStream(fileId);
    downloadStream.pipe(res);

    downloadStream.on('error', (error) => {
      console.error('File streaming error:', error);
      if (!res.headersSent) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createErrorResponse('Error streaming file', 'FILE_STREAM_ERROR')
        );
      }
    });

  } catch (error) {
    console.error('File serving error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse('Error serving file', 'INTERNAL_ERROR')
    );
  }
};

// Image processing middleware (for avatars, thumbnails)
export const processImage = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const file = req.file;
  
  if (!file) {
    return next();
  }

  // Add image processing logic here
  // For example, resize, compress, generate thumbnails
  // This is where you would integrate with libraries like Sharp or Jimp
  
  // For now, just pass through
  next();
};

// File cleanup middleware (delete temporary files)
export const cleanupTempFiles = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  res.on('finish', () => {
    // Clean up any temporary files if using local storage
    if (req.files) {
      const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
      files.forEach((file: any) => {
        if (file.path && process.env.NODE_ENV !== 'production') {
          // Delete temporary file in development
          const fs = require('fs');
          fs.unlink(file.path, (err: any) => {
            if (err) console.error('Error deleting temp file:', err);
          });
        }
      });
    }
  });
  
  next();
};

// File validation middleware
export const validateFileUpload = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const files = req.files;
  
  if (!files || (Array.isArray(files) && files.length === 0)) {
    res.status(HTTP_STATUS.BAD_REQUEST).json(
      createErrorResponse('No files uploaded', 'VALIDATION_ERROR')
    );
    return;
  }

  // Additional file validation can be added here
  // For example, virus scanning, content validation, etc.
  
  next();
};

// Export upload configurations for specific use cases
export const uploadConfigs = {
  avatar: avatarUpload,
  medicalDocs: medicalDocsUpload,
  verificationDocs: verificationDocsUpload,
  chatAttachments: chatAttachmentsUpload,
  singleFile: singleFileUpload,
  multipleFiles: multipleFilesUpload,
  memory: memoryUpload
};

export default {
  uploadConfigs,
  GridFSService,
  handleUploadError,
  serveFile,
  processImage,
  cleanupTempFiles,
  validateFileUpload
};