import { ApiProperty } from '@nestjs/swagger';

export class BoardJobDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: string;
  @ApiProperty() status!: string;
  @ApiProperty() version!: number;
  @ApiProperty() plate!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty({ type: [String] }) technicianNames!: string[];
  @ApiProperty({ description: 'The caller may move this car between bays' }) canPlace!: boolean;
}

export class BayDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'B1' }) code!: string;
  @ApiProperty({ example: 'Bay 1' }) name!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ type: BoardJobDto, nullable: true, description: 'The car on the bay now' })
  job!: BoardJobDto | null;
}

export class BayBoardDto {
  @ApiProperty() branchId!: string;
  @ApiProperty({ description: 'Managers may add, rename and deactivate bays' }) canManage!: boolean;
  @ApiProperty({ type: [BayDto], description: 'By code; inactive bays only for managers' }) bays!: BayDto[];
  @ApiProperty({ type: [BoardJobDto], description: 'Open jobs without a bay, oldest first' })
  waiting!: BoardJobDto[];
}

export class CreateBayDto {
  @ApiProperty({ example: 'B1' }) code!: string;
  @ApiProperty({ example: 'Bay 1' }) name!: string;
}
export class UpdateBayDto {
  @ApiProperty() version!: number;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;
}
export class PlaceJobBayDto {
  @ApiProperty() version!: number;
  @ApiProperty({ nullable: true, type: String, description: 'null releases the bay' }) bayId!: string | null;
}
