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

import type { AccessTokenClaims } from "../../application/ports/access-token-issuer.js";
import { AuthenticateUseCase } from "../../application/use-cases/authenticate.use-case.js";
import { ChangePasswordUseCase } from "../../application/use-cases/change-password.use-case.js";
import { GetCurrentAccountUseCase } from "../../application/use-cases/get-current-account.use-case.js";
import { RefreshSessionUseCase } from "../../application/use-cases/refresh-session.use-case.js";
import { RegisterAccountUseCase } from "../../application/use-cases/register-account.use-case.js";
import { SignOutUseCase } from "../../application/use-cases/sign-out.use-case.js";
import { UpdateProfileUseCase } from "../../application/use-cases/update-profile.use-case.js";
import { ZodValidationPipe } from "../../../../shared/presentation/http/zod-validation.pipe.js";
import { CurrentAccount } from "./decorators/current-account.decorator.js";
import {
  changePasswordSchema,
  loginSchema,
  profileSchema,
  refreshSchema,
  registerSchema,
  type ChangePasswordBody,
  type LoginBody,
  type ProfileBody,
  type RefreshBody,
  type RegisterBody,
} from "./dtos/auth.schemas.js";
import { AuthGuard } from "./guards/auth.guard.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly authenticate: AuthenticateUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly signOut: SignOutUseCase,
    private readonly currentAccount: GetCurrentAccountUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly changePassword: ChangePasswordUseCase,
  ) {}

  /** Cria a conta e devolve logo a sessão. */
  @Post("register")
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterBody,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.registerAccount.execute({ ...body, userAgent });
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginBody,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.authenticate.execute({ ...body, userAgent });
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshBody,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.refreshSession.execute({ ...body, userAgent });
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshBody) {
    await this.signOut.execute(body);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentAccount() account: AccessTokenClaims) {
    return this.currentAccount.execute({ accountId: account.accountId });
  }

  /** O próprio altera nome, telefone ou email. */
  @Patch("me")
  @UseGuards(AuthGuard)
  updateMe(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(profileSchema)) body: ProfileBody,
  ) {
    return this.updateProfile.execute({ ...body, accountId: account.accountId });
  }

  @Post("me/password")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async updatePassword(
    @CurrentAccount() account: AccessTokenClaims,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordBody,
  ) {
    await this.changePassword.execute({ ...body, accountId: account.accountId });
  }
}
