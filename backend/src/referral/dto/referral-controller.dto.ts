import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { AnyQueryDto, EmptyDto, IdParamDto } from '../../common/dto/index.js';
import { CreateReferralDto, ReferralClaimParamDto, ReferralIdDto } from './referral.dto.js';

const route = controllerRouteDto.bind(null, 'ReferralController');

export const REFERRAL_CONTROLLER_DTO_DEFINITIONS = [
  route('referral.claim.read', 'GET', '/api/referrals/claim/:token', ReferralClaimParamDto),
  route('referral.create', 'POST', '/api/referrals', EmptyDto, AnyQueryDto, CreateReferralDto),
  route('referral.customer.list', 'GET', '/api/customers/me/referrals'),
  route('referral.salon.list', 'GET', '/api/salons/:id/referrals', IdParamDto),
  route('referral.redeem', 'POST', '/api/referrals/:id/redeem', ReferralIdDto),
] as const satisfies readonly ControllerDtoDefinition[];
