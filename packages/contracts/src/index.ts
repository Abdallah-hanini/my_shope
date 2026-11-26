import type { components, paths } from './generated';

export type { components, operations, paths } from './generated';

export type Schemas = components['schemas'];
export type HealthReport = Schemas['HealthReportDto'];
export type LivenessReport = Schemas['LivenessDto'];
export type ProblemDetails = Schemas['ProblemDetailsDto'];
export type DependencyStatus = HealthReport['checks'][number];

export type Me = Schemas['MeDto'];
export type Company = Schemas['CompanyDto'];
export type Branch = Schemas['BranchDto'];
export type Role = Schemas['RoleDto'];
export type RoleAssignment = Schemas['RoleAssignmentDto'];
export type Account = Schemas['AccountDto'];
export type FiscalPeriod = Schemas['FiscalPeriodDto'];
export type Journal = Schemas['JournalDto'];
export type JournalLine = Schemas['JournalLineDto'];
export type JournalPage = Schemas['JournalPageDto'];
export type AuditEvent = Schemas['AuditEventDto'];
export type AuditEventPage = Schemas['AuditEventPageDto'];
export type FinancialSummary = Schemas['FinancialSummaryDto'];
export type StaffMember = Schemas['StaffMemberDto'];
export type StaffCreated = Schemas['StaffCreatedDto'];
export type TrialBalance = Schemas['TrialBalanceDto'];
export type GeneralLedger = Schemas['GeneralLedgerDto'];
export type SearchResult = Schemas['SearchResultDto'];
export type ExportJob = Schemas['ExportJobDto'];
export type Notification = Schemas['NotificationDto'];
export type NotificationPage = Schemas['NotificationPageDto'];
export type Customer = Schemas['CustomerDto'];
export type CustomerDetail = Schemas['CustomerDetailDto'];
export type Vehicle = Schemas['VehicleDto'];
export type JobCard = Schemas['JobCardDto'];
export type JobListItem = Schemas['JobListItemDto'];
export type Technician = Schemas['TechnicianDto'];
export type Appointment = Schemas['AppointmentDto'];
export type AppointmentDay = Schemas['AppointmentDayDto'];
export type WorkshopSchedule = Schemas['WorkshopScheduleDto'];
export type LabourReport = Schemas['LabourReportDto'];
export type CurrentClock = Schemas['CurrentClockDto'];
export type TimeEntry = Schemas['TimeEntryDto'];
export type JobAddition = Schemas['JobAdditionDto'];
export type BayBoard = Schemas['BayBoardDto'];
export type TaxSetup = Schemas['TaxSetupDto'];
export type Pricing = Schemas['PricingDto'];
export type CompanyProfile = Schemas['CompanyProfileDto'];

/** Every path the API publishes, for compile-time checks in clients. */
export type ApiPath = keyof paths;
