import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';

// 11.2 : sans ce filtre, une exception d'un gateway n'arrive jamais dans l'accusé de réception : le client
// attend pour rien (et ToutesExceptionsFilter, le filtre HTTP de la partie 8, n'est pas appelé ici).
@Catch()
export class ErreursWsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErreursWs');

  catch(exception: unknown, hote: ArgumentsHost) {
    let erreur: string | string[] = 'Erreur interne du serveur';
    if (exception instanceof HttpException) {
      const corps = exception.getResponse();
      erreur = typeof corps === 'string' ? corps : ((corps as { message?: string | string[] }).message ?? exception.message);
    } else if (exception instanceof WsException) {
      erreur = String(exception.getError());
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    // Pour un gateway : le socket, la donnée, l'accusé de réception (s'il y en a un), le nom de l'événement.
    const ack = hote.getArgByIndex(2);
    if (typeof ack === 'function') ack({ ok: false, erreur });
  }
}
