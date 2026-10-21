import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import type { AccessTokenClaims } from "../../application/ports/access-token-issuer.js";
import { AddOwnRoleUseCase } from "../../application/use-cases/add-own-role.use-case.js";
import { AuthenticateUseCase } from "../../application/use-cases/authenticate.use-case.js";
import { ChangePasswordUseCase } from "../../application/use-cases/change-password.use-case.js";
import { ConfirmRegistrationUseCase } from "../../application/use-cases/confirm-registration.use-case.js";
import { GetCurrentAccountUseCase } from "../../application/use-cases/get-current-account.use-case.js";
import { RefreshSessionUseCase } from "../../application/use-cases/refresh-session.use-case.js";
import { RequestPasswordResetUseCase } from "../../application/use-cases/request-password-reset.use-case.js";
import { RequestRegistrationUseCase } from "../../application/use-cases/request-registration.use-case.js";
import { ResetPasswordUseCase } from "../../application/use-cases/reset-password.use-case.js";
import { SignOutUseCase } from "../../application/use-cases/sign-out.use-case.js";
import { UpdateProfileUseCase } from "../../application/use-cases/update-profile.use-case.js";
import { ApiZodBody } from "../../../../shared/presentation/http/api-zod.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { CurrentAccount } from "./decorators/current-account.decorator.js";
import {
  addRoleSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyRegistrationSchema,
  type AddRoleBody,
  type ChangePasswordBody,
  type ForgotPasswordBody,
  type LoginBody,
  type ProfileBody,
  type RefreshBody,
  type RegisterBody,
  type ResetPasswordBody,
  type VerifyRegistrationBody,
} from "./dtos/auth.schemas.js";
import { AuthGuard } from "./guards/auth.guard.js";

@ApiTags("Conta")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly requestRegistration: RequestRegistrationUseCase,
    private readonly confirmRegistration: ConfirmRegistrationUseCase,
    private readonly requestPasswordReset: RequestPasswordResetUseCase,
    private readonly resetPassword: ResetPasswordUseCase,
    private readonly authenticate: AuthenticateUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly signOut: SignOutUseCase,
    private readonly currentAccount: GetCurrentAccountUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly addOwnRole: AddOwnRoleUseCase,
  ) {}

  /** Acrescenta um papel à própria conta (ex.: "também sou catequista"). */
  @Post("me/roles")
  @UseGuards(AuthGuard)
  addRole(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(addRoleSchema)) body: AddRoleBody,
  ) {
    return this.addOwnRole.execute({ accountId: account.accountId, role: body.role });
  }

  /** Envia o código de verificação para o email. A conta ainda não é criada. */
  @Post("register")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Envia o código de verificação do email" })
  @ApiZodBody(registerSchema)
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterBody) {
    return this.requestRegistration.execute(body);
  }

  /** Confirma o código e cria a conta. */
  @Post("register/verify")
  @ApiOperation({ summary: "Confirma o email e cria a conta" })
  @ApiZodBody(verifyRegistrationSchema)
  verify(
    @Body(new ZodValidationPipe(verifyRegistrationSchema)) body: VerifyRegistrationBody,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.confirmRegistration.execute({ ...body, userAgent });
  }

  @Post("password/forgot")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Pede a recuperação da palavra-passe" })
  @ApiZodBody(forgotPasswordSchema)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordBody,
  ) {
    await this.requestPasswordReset.execute(body);
  }

  @Post("password/reset")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Define uma nova palavra-passe a partir do email" })
  @ApiZodBody(resetPasswordSchema)
  async resetPasswordWithToken(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordBody,
  ) {
    await this.resetPassword.execute(body);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Entra com telefone ou email" })
  @ApiZodBody(loginSchema)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginBody,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.authenticate.execute({ ...body, userAgent });
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Renova a sessão" })
  @ApiZodBody(refreshSchema)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshBody,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.refreshSession.execute({ ...body, userAgent });
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Termina a sessão deste dispositivo" })
  @ApiZodBody(refreshSchema)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshBody) {
    await this.signOut.execute(body);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Conta autenticada" })
  me(@CurrentAccount() account: AccessTokenClaims) {
    return this.currentAccount.execute({ accountId: account.accountId });
  }

  /** O próprio altera nome, telefone ou email. */
  @Patch("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Altera nome, telefone ou email" })
  @ApiZodBody(profileSchema)
  updateMe(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(profileSchema)) body: ProfileBody,
  ) {
    return this.updateProfile.execute({ ...body, accountId: account.accountId });
  }

  @Post("me/password")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Muda a palavra-passe" })
  @ApiZodBody(changePasswordSchema)
  async updatePassword(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordBody,
  ) {
    await this.changePassword.execute({ ...body, accountId: account.accountId });
  }
}
