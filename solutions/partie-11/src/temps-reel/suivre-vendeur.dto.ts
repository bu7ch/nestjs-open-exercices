import { IsInt } from 'class-validator';

// 11.2 : la donnée d'un événement vient du client : on la valide comme un corps de requête (le
// ValidationPipe global de configurerApp s'applique aussi aux gateways).
export class SuivreVendeurDto {
  @IsInt()
  vendeurId: number;
}
