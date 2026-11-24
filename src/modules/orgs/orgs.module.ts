import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { InvitesController, MembersController, OrgsController } from './orgs.controller.js';
import { OrgsService } from './orgs.service.js';
import { InvitesService } from './invites.service.js';

@Module({
  imports: [AuditModule],
  controllers: [OrgsController, MembersController, InvitesController],
  providers: [OrgsService, InvitesService],
})
export class OrgsModule {}
