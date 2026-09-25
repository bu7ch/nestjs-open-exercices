import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import type { RequeteAvecId } from './requete-id.middleware.js';

// 8.14 : un format d'erreur unique pour toute l'API ; 8.15 : les erreurs de la base traduites ici,
// une fois pour toutes ; 8.16 : un 500 ne révèle rien (le détail va au journal).
@Catch()
export class ToutesExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Erreurs');

  catch(exception: unknown, hote: ArgumentsHost) {
    const contexte = hote.switchToHttp();
    const requete = contexte.getRequest<RequeteAvecId>();
    const reponse = contexte.getResponse<Response>();
    const { statut, message } = this.decrire(exception);

    if (statut >= 500) {
      this.logger.error(`${requete.method} ${requete.originalUrl} [${requete.requeteId}]`, exception instanceof Error ? exception.stack : String(exception));
    }

    reponse.status(statut).json({
      statusCode: statut,
      message,
      chemin: requete.originalUrl,
      horodatage: new Date().toISOString(),
      requeteId: requete.requeteId,
    });
  }

  private decrire(exception: unknown): { statut: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const corps = exception.getResponse();
      const message = typeof corps === 'string' ? corps : ((corps as { message?: string | string[] }).message ?? exception.message);
      return { statut: exception.getStatus(), message };
    }
    if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: string }).code;
      if (code === '23505') return { statut: 409, message: 'Cette ressource existe déjà' };
      if (code === '23503') return { statut: 409, message: 'Cette ressource est liée à d\'autres données' };
    }
    return { statut: 500, message: 'Erreur interne du serveur' };
  }
}
