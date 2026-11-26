import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['individual', 'company'] }) kind!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) email!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: string;
  @ApiProperty() version!: number;
  @ApiProperty() vehicleCount!: number;
}

export class VehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() plate!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) vin!: string | null;
  @ApiProperty() make!: string;
  @ApiProperty() model!: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) year!: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) color!: string | null;
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: string;
  @ApiProperty() version!: number;
}

export class CustomerDetailDto extends CustomerDto {
  @ApiProperty({ type: [VehicleDto] }) vehicles!: VehicleDto[];
}

export class CreateCustomerDto {
  @ApiPropertyOptional({ enum: ['individual', 'company'] }) kind?: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr?: string | null;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) email?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) notes?: string | null;
}
export class UpdateCustomerDto extends CreateCustomerDto {
  @ApiProperty() version!: number;
}

export class CreateVehicleDto {
  @ApiProperty() customerId!: string;
  @ApiProperty() plate!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: '17 characters, no I/O/Q' }) vin?:
    | string
    | null;
  @ApiProperty() make!: string;
  @ApiProperty() model!: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) year?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) color?: string | null;
}
export class UpdateVehicleDto extends CreateVehicleDto {
  @ApiProperty({ description: 'A different customerId records a change of owner' }) version!: number;
}
