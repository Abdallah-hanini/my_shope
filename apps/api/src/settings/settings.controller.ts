import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  addLabourRateSchema,
  addTaxRateSchema,
  companyProfileSchema,
  createTaxCodeSchema,
  LOGO_LIMITS,
  pricingSettingsSchema,
  taxSettingsSchema,
  updateTaxCodeSchema,
  type AddLabourRateInput,
  type AddTaxRateInput,
  type CompanyProfileInput,
  type CreateTaxCodeInput,
  type PricingSettingsInput,
  type TaxSettingsInput,
  type UpdateTaxCodeInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  AddLabourRateDto,
  AddTaxRateDto,
  CompanyProfileDto,
  CreateTaxCodeDto,
  PricingDto,
  PricingSettingsDto,
  TaxSettingsDto,
  TaxSetupDto,
  UpdateCompanyProfileDto,
  UpdateTaxCodeDto,
} from './settings.dto';
import { SettingsService } from './settings.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/**
 * Pricing settings (D-05). Reading: anyone in the company (tax, letterhead) or in the workshop
 * (labour rates). Changing: accounting.tax.manage (tax), workshop.pricing.manage (rates, discount
 * limit), org.company.manage (letterhead); checked by the service, company-wide where it applies.
 */
@ApiTags('settings')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // ── tax ──
  @Get('tax')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'getTaxSetup', summary: 'Tax codes with dated rates, and the tax settings' })
  @ApiOkResponse({ type: TaxSetupDto })
  tax(@CurrentScope() s: CompanyScope, @CurrentPrincipal() p: Principal): Promise<TaxSetupDto> {
    return this.settings.tax(s, p);
  }

  @Put('tax/settings')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'setTaxSettings' })
  @ApiBody({ type: TaxSettingsDto })
  @ApiOkResponse({ type: TaxSetupDto })
  setTax(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(taxSettingsSchema)) b: TaxSettingsInput,
    @RequestId() rid?: string,
  ): Promise<TaxSetupDto> {
    return this.settings.setTaxSettings(s, p, b, ctxOf(p, rid));
  }

  @Post('tax/codes')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'createTaxCode' })
  @ApiBody({ type: CreateTaxCodeDto })
  @ApiCreatedResponse({ type: TaxSetupDto })
  createCode(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createTaxCodeSchema)) b: CreateTaxCodeInput,
    @RequestId() rid?: string,
  ): Promise<TaxSetupDto> {
    return this.settings.createTaxCode(s, p, b, ctxOf(p, rid));
  }

  @Patch('tax/codes/:taxCodeId')
  @RequirePermission('org.company.read')
  @ApiParam({ name: 'taxCodeId', format: 'uuid' })
  @ApiOperation({ operationId: 'updateTaxCode' })
  @ApiBody({ type: UpdateTaxCodeDto })
  @ApiOkResponse({ type: TaxSetupDto })
  updateCode(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('taxCodeId', id404) id: string,
    @Body(new ZodPipe(updateTaxCodeSchema)) b: UpdateTaxCodeInput,
    @RequestId() rid?: string,
  ): Promise<TaxSetupDto> {
    return this.settings.updateTaxCode(s, p, id, b, ctxOf(p, rid));
  }

  @Post('tax/codes/:taxCodeId/rates')
  @RequirePermission('org.company.read')
  @ApiParam({ name: 'taxCodeId', format: 'uuid' })
  @ApiOperation({ operationId: 'addTaxRate', summary: 'A rate from a date onwards (today or later)' })
  @ApiBody({ type: AddTaxRateDto })
  @ApiCreatedResponse({ type: TaxSetupDto })
  addRate(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('taxCodeId', id404) id: string,
    @Body(new ZodPipe(addTaxRateSchema)) b: AddTaxRateInput,
    @RequestId() rid?: string,
  ): Promise<TaxSetupDto> {
    return this.settings.addTaxRate(s, p, id, b, ctxOf(p, rid));
  }

  @Delete('tax/codes/:taxCodeId/rates/:rateId')
  @RequirePermission('org.company.read')
  @ApiParam({ name: 'taxCodeId', format: 'uuid' })
  @ApiParam({ name: 'rateId', format: 'uuid' })
  @ApiOperation({ operationId: 'removeTaxRate', summary: 'Remove a rate that has not started yet' })
  @ApiOkResponse({ type: TaxSetupDto })
  removeRate(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('taxCodeId', id404) id: string,
    @Param('rateId', id404) rateId: string,
    @RequestId() rid?: string,
  ): Promise<TaxSetupDto> {
    return this.settings.removeTaxRate(s, p, id, rateId, ctxOf(p, rid));
  }

  // ── labour rates and discount limit ──
  @Get('pricing')
  @RequirePermission('workshop.job.read')
  @ApiOperation({ operationId: 'getPricing', summary: 'Labour rates per branch and the discount limit' })
  @ApiOkResponse({ type: PricingDto })
  pricing(@CurrentScope() s: CompanyScope, @CurrentPrincipal() p: Principal): Promise<PricingDto> {
    return this.settings.pricing(s, p);
  }

  @Put('pricing/settings')
  @RequirePermission('workshop.job.read')
  @ApiOperation({ operationId: 'setPricingSettings' })
  @ApiBody({ type: PricingSettingsDto })
  @ApiOkResponse({ type: PricingDto })
  setPricing(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(pricingSettingsSchema)) b: PricingSettingsInput,
    @RequestId() rid?: string,
  ): Promise<PricingDto> {
    return this.settings.setPricingSettings(s, p, b, ctxOf(p, rid));
  }

  @Post('branches/:branchId/labour-rates')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOperation({ operationId: 'addLabourRate', summary: 'A rate per hour from a date onwards' })
  @ApiBody({ type: AddLabourRateDto })
  @ApiCreatedResponse({ type: PricingDto })
  addLabourRate(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('branchId', id404) branchId: string,
    @Body(new ZodPipe(addLabourRateSchema)) b: AddLabourRateInput,
    @RequestId() rid?: string,
  ): Promise<PricingDto> {
    return this.settings.addLabourRate(s, p, branchId, b, ctxOf(p, rid));
  }

  @Delete('labour-rates/:rateId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'rateId', format: 'uuid' })
  @ApiOperation({ operationId: 'removeLabourRate', summary: 'Remove a rate that has not started yet' })
  @ApiOkResponse({ type: PricingDto })
  removeLabourRate(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('rateId', id404) rateId: string,
    @RequestId() rid?: string,
  ): Promise<PricingDto> {
    return this.settings.removeLabourRate(s, p, rateId, ctxOf(p, rid));
  }

  // ── letterhead ──
  @Get('profile')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'getCompanyProfile', summary: 'Letterhead details' })
  @ApiOkResponse({ type: CompanyProfileDto })
  profile(@CurrentScope() s: CompanyScope, @CurrentPrincipal() p: Principal): Promise<CompanyProfileDto> {
    return this.settings.profile(s, p);
  }

  @Put('profile')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'setCompanyProfile' })
  @ApiBody({ type: UpdateCompanyProfileDto })
  @ApiOkResponse({ type: CompanyProfileDto })
  setProfile(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(companyProfileSchema)) b: CompanyProfileInput,
    @RequestId() rid?: string,
  ): Promise<CompanyProfileDto> {
    return this.settings.setProfile(s, p, b, ctxOf(p, rid));
  }

  @Put('profile/logo')
  @HttpCode(200)
  @RequirePermission('org.company.read')
  @ApiOperation({
    operationId: 'setCompanyLogo',
    summary: 'Upload the logo (JPEG, PNG or WebP; stored as PNG)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({ type: CompanyProfileDto })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: LOGO_LIMITS.maxBytes, files: 1, fields: 0 } }),
  )
  setLogo(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @RequestId() rid?: string,
  ): Promise<CompanyProfileDto> {
    return this.settings.setLogo(s, p, file?.buffer, ctxOf(p, rid));
  }

  @Delete('profile/logo')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'removeCompanyLogo' })
  @ApiOkResponse({ type: CompanyProfileDto })
  removeLogo(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @RequestId() rid?: string,
  ): Promise<CompanyProfileDto> {
    return this.settings.removeLogo(s, p, ctxOf(p, rid));
  }

  @Get('profile/logo')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'getCompanyLogo' })
  @ApiProduces('image/png')
  @ApiOkResponse({ description: 'PNG image', schema: { type: 'string', format: 'binary' } })
  async logo(@CurrentScope() s: CompanyScope, @Res() res: Response): Promise<void> {
    const bytes = await this.settings.logo(s);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.end(bytes);
  }
}
