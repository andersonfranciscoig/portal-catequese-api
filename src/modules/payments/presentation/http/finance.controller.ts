import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

import { ApiZodBody, ApiZodQuery } from "../../../../shared/presentation/http/api-zod.js";
import { fileResponse } from "../../../../shared/presentation/http/uploaded-file.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import {
  AuthGuard,
  centerScopeFromAccess,
  CurrentAccount,
  Permission,
  PermissionsGuard,
  RequirePermissions,
  type AccessTokenClaims,
} from "../../../identity/index.js";
import { PaymentCenterForbiddenError } from "../../domain/errors.js";
import { ReadProofUseCase } from "../../application/use-cases/family-payments.use-cases.js";
import {
  DeleteBankAccountUseCase,
  GetFinanceSettingsUseCase,
  ListPaymentsUseCase,
  ReviewPaymentUseCase,
  SaveBankAccountUseCase,
  SetPriceUseCase,
} from "../../application/use-cases/finance.use-cases.js";
import {
  bankAccountSchema,
  paymentListSchema,
  priceSchema,
  purposeParam,
  rejectSchema,
  type BankAccountBody,
  type PaymentListQuery,
} from "./payments.schemas.js";

function scopeOf(account: AccessTokenClaims) {
  return centerScopeFromAccess({
    permissions: account.permissions,
    coordinationCenterId: account.coordinationCenterId,
  });
}

function listedCenter(account: AccessTokenClaims, queryCenterId?: string) {
  const scope = scopeOf(account);
  if (scope.kind === "parish") return queryCenterId;
  if (queryCenterId && queryCenterId !== scope.centerId) throw new PaymentCenterForbiddenError();
  return scope.centerId;
}

/** Menu Financeiro da coordenação: validar pagamentos, preços e contas. */
@ApiTags("Coordenação — financeiro")
@ApiBearerAuth()
@Controller("finance")
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.COORDINATION, Permission.FINANCE)
export class FinanceController {
  constructor(
    private readonly listPayments: ListPaymentsUseCase,
    private readonly review: ReviewPaymentUseCase,
    private readonly readProof: ReadProofUseCase,
    private readonly settings: GetFinanceSettingsUseCase,
    private readonly setPrice: SetPriceUseCase,
    private readonly saveAccount: SaveBankAccountUseCase,
    private readonly deleteAccount: DeleteBankAccountUseCase,
  ) {}

  @Get("payments")
  @ApiOperation({ summary: "Pagamentos (filtros) e resumo" })
  @ApiZodQuery(paymentListSchema)
  payments(
    @CurrentAccount() actor: AccessTokenClaims,
    @Query(new ZodValidationPipe(paymentListSchema)) query: PaymentListQuery,
  ) {
    return this.listPayments.execute({
      ...query,
      centerId: listedCenter(actor, query.centerId),
    });
  }

  @Get("payments/:id/proof")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  @ApiOperation({ summary: "Abre o comprovativo" })
  async proof(@Param("id", ParseUUIDPipe) id: string) {
    return fileResponse(await this.readProof.execute({ paymentId: id }));
  }

  @Post("payments/:id/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Valida o comprovativo (pago)" })
  @ApiParam({ name: "id", format: "uuid" })
  approve(@CurrentAccount() actor: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.review.execute({
      actorId: actor.accountId,
      paymentId: id,
      review: { kind: "approve" },
      scope: scopeOf(actor),
    });
  }

  @Post("payments/:id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Recusa o comprovativo (com motivo)" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(rejectSchema)
  reject(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectSchema)) body: { reason: string },
  ) {
    return this.review.execute({
      actorId: actor.accountId,
      paymentId: id,
      review: { kind: "reject", reason: body.reason },
      scope: scopeOf(actor),
    });
  }

  @Post("payments/:id/cash")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Regista o pagamento em numerário (na secretaria)" })
  @ApiParam({ name: "id", format: "uuid" })
  cash(@CurrentAccount() actor: AccessTokenClaims, @Param("id", ParseUUIDPipe) id: string) {
    return this.review.execute({
      actorId: actor.accountId,
      paymentId: id,
      review: { kind: "cash" },
      scope: scopeOf(actor),
    });
  }

  @Get("settings")
  @ApiOperation({ summary: "Preços e contas bancárias" })
  getSettings() {
    return this.settings.execute();
  }

  @Put("prices/:purpose")
  @ApiOperation({ summary: "Muda o preço da matrícula ou da confirmação" })
  @ApiParam({ name: "purpose", enum: ["ENROLLMENT", "CONFIRMATION"] })
  @ApiZodBody(priceSchema)
  price(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("purpose", new ZodValidationPipe(purposeParam)) purpose: "ENROLLMENT" | "CONFIRMATION",
    @Body(new ZodValidationPipe(priceSchema)) body: { amount: number },
  ) {
    return this.setPrice.execute({
      actorId: actor.accountId,
      purpose,
      amount: body.amount,
      scope: scopeOf(actor),
    });
  }

  @Post("bank-accounts")
  @ApiOperation({ summary: "Acrescenta uma conta bancária" })
  @ApiZodBody(bankAccountSchema)
  createAccount(
    @CurrentAccount() actor: AccessTokenClaims,
    @Body(new ZodValidationPipe(bankAccountSchema)) body: BankAccountBody,
  ) {
    return this.saveAccount.execute({ actorId: actor.accountId, data: body, scope: scopeOf(actor) });
  }

  @Put("bank-accounts/:id")
  @ApiOperation({ summary: "Atualiza uma conta bancária" })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiZodBody(bankAccountSchema)
  updateAccount(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(bankAccountSchema)) body: BankAccountBody,
  ) {
    return this.saveAccount.execute({
      actorId: actor.accountId,
      id,
      data: body,
      scope: scopeOf(actor),
    });
  }

  @Delete("bank-accounts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove uma conta bancária" })
  @ApiParam({ name: "id", format: "uuid" })
  async removeAccount(
    @CurrentAccount() actor: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.deleteAccount.execute({ actorId: actor.accountId, id, scope: scopeOf(actor) });
  }
}
