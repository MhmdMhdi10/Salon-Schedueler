import { controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';
import { BotSecretParamDto, BotUpdateDto } from './bot.dto.js';
import { AnyQueryDto } from '../../common/dto/index.js';

const route = controllerRouteDto.bind(null, 'BotController');

export const BOT_CONTROLLER_DTO_DEFINITIONS = [
  route('bot.telegram.webhook', 'POST', '/api/bots/telegram/:secret', BotSecretParamDto, AnyQueryDto, BotUpdateDto),
  route('bot.bale.webhook', 'POST', '/api/bots/bale/:secret', BotSecretParamDto, AnyQueryDto, BotUpdateDto),
] as const satisfies readonly ControllerDtoDefinition[];
