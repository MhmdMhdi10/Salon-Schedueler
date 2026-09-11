import { z } from 'zod';
import { AnyQueryDto, EmptyDto, controllerRouteDto, type ControllerDtoDefinition } from '../../common/dto/index.js';

const ScreenshotDto = z.object({
  name: z.string().trim().min(1).max(120),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataBase64: z.string().max(7_200_000),
});

export const SupportTicketCreateDto = z.object({
  message: z.string().trim().min(5).max(4000),
  page: z.string().trim().max(300).optional(),
  action: z.string().trim().max(300).optional(),
  errorCode: z.string().trim().max(120).optional(),
  browser: z.string().trim().max(120).optional(),
  device: z.string().trim().max(120).optional(),
  screenshot: ScreenshotDto.optional(),
}).passthrough();

const route = controllerRouteDto.bind(null, 'SupportController');
export const SUPPORT_CONTROLLER_DTO_DEFINITIONS = [
  route('support.ticket.create', 'POST', '/api/support/tickets', EmptyDto, AnyQueryDto, SupportTicketCreateDto),
  route('support.ticket.mine', 'GET', '/api/support/tickets/mine'),
] as const satisfies readonly ControllerDtoDefinition[];
