import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as multer from 'multer';

@Injectable()
export class MulterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MulterMiddleware.name);
  private upload: multer.Multer;

  constructor() {
    // Configurar multer para processar arquivos
    this.upload = multer({
      storage: multer.memoryStorage(), // Armazenar em memória
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB por arquivo
        files: 10, // Máximo 10 arquivos
        fields: 50, // Máximo 50 campos de texto
        fieldNameSize: 100, // Máximo 100 chars para nome do campo
        fieldSize: 1 * 1024 * 1024, // 1MB para campos de texto
      },
      fileFilter: (req, file, cb) => {
        this.logger.debug(
          `Processando arquivo: ${file.originalname} (${file.mimetype})`,
        );

        // Lista de tipos MIME permitidos
        const allowedMimeTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          this.logger.warn(`Tipo de arquivo rejeitado: ${file.mimetype}`);
          const error = new Error(
            `Tipo de arquivo não permitido: ${file.mimetype}`,
          );
          cb(error as any, false);
        }
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    const contentType = req.headers['content-type'] || '';

    // Só processar se for multipart/form-data
    if (!contentType.includes('multipart/form-data')) {
      return next();
    }

    this.logger.debug('Processando requisição multipart/form-data');

    // Usar multer para processar os arquivos
    this.upload.any()(req, res, (err) => {
      if (err) {
        this.logger.error(`Erro no upload: ${err.message}`);

        // Tratar diferentes tipos de erro do multer
        if (err instanceof multer.MulterError) {
          let errorMessage = 'Erro no upload do arquivo';
          let statusCode = 400;

          switch (err.code) {
            case 'LIMIT_FILE_SIZE':
              errorMessage = 'Arquivo muito grande. Tamanho máximo: 5MB';
              break;
            case 'LIMIT_FILE_COUNT':
              errorMessage = 'Muitos arquivos. Máximo permitido: 10';
              break;
            case 'LIMIT_FIELD_COUNT':
              errorMessage = 'Muitos campos. Máximo permitido: 50';
              break;
            case 'LIMIT_UNEXPECTED_FILE':
              errorMessage = 'Campo de arquivo inesperado';
              break;
            default:
              errorMessage = `Erro no upload: ${err.message}`;
          }

          return res.status(statusCode).json({
            error: 'Erro de upload',
            message: errorMessage,
            code: err.code,
          });
        }

        // Outros erros
        return res.status(400).json({
          error: 'Erro de upload',
          message: err.message,
        });
      }

      // Log dos arquivos processados
      const files = (req as any).files || [];
      if (files.length > 0) {
        this.logger.log(`${files.length} arquivo(s) processado(s) com sucesso`);
        files.forEach((file: any, index: number) => {
          this.logger.debug(
            `Arquivo ${index + 1}: ${file.originalname} (${file.size} bytes)`,
          );
        });
      }

      // Log dos campos de texto
      const fieldCount = Object.keys(req.body || {}).length;
      if (fieldCount > 0) {
        this.logger.debug(`${fieldCount} campo(s) de texto processado(s)`);
      }

      next();
    });
  }
}
