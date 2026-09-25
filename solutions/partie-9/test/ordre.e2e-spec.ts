import {
  ArgumentsHost,
  CallHandler,
  CanActivate,
  Catch,
  Controller,
  ExceptionFilter,
  ExecutionContext,
  Get,
  HttpException,
  INestApplication,
  Injectable,
  MiddlewareConsumer,
  Module,
  NestInterceptor,
  NestMiddleware,
  Param,
  PipeTransform,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { tap } from 'rxjs';
import request from 'supertest';

// 8.1 à 8.3 : l'ordre du cycle de vie, observé dans un module de test isolé (sans base ni jeton).
const journal: string[] = [];
const noter = (evenement: string) => journal.push(evenement);

// 8.3 : l'endroit où la requête doit échouer (`?echec=guard`…), lu par chaque couche.
let echecVoulu: string | undefined;

@Injectable()
class MiddlewareTrace implements NestMiddleware {
  use(requete: { query?: Record<string, string> }, _reponse: unknown, suivant: () => void) {
    noter('middleware');
    echecVoulu = requete.query?.echec;
    if (echecVoulu === 'middleware') throw new Error('panne du middleware');
    suivant();
  }
}

function fabriquerGarde(nom: string) {
  @Injectable()
  class Garde implements CanActivate {
    canActivate() {
      noter(`guard ${nom}`);
      // Un guard qui renvoie false : NestJS lève une ForbiddenException.
      return !(echecVoulu === 'guard' && nom === 'global');
    }
  }
  return Garde;
}

function fabriquerInterceptor(nom: string) {
  @Injectable()
  class Trace implements NestInterceptor {
    intercept(_contexte: ExecutionContext, suivant: CallHandler) {
      noter(`interceptor ${nom} : avant`);
      if (echecVoulu === 'interceptor' && nom === 'global') throw new Error('panne de l\'interceptor');
      return suivant.handle().pipe(tap(() => noter(`interceptor ${nom} : après`)));
    }
  }
  return Trace;
}

function fabriquerPipe(nom: string) {
  @Injectable()
  class Trace implements PipeTransform {
    transform(valeur: unknown) {
      noter(`pipe ${nom}`);
      if (echecVoulu === 'pipe' && nom === 'paramètre') throw new HttpException('paramètre refusé', 400);
      return valeur;
    }
  }
  return Trace;
}

@Catch(HttpException)
class FiltreTrace implements ExceptionFilter {
  catch(exception: HttpException, hote: ArgumentsHost) {
    noter('filtre');
    hote.switchToHttp().getResponse<Response>().status(exception.getStatus()).json({ message: exception.message });
  }
}

// 8.3 : un filtre global qui note la classe de l'exception reçue, et le statut qu'il renvoie.
@Catch()
class FiltreGlobal implements ExceptionFilter {
  catch(exception: unknown, hote: ArgumentsHost) {
    const statut = exception instanceof HttpException ? exception.getStatus() : 500;
    noter(`filtre global : ${(exception as object).constructor.name} ${statut}`);
    hote.switchToHttp().getResponse<Response>().status(statut).json({ statusCode: statut });
  }
}

const GardeGlobal = fabriquerGarde('global');
const GardeControleur = fabriquerGarde('contrôleur');
const GardeRoute = fabriquerGarde('route');
const InterceptorGlobal = fabriquerInterceptor('global');
const InterceptorControleur = fabriquerInterceptor('contrôleur');
const InterceptorRoute = fabriquerInterceptor('route');
const PipeGlobal = fabriquerPipe('global');
const PipeParametre = fabriquerPipe('paramètre');

@Controller('essai')
@UseGuards(GardeControleur)
@UseInterceptors(InterceptorControleur)
class EssaiController {
  @Get('ok/:id')
  @UseGuards(GardeRoute)
  @UseInterceptors(InterceptorRoute)
  ok(@Param('id', PipeParametre) id: string) {
    noter('handler');
    if (echecVoulu === 'handler') throw new Error('panne du handler');
    return { id };
  }

  @Get('erreur')
  @UseGuards(GardeRoute)
  @UseInterceptors(InterceptorRoute)
  @UseFilters(FiltreTrace)
  erreur() {
    noter('handler');
    throw new HttpException('boum', 418);
  }
}

@Module({
  controllers: [EssaiController],
  providers: [
    { provide: APP_GUARD, useClass: GardeGlobal },
    { provide: APP_INTERCEPTOR, useClass: InterceptorGlobal },
    { provide: APP_PIPE, useClass: PipeGlobal },
    { provide: APP_FILTER, useClass: FiltreGlobal },
  ],
})
class EssaiModule {
  configure(consommateur: MiddlewareConsumer) {
    consommateur.apply(MiddlewareTrace).forRoutes('*');
  }
}

describe('Le cycle de vie d\'une requête (8.1 à 8.3)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [EssaiModule] }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    journal.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  // 8.1, 8.2 : prédit avant de lancer : les guards et les « avant » du plus général au plus précis,
  // les « après » à l'envers.
  it('traverse les couches dans l\'ordre, puis remonte les interceptors à l\'envers', async () => {
    await http().get('/essai/ok/7').expect(200);
    expect(journal).toEqual([
      'middleware',
      'guard global',
      'guard contrôleur',
      'guard route',
      'interceptor global : avant',
      'interceptor contrôleur : avant',
      'interceptor route : avant',
      'pipe global',
      'pipe paramètre',
      'handler',
      'interceptor route : après',
      'interceptor contrôleur : après',
      'interceptor global : après',
    ]);
  });

  it('saute les « après » quand le handler lève une exception, et passe par le filtre', async () => {
    await http().get('/essai/erreur').expect(418);
    expect(journal).toEqual([
      'middleware',
      'guard global',
      'guard contrôleur',
      'guard route',
      'interceptor global : avant',
      'interceptor contrôleur : avant',
      'interceptor route : avant',
      'handler',
      'filtre',
    ]);
  });

  // 8.3 : où que l'erreur soit levée, le filtre global la reçoit.
  it.each([
    ['middleware', '/essai/ok/7?echec=middleware', 'Error 500'],
    ['guard', '/essai/ok/7?echec=guard', 'ForbiddenException 403'],
    ['interceptor', '/essai/ok/7?echec=interceptor', 'Error 500'],
    ['pipe', '/essai/ok/7?echec=pipe', 'HttpException 400'],
    ['handler', '/essai/ok/7?echec=handler', 'Error 500'],
    ['route inconnue', '/essai/nulle-part', 'NotFoundException 404'],
  ])('une erreur dans : %s passe par le filtre global', async (_ou, url, recu) => {
    const statut = Number(recu.split(' ')[1]);
    await http().get(url).expect(statut);
    expect(journal.at(-1)).toBe(`filtre global : ${recu}`);
  });
});
