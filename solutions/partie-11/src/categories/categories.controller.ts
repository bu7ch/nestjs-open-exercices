import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service.js';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  lister() {
    return this.categories.lister();
  }
}
