import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Produit } from './produit.entity.js';
import { ProduitsService } from './produits.service.js';
import { Variante } from './variante.entity.js';

describe('ProduitsService', () => {
  let service: ProduitsService;
  const produits = { count: vi.fn(), create: vi.fn(), save: vi.fn() };
  const variantes = { create: vi.fn(), save: vi.fn() };
  const config = { get: vi.fn() };
  const dto = { nom: 'Lampe', prix: 30, categorie: 'mobilier' };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProduitsService,
        { provide: getRepositoryToken(Produit), useValue: produits },
        { provide: getRepositoryToken(Variante), useValue: variantes },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(ProduitsService);
  });

  describe('creer', () => {
    it('enregistre le produit sous la limite', async () => {
      config.get.mockReturnValue(10);
      produits.count.mockResolvedValue(3);
      produits.create.mockReturnValue(dto);
      produits.save.mockImplementation(async (p) => ({ id: 4, ...p }));

      await expect(service.creer(dto)).resolves.toMatchObject({ id: 4, nom: 'Lampe' });
      expect(produits.save).toHaveBeenCalledWith(dto);
    });

    it('lève une BadRequestException à la limite, sans rien enregistrer', async () => {
      config.get.mockReturnValue(10);
      produits.count.mockResolvedValue(10);

      await expect(service.creer(dto)).rejects.toThrow(BadRequestException);
      expect(produits.save).not.toHaveBeenCalled();
    });

    it('ne compte pas les produits quand aucune limite n\'est configurée', async () => {
      config.get.mockReturnValue(undefined);
      produits.create.mockReturnValue(dto);
      produits.save.mockResolvedValue({ id: 1, ...dto });

      await expect(service.creer(dto)).resolves.toMatchObject({ id: 1 });
      expect(produits.count).not.toHaveBeenCalled();
    });
  });
});
