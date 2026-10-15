import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";

import {
  fileResponse,
  SingleFileUpload,
  toIncoming,
  type UploadedFileData,
} from "../../../../shared/presentation/http/uploaded-file.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { AuthGuard, CurrentAccount, type AccessTokenClaims } from "../../../identity/index.js";
import {
  GetMyPaymentByCodeUseCase,
  ListActiveBankAccountsUseCase,
  ListMyPaymentsUseCase,
  ReadProofUseCase,
  SubmitProofUseCase,
} from "../../application/use-cases/family-payments.use-cases.js";
import { proofSchema } from "./payments.schemas.js";

/** Pagamentos da família: ver, transferir e enviar o comprovativo. */
@ApiTags("Pagamentos — família")
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard)
export class MyPaymentsController {
  constructor(
    private readonly list: ListMyPaymentsUseCase,
    private readonly byCode: GetMyPaymentByCodeUseCase,
    private readonly bankAccounts: ListActiveBankAccountsUseCase,
    private readonly submitProof: SubmitProofUseCase,
    private readonly readProof: ReadProofUseCase,
  ) {}

  @Get("me/payments")
  @ApiOperation({ summary: "Pagamentos das matrículas da família" })
  index(@CurrentAccount() account: AccessTokenClaims) {
    return this.list.execute({ accountId: account.accountId });
  }

  @Get("me/payments/by-enrollment/:code")
  @ApiOperation({ summary: "Pagamento de uma matrícula (pelo número)" })
  @ApiParam({ name: "code", example: "CRP-2026-48213" })
  show(@CurrentAccount() account: AccessTokenClaims, @Param("code") code: string) {
    return this.byCode.execute({ accountId: account.accountId, code });
  }

  @Get("payments/bank-accounts")
  @ApiOperation({ summary: "Contas da paróquia para transferência" })
  accounts() {
    return this.bankAccounts.execute();
  }

  @Post("me/payments/:id/proof")
  @ApiOperation({ summary: "Envia o comprovativo da transferência (PDF ou fotografia)" })
  @ApiConsumes("multipart/form-data")
  @ApiParam({ name: "id", format: "uuid" })
  @UseInterceptors(SingleFileUpload())
  proof(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(proofSchema)) body: { bankAccountId: string },
    @UploadedFile() file?: UploadedFileData,
  ) {
    return this.submitProof.execute({
      accountId: account.accountId,
      paymentId: id,
      bankAccountId: body.bankAccountId,
      file: toIncoming(file),
    });
  }

  @Get("me/payments/:id/proof")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  @ApiOperation({ summary: "Abre o comprovativo enviado" })
  async proofFile(
    @CurrentAccount() account: AccessTokenClaims,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return fileResponse(
      await this.readProof.execute({ accountId: account.accountId, paymentId: id }),
    );
  }
}
