import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as FormData from 'form-data';

interface FileInfo {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_MIMETYPES = [
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

  constructor(private configService: ConfigService) {}

  /**
   * Valida se o arquivo está dentro dos critérios permitidos
   */
  validateFile(file: FileInfo): { valid: boolean; error?: string } {
    // Verificar tamanho
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `Arquivo muito grande. Tamanho máximo permitido: ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    // Verificar tipo MIME
    if (!this.ALLOWED_MIMETYPES.includes(file.mimetype)) {
      return {
        valid: false,
        error: `Tipo de arquivo não permitido: ${file.mimetype}`,
      };
    }

    // Verificar nome do arquivo
    if (!file.originalname || file.originalname.length > 255) {
      return {
        valid: false,
        error: 'Nome do arquivo inválido ou muito longo',
      };
    }

    // Verificar extensão
    const allowedExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.pdf',
      '.txt',
      '.doc',
      '.docx',
    ];
    const fileExtension = file.originalname
      .toLowerCase()
      .substring(file.originalname.lastIndexOf('.'));

    if (!allowedExtensions.includes(fileExtension)) {
      return {
        valid: false,
        error: `Extensão de arquivo não permitida: ${fileExtension}`,
      };
    }

    return { valid: true };
  }

  /**
   * Cria FormData para envio de arquivos via proxy
   */
  createFormData(files: FileInfo[], textFields: Record<string, any>): FormData {
    const formData = new FormData();

    // Adicionar campos de texto
    Object.entries(textFields).forEach(([key, value]) => {
      if (key !== 'targetUrl') {
        // Excluir targetUrl dos campos enviados
        formData.append(key, String(value));
      }
    });

    // Adicionar arquivos
    files.forEach((file) => {
      this.logger.debug(
        `Adicionando arquivo: ${file.originalname} (${file.size} bytes)`,
      );

      formData.append(file.fieldname, file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });
    });

    return formData;
  }

  /**
   * Converte base64 para buffer de arquivo
   */
  base64ToFile(
    base64Data: string,
    filename: string,
    mimetype: string,
  ): FileInfo {
    // Remover prefixo data URL se existir
    const base64String = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64String, 'base64');

    return {
      fieldname: 'file', // Campo padrão
      originalname: filename,
      encoding: '7bit',
      mimetype: mimetype,
      buffer: buffer,
      size: buffer.length,
    };
  }

  /**
   * Processa arquivos enviados como base64 no JSON
   */
  processBase64Files(body: any): { files: FileInfo[]; cleanBody: any } {
    const files: FileInfo[] = [];
    const cleanBody = { ...body };

    // Procurar campos que podem conter base64
    Object.entries(body).forEach(([key, value]: [string, any]) => {
      if (typeof value === 'string' && this.isBase64File(value)) {
        const fileInfo = this.parseBase64File(key, value);
        if (fileInfo) {
          files.push(fileInfo);
          delete cleanBody[key]; // Remover do body JSON
        }
      } else if (typeof value === 'object' && value !== null) {
        // Procurar em objetos aninhados (ex: { file: "base64...", filename: "test.jpg" })
        if ('data' in value && 'filename' in value) {
          const fileInfo = this.parseBase64File(
            key,
            value.data,
            value.filename,
            value.mimetype,
          );
          if (fileInfo) {
            files.push(fileInfo);
            delete cleanBody[key];
          }
        }
      }
    });

    return { files, cleanBody };
  }

  /**
   * Verifica se uma string é um arquivo base64 válido
   */
  private isBase64File(value: string): boolean {
    // Verificar se é data URL ou base64 puro
    const dataUrlPattern = /^data:([^;]+);base64,/;
    const base64Pattern = /^[A-Za-z0-9+/]+=*$/;

    if (dataUrlPattern.test(value)) {
      return true;
    }

    // Verificar se é base64 puro (mínimo 100 caracteres para ser considerado arquivo)
    if (value.length > 100 && base64Pattern.test(value)) {
      return true;
    }

    return false;
  }

  /**
   * Converte string base64 em FileInfo
   */
  private parseBase64File(
    fieldName: string,
    base64Data: string,
    filename?: string,
    mimetype?: string,
  ): FileInfo | null {
    try {
      let mimeType = mimetype;
      let fileName = filename;
      let base64String = base64Data;

      // Se for data URL, extrair informações
      const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = mimeType || dataUrlMatch[1];
        base64String = dataUrlMatch[2];
      }

      // Gerar nome de arquivo se não fornecido
      if (!fileName) {
        const extension = this.getExtensionFromMimeType(
          mimeType || 'application/octet-stream',
        );
        fileName = `arquivo_${Date.now()}${extension}`;
      }

      const buffer = Buffer.from(base64String, 'base64');

      // Validar tamanho mínimo e máximo
      if (buffer.length < 10 || buffer.length > this.MAX_FILE_SIZE) {
        this.logger.warn(
          `Arquivo ${fileName} rejeitado por tamanho: ${buffer.length} bytes`,
        );
        return null;
      }

      return {
        fieldname: fieldName,
        originalname: fileName,
        encoding: 'base64',
        mimetype: mimeType || 'application/octet-stream',
        buffer: buffer,
        size: buffer.length,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Erro ao processar arquivo base64: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Retorna extensão baseada no MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        '.docx',
    };

    return mimeToExt[mimeType] || '.bin';
  }

  /**
   * Sanitiza logs de arquivo para não expor dados sensíveis
   */
  sanitizeFileLog(file: FileInfo): any {
    return {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      encoding: file.encoding,
    };
  }
}
