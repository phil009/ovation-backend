import { PartialType } from '@nestjs/swagger';
import { CreateAwardeeDto } from './create-awardee.dto.js';

export class UpdateAwardeeDto extends PartialType(CreateAwardeeDto) {}
