import { Module } from '@nestjs/common';
import { IamController } from './iam.controller';
import { IamService } from './iam.service';
import { StaffService } from './staff.service';

@Module({ controllers: [IamController], providers: [IamService, StaffService] })
export class IamModule {}
