import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service.js';
import { DelaiMaximalInterceptor } from './commun/delai-maximal.interceptor.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
}
