import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { AppService } from './app.service.js';
import { DelaiMaximalInterceptor } from './commun/delai-maximal.interceptor.js';

@ApiTags('demo')
@ApiBearerAuth()
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // 8.12 : une route de démonstration qui met 200 ms, bornée à 50 ms : le client reçoit un 408, mais
  // le travail va au bout (une écriture en base aurait lieu quand même).
  @Get('api/demo/lente')
  @UseInterceptors(new DelaiMaximalInterceptor(50))
  async lente() {
    await new Promise((resoudre) => setTimeout(resoudre, 200));
    this.appService.travauxTermines++;
    return { termine: true };
  }

  @Get('api/demo/travaux')
  travaux() {
    return { termines: this.appService.travauxTermines };
  }

  // 10.12 : un long traitement qui lit la base À LA FIN : avec enableShutdownHooks(), un SIGTERM le
  // laisse aller au bout (la connexion à la base n'est fermée qu'après la dernière réponse).
  @Get('api/demo/longue')
  async longue() {
    await new Promise((resoudre) => setTimeout(resoudre, 5000));
    const [{ total }] = (await this.dataSource.query('SELECT count(*)::int AS total FROM produits')) as { total: number }[];
    return { termine: true, produits: total };
  }
}
