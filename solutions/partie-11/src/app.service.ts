import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // 8.12 : combien de fois la route lente est allée au bout de son travail.
  travauxTermines = 0;

  getHello(): string {
    return 'Hello World!';
  }
}
