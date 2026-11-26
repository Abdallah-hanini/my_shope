import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  createCustomerSchema,
  createVehicleSchema,
  updateCustomerSchema,
  updateVehicleSchema,
  type CreateCustomerInput,
  type CreateVehicleInput,
  type UpdateCustomerInput,
  type UpdateVehicleInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  CreateCustomerDto,
  CreateVehicleDto,
  CustomerDetailDto,
  CustomerDto,
  UpdateCustomerDto,
  UpdateVehicleDto,
  VehicleDto,
} from './crm.dto';
import { CrmService } from './crm.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@ApiTags('customers')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('customers')
  @RequirePermission('crm.customer.read')
  @ApiOperation({
    operationId: 'listCustomers',
    summary: 'Customers by name (200); q matches name, phone or email',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ type: [CustomerDto] })
  listCustomers(@CurrentScope() scope: CompanyScope, @Query('q') q?: string): Promise<CustomerDto[]> {
    return this.crm.listCustomers(scope, q?.slice(0, 100));
  }

  @Get('customers/:customerId')
  @RequirePermission('crm.customer.read')
  @ApiParam({ name: 'customerId', format: 'uuid' })
  @ApiOperation({ operationId: 'getCustomer' })
  @ApiOkResponse({ type: CustomerDetailDto })
  getCustomer(
    @CurrentScope() scope: CompanyScope,
    @Param('customerId', id404) id: string,
  ): Promise<CustomerDetailDto> {
    return this.crm.getCustomer(scope, id);
  }

  @Post('customers')
  @RequirePermission('crm.customer.manage')
  @ApiOperation({ operationId: 'createCustomer' })
  @ApiBody({ type: CreateCustomerDto })
  @ApiCreatedResponse({ type: CustomerDto })
  createCustomer(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createCustomerSchema)) body: CreateCustomerInput,
    @RequestId() requestId?: string,
  ): Promise<CustomerDto> {
    return this.crm.createCustomer(scope, body, { actorUserId: p.userId, requestId });
  }

  @Patch('customers/:customerId')
  @RequirePermission('crm.customer.manage')
  @ApiParam({ name: 'customerId', format: 'uuid' })
  @ApiOperation({ operationId: 'updateCustomer' })
  @ApiBody({ type: UpdateCustomerDto })
  @ApiOkResponse({ type: CustomerDto })
  updateCustomer(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('customerId', id404) id: string,
    @Body(new ZodPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @RequestId() requestId?: string,
  ): Promise<CustomerDto> {
    return this.crm.updateCustomer(scope, id, body, { actorUserId: p.userId, requestId });
  }

  @Get('vehicles')
  @RequirePermission('crm.customer.read')
  @ApiOperation({
    operationId: 'listVehicles',
    summary: 'Vehicles by plate (200); q matches plate, VIN, make, model or owner',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ type: [VehicleDto] })
  listVehicles(@CurrentScope() scope: CompanyScope, @Query('q') q?: string): Promise<VehicleDto[]> {
    return this.crm.listVehicles(scope, q?.slice(0, 100));
  }

  @Get('vehicles/:vehicleId')
  @RequirePermission('crm.customer.read')
  @ApiParam({ name: 'vehicleId', format: 'uuid' })
  @ApiOperation({ operationId: 'getVehicle' })
  @ApiOkResponse({ type: VehicleDto })
  getVehicle(
    @CurrentScope() scope: CompanyScope,
    @Param('vehicleId', id404) id: string,
  ): Promise<VehicleDto> {
    return this.crm.getVehicle(scope, id);
  }

  @Post('vehicles')
  @RequirePermission('crm.customer.manage')
  @ApiOperation({ operationId: 'createVehicle' })
  @ApiBody({ type: CreateVehicleDto })
  @ApiCreatedResponse({ type: VehicleDto })
  createVehicle(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createVehicleSchema)) body: CreateVehicleInput,
    @RequestId() requestId?: string,
  ): Promise<VehicleDto> {
    return this.crm.createVehicle(scope, body, { actorUserId: p.userId, requestId });
  }

  @Patch('vehicles/:vehicleId')
  @RequirePermission('crm.customer.manage')
  @ApiParam({ name: 'vehicleId', format: 'uuid' })
  @ApiOperation({ operationId: 'updateVehicle' })
  @ApiBody({ type: UpdateVehicleDto })
  @ApiOkResponse({ type: VehicleDto })
  updateVehicle(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('vehicleId', id404) id: string,
    @Body(new ZodPipe(updateVehicleSchema)) body: UpdateVehicleInput,
    @RequestId() requestId?: string,
  ): Promise<VehicleDto> {
    return this.crm.updateVehicle(scope, id, body, { actorUserId: p.userId, requestId });
  }
}
