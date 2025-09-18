// src/infrastructure/adapters/vpn-checker.adapter.ts
import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';

@Injectable()
export class VpnCheckerAdapter {
  private readonly logger = new Logger(VpnCheckerAdapter.name);
  private lastCheckResult: boolean = false;
  private lastCheckTime: number = 0;
  private readonly CHECK_INTERVAL = 30000; // 30 segundos
  private readonly VPN_IP = '10.255.1.1'; // IP da VPN COGEL

  async isVpnConnected(): Promise<boolean> {
    const now = Date.now();

    // Evitar verificações frequentes demais
    if (now - this.lastCheckTime < this.CHECK_INTERVAL) {
      return this.lastCheckResult;
    }

    this.lastCheckTime = now;
    this.lastCheckResult = await this.checkVpnConnection();
    return this.lastCheckResult;
  }

  private async checkVpnConnection(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // Para Windows (FortiClient)
      if (process.platform === 'win32') {
        exec(
          'ipconfig | findstr "10.255.1.1|FortiSSL|VPN"',
          (error, stdout) => {
            if (error) {
              this.logger.warn('VPN não detectada: erro ao executar comando');
              resolve(false);
              return;
            }

            if (stdout && stdout.trim().length > 0) {
              this.logger.log(`VPN detectada: ${stdout.trim()}`);
              resolve(true);
            } else {
              this.logger.warn(
                'VPN não detectada: nenhuma informação encontrada',
              );
              resolve(false);
            }
          },
        );
      }
      // Para Linux
      else if (process.platform === 'linux') {
        exec(
          'ip addr | grep -E "10.255.1.1|tun[0-9]|ppp[0-9]"',
          (error, stdout) => {
            if (error) {
              this.logger.warn('VPN não detectada: erro ao executar comando');
              resolve(false);
              return;
            }

            if (stdout && stdout.trim().length > 0) {
              this.logger.log(`VPN detectada: ${stdout.trim()}`);
              resolve(true);
            } else {
              this.logger.warn(
                'VPN não detectada: nenhuma informação encontrada',
              );
              resolve(false);
            }
          },
        );
      }
      // Para outros sistemas
      else {
        this.logger.warn(
          'Verificação de VPN não implementada para este sistema operacional',
        );
        resolve(false);
      }
    });
  }

  async testVpnConnection(): Promise<{
    connected: boolean;
    details: string;
  }> {
    let details = '';
    let connected = false;

    try {
      // Testa conexão pela rota
      const routeCheck = await new Promise<string>((resolve) => {
        const command =
          process.platform === 'win32'
            ? 'route print | findstr 10.255.1.1'
            : 'ip route | grep 10.255.1.1';

        exec(command, (error, stdout) => {
          if (error || !stdout || stdout.trim().length === 0) {
            resolve('Rota para servidor VPN (10.255.1.1) não encontrada');
          } else {
            resolve(`Rota para servidor VPN encontrada: ${stdout.trim()}`);
            connected = true;
          }
        });
      });

      details += routeCheck + '\n';

      // Testa conexão pelo adaptador
      const adapterCheck = await new Promise<string>((resolve) => {
        const command =
          process.platform === 'win32'
            ? 'ipconfig | findstr "FortiSSL|VPN|Fortinet"'
            : 'ip addr | grep -E "tun[0-9]|ppp[0-9]"';

        exec(command, (error, stdout) => {
          if (error || !stdout || stdout.trim().length === 0) {
            resolve('Nenhum adaptador VPN encontrado');
          } else {
            resolve(`Adaptador VPN encontrado: ${stdout.trim()}`);
            connected = true;
          }
        });
      });

      details += adapterCheck + '\n';

      // Testa ping para o servidor VPN
      const pingCheck = await new Promise<string>((resolve) => {
        const command =
          process.platform === 'win32'
            ? 'ping -n 1 10.255.1.1'
            : 'ping -c 1 10.255.1.1';

        exec(command, (error, stdout) => {
          if (error) {
            resolve('Ping para servidor VPN falhou');
          } else {
            resolve(`Ping para servidor VPN: ${stdout.split('\n')[1]}`);
            connected = true;
          }
        });
      });

      details += pingCheck;
    } catch (error: unknown) {
      // Extrair a mensagem de erro com segurança
      const errorMessage = this.getErrorMessage(error);
      details = `Erro ao testar conexão VPN: ${errorMessage}`;
      connected = false;
    }

    return { connected, details };
  }

  // Método auxiliar para obter mensagem de erro com segurança
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message: string }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return String(error);
  }
}
