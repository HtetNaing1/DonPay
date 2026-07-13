import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  LoginInput,
  loginSchema,
  SignupInput,
  signupSchema,
} from '@donpay/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Merchant } from '../generated/prisma/client';
import {
  MerchantProfile,
  toMerchantProfile,
} from '../merchants/merchant-profile';
import { AuthService, SessionResponse } from './auth.service';
import { CurrentMerchant } from './current-merchant.decorator';
import { SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupInput,
  ): Promise<SessionResponse> {
    return this.authService.signup(body);
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
  ): Promise<SessionResponse> {
    return this.authService.login(body);
  }

  /** Session probe for the web app's Auth.js session callback. */
  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentMerchant() merchant: Merchant): MerchantProfile {
    return toMerchantProfile(merchant);
  }
}
