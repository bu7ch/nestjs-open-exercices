import { BadRequestException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CommandesService } from '../commandes.service.js';
import { StatutRequis } from './statut.decorator.js';
import { StatutGuard } from './statut.guard.js';

// 8.10 : le guard appelé directement, avec un faux ExecutionContext et une fausse base.
class RoutePayee {
  @StatutRequis('payee')
  action() {}

  libre() {}
}

const contexteDe = (params: Record<string, string>, methode: () => void): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ params }) }),
    getHandler: () => methode,
    getClass: () => RoutePayee,
  }) as unknown as ExecutionContext;

describe('StatutGuard', () => {
  let guard: StatutGuard;
  const commandes = { trouverSansLignes: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [StatutGuard, { provide: CommandesService, useValue: commandes }],
    }).compile();
    guard = module.get(StatutGuard);
  });

  it('laisse passer une commande qui a le statut exigé', async () => {
    commandes.trouverSansLignes.mockResolvedValue({ id: 1, statut: 'payee' });
    await expect(guard.canActivate(contexteDe({ id: '1' }, RoutePayee.prototype.action))).resolves.toBe(true);
  });

  it('refuse avec le statut actuel dans le message', async () => {
    commandes.trouverSansLignes.mockResolvedValue({ id: 1, statut: 'en_attente' });
    await expect(guard.canActivate(contexteDe({ id: '1' }, RoutePayee.prototype.action))).rejects.toThrow(
      new ForbiddenException('Commande en_attente : il faut qu\'elle soit payee'),
    );
  });

  it('ne fait rien sur une route sans @StatutRequis', async () => {
    await expect(guard.canActivate(contexteDe({ id: '1' }, RoutePayee.prototype.libre))).resolves.toBe(true);
    expect(commandes.trouverSansLignes).not.toHaveBeenCalled();
  });

  it('refuse un identifiant qui n\'est pas un entier, avant toute requête en base', async () => {
    await expect(guard.canActivate(contexteDe({ id: 'abc' }, RoutePayee.prototype.action))).rejects.toThrow(BadRequestException);
    expect(commandes.trouverSansLignes).not.toHaveBeenCalled();
  });

  it('répond 404 quand la commande n\'existe pas', async () => {
    commandes.trouverSansLignes.mockResolvedValue(null);
    await expect(guard.canActivate(contexteDe({ id: '9' }, RoutePayee.prototype.action))).rejects.toThrow(NotFoundException);
  });
});
